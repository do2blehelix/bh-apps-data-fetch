// Upstream access for the jobs.
// Every call to a public API made by the proxy or the snapshot job goes through upstream(): per-source token bucket
// and parallel cap (limits from js/sources.js), daily budgets that survive restarts, Retry-After backoff on 429/503,
// merged in-flight requests, and a disk cache kept outside the Box folder. API keys and the contact email are added
// here, from environment variables or ~/.mip/.env, so they never reach the browser or the synced folder.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { SOURCES } = require('../js/sources.js');
export { SOURCES };

export const HOME = process.env.MIP_HOME || path.join(os.homedir(), '.mip');
const CACHE_DIR = path.join(HOME, 'cache');
const USAGE_FILE = path.join(HOME, 'usage.json');
fs.mkdirSync(CACHE_DIR, { recursive: true });

loadEnv(process.env.MIP_ENV_FILE || path.join(HOME, '.env'));
function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}
export const CONTACT = process.env.MIP_CONTACT_EMAIL || '';
const UA = process.env.MIP_USER_AGENT || `bh-apps-fetch/1.0${CONTACT ? ` (${CONTACT})` : ''}`;

const keyOf = (src) => (src.key && process.env[src.key.env]) || '';
export function limits(src) {
  const k = !!keyOf(src);
  return { rpm: (k && src.rpmKeyed) || src.rpm, burst: src.burst || 1, conc: src.conc || 1, day: k ? src.dayKeyed || null : src.day || null, keyed: k };
}

/* ---------- Daily usage, persisted so restarts do not reset budgets ---------- */
const today = () => new Date().toISOString().slice(0, 10);
let usage = { date: today(), counts: {} };
try { const u = JSON.parse(fs.readFileSync(USAGE_FILE, 'utf8')); if (u.date === today()) usage = u; } catch { /* first run */ }
let usageTimer = null;
function countCall(key) {
  if (usage.date !== today()) usage = { date: today(), counts: {} };
  usage.counts[key] = (usage.counts[key] || 0) + 1;
  if (!usageTimer) usageTimer = setTimeout(() => { usageTimer = null; fs.writeFile(USAGE_FILE, JSON.stringify(usage), () => {}); }, 1000);
}
const usedToday = (key) => (usage.date === today() ? usage.counts[key] || 0 : 0);
const msToMidnightUTC = () => { const n = new Date(); return Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() + 1) - n.getTime(); };

/* ---------- Token bucket queue, one per source ---------- */
const ST = {};
function st(key) {
  return ST[key] || (ST[key] = { tokens: limits(SOURCES[key]).burst, last: Date.now(), active: 0, queue: [], timer: null, cooldownUntil: 0, calls: 0, hits: 0, stale: 0, throttled: 0, errors: 0, lastStatus: null, lastAt: null, lastError: null });
}
function pump(key) {
  const s = st(key); if (s.timer) return;
  while (s.queue.length) {
    const l = limits(SOURCES[key]), now = Date.now();
    if (s.cooldownUntil > now) { s.timer = setTimeout(() => { s.timer = null; pump(key); }, s.cooldownUntil - now); return; }
    if (s.active >= l.conc) return;
    s.tokens = Math.min(l.burst, s.tokens + ((now - s.last) * l.rpm) / 60000); s.last = now;
    if (s.tokens < 1) { s.timer = setTimeout(() => { s.timer = null; pump(key); }, Math.ceil(((1 - s.tokens) * 60000) / l.rpm)); return; }
    s.tokens -= 1; s.active++;
    const job = s.queue.shift();
    job().finally(() => { s.active--; pump(key); });
  }
}
const schedule = (key, fn) => new Promise((res, rej) => { st(key).queue.push(() => fn().then(res, rej)); pump(key); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function retryAfterMs(h, attempt) {
  const n = Number(h); if (h != null && !Number.isNaN(n)) return Math.max(1000, n * 1000);
  const d = h ? Date.parse(h) : NaN; if (!Number.isNaN(d)) return Math.max(1000, d - Date.now());
  return 2000 * 2 ** attempt;
}

/* ---------- Cache: memory for recent entries, disk for everything ---------- */
const mem = new Map();
const MEM_MAX = 200;
const cacheFile = (ck) => path.join(CACHE_DIR, ck + '.json');
function cacheGet(ck) {
  if (mem.has(ck)) return mem.get(ck);
  try { const e = JSON.parse(fs.readFileSync(cacheFile(ck), 'utf8')); remember(ck, e); return e; } catch { return null; }
}
function remember(ck, e) { mem.delete(ck); mem.set(ck, e); if (mem.size > MEM_MAX) mem.delete(mem.keys().next().value); }
function cachePut(ck, e) { remember(ck, e); fs.writeFile(cacheFile(ck), JSON.stringify(e), () => {}); }

/* The public URL plus the proxy's own parameters (keys, contact email). Appended raw so the caller's query is kept exactly. */
function targetUrl(src, rest) {
  if (rest && !/^[/?]/.test(rest)) throw Object.assign(new Error('Bad path'), { status: 400 });
  const url = src.base + (rest || '');
  if (new URL(url).origin !== new URL(src.base).origin) throw Object.assign(new Error('Bad path'), { status: 400 });
  const add = [];
  const key = keyOf(src);
  if (key && src.key.param) add.push([src.key.param, key]);
  if (CONTACT && src.contact) { add.push([src.contact.param, CONTACT]); if (src.contact.tool) add.push(['tool', 'mip']); }
  return add.length ? url + (url.includes('?') ? '&' : '?') + add.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&') : url;
}

async function send(key, rest, attempt = 0, binary = false) {
  const src = SOURCES[key], s = st(key);
  const headers = { Accept: src.accept || 'application/json', 'User-Agent': UA };
  const k = keyOf(src); if (k && src.key.header) headers[src.key.header] = k;
  countCall(key); s.calls++;
  let url = targetUrl(src, rest); const init = { headers, signal: src.timeoutS ? AbortSignal.timeout(src.timeoutS * 1000) : undefined };
  // A POST-only source (js/sources.js `post`): the named query parameter carries the JSON body.
  if (src.post) { const u = new URL(url); init.method = 'POST'; init.body = u.searchParams.get(src.post) || '{}'; u.searchParams.delete(src.post); url = u.toString(); headers['Content-Type'] = 'application/json'; }
  const r = await fetch(url, init);
  s.lastStatus = r.status; s.lastAt = Date.now();
  if (r.status === 429 || r.status === 503) {
    const wait = retryAfterMs(r.headers.get('retry-after'), attempt); s.throttled++; s.cooldownUntil = Date.now() + wait;
    if (attempt < 2 && wait <= 60000) { await sleep(wait); return send(key, rest, attempt + 1, binary); }
  }
  return { status: r.status, type: r.headers.get('content-type') || 'application/json', body: binary ? Buffer.from(await r.arrayBuffer()) : await r.text(), retryAfter: r.headers.get('retry-after') };
}
function budgetError(src, l) {
  return Object.assign(new Error(`Daily budget reached for ${src.name} (${l.day} calls${l.keyed ? '' : ' without a key'}).`), { status: 429, retryAfterS: Math.ceil(msToMidnightUTC() / 1000) });
}

const inflight = new Map();
/* Fetch rest (path and query below the source's base) for source key.
   opts.maxAgeMs  cache lifetime (default: the source's ttlH)    opts.swr  serve a stale copy now and refresh behind it
   opts.binary    the body as a Buffer (data files such as zips; cached as base64)
   opts.noStore   keep the answer out of the disk cache (large one-off documents a job keeps its own ledger for)
   Resolves to { status, type, body, cache: 'hit' | 'stale' | 'miss' }. */
export async function upstream(key, rest, opts = {}) {
  const src = SOURCES[key];
  if (!src) throw Object.assign(new Error('Unknown source ' + key), { status: 404 });
  const s = st(key), ck = crypto.createHash('sha1').update(key + ' ' + rest).digest('hex');
  const maxAge = opts.maxAgeMs ?? src.ttlH * 3600000;
  const hit0 = opts.noStore ? null : cacheGet(ck), hit = hit0 && opts.binary && hit0.b64 ? { ...hit0, body: Buffer.from(hit0.body, 'base64') } : hit0, fresh = hit && Date.now() - hit.at < maxAge;
  // A cached answer counts as a status until the first upstream call, so /health shows sources served from cache.
  if (fresh) { s.hits++; if (s.lastStatus == null) s.lastStatus = hit.status; return { ...hit, cache: 'hit' }; }
  const run = () => {
    if (inflight.has(ck)) return inflight.get(ck);
    const l = limits(src);
    if (l.day && usedToday(key) >= l.day) return Promise.reject(budgetError(src, l));
    // Checked again when the request leaves the queue, so a long queue cannot overshoot the cap.
    const p = schedule(key, async () => { if (l.day && usedToday(key) >= l.day) throw budgetError(src, l); return send(key, rest, 0, !!opts.binary); }).then((r) => {
      if ((r.status >= 200 && r.status < 300) || r.status === 404) { if (!opts.noStore) cachePut(ck, Buffer.isBuffer(r.body) ? { at: Date.now(), status: r.status, type: r.type, body: r.body.toString('base64'), b64: true } : { at: Date.now(), status: r.status, type: r.type, body: r.body }); s.lastError = null; }
      else { s.errors++; s.lastError = 'HTTP ' + r.status; }
      return r;
    }, (e) => { s.errors++; s.lastError = String(e.message || e); throw e; });
    inflight.set(ck, p); p.then(() => inflight.delete(ck), () => inflight.delete(ck));
    return p;
  };
  if (hit && opts.swr) { s.stale++; run().catch(() => {}); return { ...hit, cache: 'stale' }; }
  try {
    const r = await run();
    if (r.status >= 500 && hit) { s.stale++; return { ...hit, cache: 'stale' }; }
    return { ...r, cache: 'miss' };
  } catch (e) {
    if (hit) { s.stale++; return { ...hit, cache: 'stale' }; }
    throw e;
  }
}

export function stats() {
  const out = {};
  for (const [key, src] of Object.entries(SOURCES)) {
    const s = ST[key] || {}, l = limits(src);
    out[key] = { name: src.name, cors: src.cors, rpm: l.rpm, day: l.day, keyed: l.keyed, calls_today: usedToday(key), calls: s.calls || 0, cache_hits: s.hits || 0, stale: s.stale || 0, throttled: s.throttled || 0, errors: s.errors || 0, queued: s.queue ? s.queue.length : 0, active: s.active || 0, last_status: s.lastStatus ?? null, last_error: s.lastError ?? null, cooling_s: s.cooldownUntil > Date.now() ? Math.ceil((s.cooldownUntil - Date.now()) / 1000) : 0 };
  }
  return out;
}
