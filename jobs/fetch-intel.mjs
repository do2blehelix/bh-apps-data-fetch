#!/usr/bin/env node
// Intel job: competitor news, regulator newsrooms, company disclosures, and the details an LLM reads out of them.
//   node jobs/fetch-intel.mjs                   run if the last run is older than MIP_INTEL_INTERVAL_MIN (default 360)
//   node jobs/fetch-intel.mjs --force           run now
//   node jobs/fetch-intel.mjs --only=news,sec   run some parts: news, feeds, trade, sec, tag, web, hta, extract
//
// Writes data/intel.js (window.MIP_INTEL), which the app loads like data/snapshot.js.
//
// What it watches: every asset and indication of every therapeutic area in js/catalog.js (with the reviewed updates),
// so any watchlist finds its records; the app shows each user the records about their own watchlist. The names searched
// come from each catalog entry (US brand, INN, development codes). Feeds and HTA agencies: data/intel-queries.js.
//
// Where the documents come from (no LLM needed):
//   news   GDELT DOC 2.0: headlines that name a catalog asset, the last 60 days kept (at most NEWS_PER_ASSET per asset).
//          GDELT is free for any use, commercial included, with a citation; the free tiers of NewsAPI, GNews, NewsData,
//          Currents and the Google News feed all exclude commercial use, so they are not used. GDELT allows one call
//          every 5 seconds, too slow for every asset in one run, so each run asks for the assets not covered in the last
//          NEWS_DUE_H hours, oldest first, several per query, each window starting where the asset's last answered
//          query ended. A failed call is retried after 10 and 30 seconds; a refusal (HTTP 429) that persists ends the
//          part, and the assets not reached are first in line next run. An asset whose headlines fill a whole answer
//          (a big brand) is asked alone from then on, so it cannot crowd out the others.
//   feeds  Regulator newsrooms (FDA, EMA, MHRA; RSS and Atom): items whose title or summary names a catalog asset, or
//          whose title names a catalog indication, kept REG_KEEP_DAYS with the title, date, link and the feed's own
//          summary. Items that name an asset are read for milestones too.
//   trade  Pharma trade-press feeds (RSS, data/intel-queries.js): items whose headline or summary names a catalog asset
//          join the news headlines with their publication named. The summary is kept only until the item is labelled,
//          since the labelling reads it where the headline names the company rather than the drug.
//   sec    SEC EDGAR full-text search: 8-K and 6-K press releases (EX-99 exhibits) filed by each asset's own sponsor
//          (the catalog's sponsor pattern on the filer name), each asset once a day, oldest first. The SEC requires a
//          declared contact, so this part runs only when CONTACT_EMAIL is set.
//   web    Google Search grounding, when the key's free tier offers it (gemini-2.5-flash / flash-lite): the pages it
//          cites for each asset's regulatory news (weekly) and for HTA decisions on marketed assets (every two weeks),
//          oldest first. The job fetches those pages itself; the model's own answer is not used.
//
// What the LLM does (Gemini, LLM_API_KEY; model ladder in jobs/gemini.mjs):
//   tag      labels each new headline: is it about the asset, which event (approval, filing, readout, launch...),
//            which indication. An asset label stands only if the headline names the asset.
//   extract  reads each new filing, article, regulator release or page once and lists dated milestones (approvals,
//            filings, action dates, CRLs, discontinuations, topline results, launches) or HTA decisions. Every item
//            must carry a sentence copied from the document; the job checks that sentence against the text it fetched
//            and drops the item if it is not there, if the asset is not named, or if the date does not fit the
//            document. Nothing is summarised for display: the app shows the extracted fields, the quote and the link.
// Filed and Discontinued events feed the pipeline landscape through proxy/refresh-snapshot.mjs (curated entries win).
//
// Each document is read once (the ledger in data/intel.js), so the daily LLM use is the new documents only. When
// every model has used its free quota, the rest waits in the queue for the next run. MIP_INTEL_MAX_MIN (default 12)
// caps the LLM time per run, counted from the first LLM task (after news, feeds and filings), and MIP_INTEL_MAX_DOCS
// (default 30) the documents read per run.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { upstream, CONTACT } from './upstream.mjs';
import { createGemini, LlmError } from './gemini.mjs';

const require = createRequire(import.meta.url);
const CAT = require('../js/catalog.js');
const { INTEL_FEEDS, INTEL_TRADE_FEEDS = [], INTEL_HTA_AGENCIES } = require('../data/intel-queries.js');
const { match } = require('../js/sources.js');
const { decode, titleCase, termsOf, newsWordsOf, termRe, parseFeed } = require('../js/intel-match.js'); // shared with the browser

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '..', 'data', 'intel.js');
const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const ONLY = (args.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const part = (p) => !ONLY.length || ONLY.includes(p);
const num = (v, d) => (Number(v) > 0 ? Number(v) : d);
const INTERVAL_MIN = num(process.env.MIP_INTEL_INTERVAL_MIN, 360);
const MAX_MIN = num(process.env.MIP_INTEL_MAX_MIN, 12);
const MAX_DOCS = num(process.env.MIP_INTEL_MAX_DOCS, 30);
const SEC_BACKFILL_DAYS = num(process.env.MIP_INTEL_SEC_BACKFILL_DAYS, 365);
const NEWS_QUERIES = num(process.env.MIP_INTEL_NEWS_QUERIES, 24);   // GDELT queries per run
const SEC_ASSETS = num(process.env.MIP_INTEL_SEC_ASSETS, 80);       // assets searched on EDGAR per run
const NEWS_KEEP_DAYS = 60, NEWS_PER_ASSET = 20, NEWS_CAP = 2500, NEWS_NOISE_DAYS = 10, LEDGER_KEEP_DAYS = 800;
const NEWS_DUE_H = num(process.env.MIP_INTEL_NEWS_DUE_H, 20), NEWS_MAX_MIN = 6, NEWS_WORDS = 10, NEWS_MAX = 250, NEWS_SKIP_DAYS = 7;
const REG_KEEP_DAYS = 180, REG_CAP = 800, SEC_MAX_MIN = 4, TAG_BATCHES = 25, MAX_CANDS = 12;
const WEB_EVERY_DAYS = 7, HTA_EVERY_DAYS = 14, WEB_PER_RUN = 6, HTA_PER_RUN = 2, URLS_PER_SEARCH = 6;
const EXCERPT_CHARS = 14000;

const now = new Date(), t0 = Date.now();
const isoDay = (d) => new Date(d).toISOString().slice(0, 10);
const TODAY = isoDay(now);
const daysAgo = (n) => isoDay(now.getTime() - n * 864e5);
const sha = (s) => crypto.createHash('sha1').update(String(s)).digest('hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);
const uniq = (a) => Array.from(new Set(a.filter(Boolean)));
const byDateDesc = (a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : 0);

/* ---------- What is watched: every catalog area, merged (indication ids as CAT.indsFromAll maps them back) ---------- */
const ALL = CAT.merge(CAT.allIds());
const IND = Object.fromEntries(ALL.inds.map((i) => [i.id, i]));
const WATCH = ALL.assets.map((x) => CAT.asset(x)).map((a) => ({
  asset: a.id, name: a.name + (a.brand ? ' (' + titleCase(a.brand) + ')' : ''), company: a.company || '', terms: termsOf(a), news: newsWordsOf(a),
  sponsor: a.sponsor && a.sponsor !== '.' ? a.sponsor : null, inds: a.inds || [], marketed: !!a.brand, ext: !!a.ext
})).filter((w) => w.terms.length);
const W = Object.fromEntries(WATCH.map((w) => [w.asset, w]));
const ASSET_RE = Object.fromEntries(WATCH.map((w) => [w.asset, termRe(w.terms)]));
/* Whether a text names an indication: the catalog pattern, or its name (and, in documents, its synonyms) as whole words. */
const IND_NAME = Object.fromEntries(ALL.inds.map((i) => [i.id, termRe([i.name])]));
const IND_SYN = Object.fromEntries(ALL.inds.map((i) => { const w = uniq([i.short].concat(i.syn || [])).filter((s) => s.length >= 5); return [i.id, w.length ? termRe(w) : null]; }));
const indInTitle = (k, s) => !!IND[k] && ((IND[k].re && IND[k].re.test(s)) || IND_NAME[k].test(s));
const indNamed = (k, s) => indInTitle(k, s) || !!(IND_SYN[k] && IND_SYN[k].test(s));
const indsFor = (assets) => uniq(assets.flatMap((a) => (W[a] ? W[a].inds : []))).filter((k) => IND[k]);
const indLines = (ids) => ids.map((k) => `${k} = ${IND[k].name.toLowerCase()}`).join('; ') + (ids.length ? '; ' : '') + 'all = every indication of the drug';
log(`Watching ${WATCH.length} assets and ${ALL.inds.length} indications in ${CAT.allIds().length} areas (${WATCH.filter((w) => w.news.length).length} searchable in GDELT, ${WATCH.filter((w) => w.sponsor).length} with a sponsor pattern)`);

/* ---------- Previous output: the ledger of documents read, the queue, news, regulator items and events so far ---------- */
function readPrev() {
  try { const ctx = { window: {} }; vm.runInNewContext(fs.readFileSync(OUT, 'utf8'), ctx); if (ctx.window.MIP_INTEL) return ctx.window.MIP_INTEL; } catch { /* first run */ }
  return {};
}
const prev = readPrev();
if (!FORCE && !ONLY.length && prev.generated_utc && now - new Date(prev.generated_utc) < INTERVAL_MIN * 60000) {
  log(`Intel last ran ${prev.generated_utc}; next run due after ${INTERVAL_MIN} minutes. Nothing to do (--force to run now).`);
  process.exit(0);
}
const status = {}; ['news', 'feeds', 'trade', 'sec', 'web'].forEach((k) => { status[k] = (prev.sources && prev.sources[k]) || null; });
/* Per-asset bookkeeping: news_at (last answered GDELT query), news_solo (asked alone), news_skip (refused alone),
   sec_at (last EDGAR day), web and hta (last search day). */
const runs = Object.assign({}, prev.runs || {});
['web', 'hta', 'news_at', 'news_solo', 'news_skip', 'sec_at'].forEach((k) => { runs[k] = Object.assign({}, runs[k]); Object.keys(runs[k]).forEach((a) => { if (!W[a]) delete runs[k][a]; }); });
Object.keys(runs.news_solo).forEach((a) => { if (runs.news_solo[a] < daysAgo(30)) delete runs.news_solo[a]; }); // packed with others again after a month
delete runs.sec_through;
const docs = Object.assign({}, prev.docs || {});            // ledger: id -> { t, u, d, k, p, s, n, m, at, e, tries }
let pending = (prev.pending || []).slice();                  // documents found but not read yet
const queued = new Map(pending.map((d) => [d.id, d]));
function enqueue(d) {
  const led = docs[d.id]; if (led && !(led.s === 'failed' && (led.tries || 0) < 3)) return false;
  const q = queued.get(d.id);
  if (q) { q.assets = Array.from(new Set(q.assets.concat(d.assets))); return false; }
  queued.set(d.id, d); pending.push(d); return true;
}

/* ---------- Registered sources, through the dev proxy when it runs (one limiter, one set of daily counts) ---------- */
const PROXY = `http://127.0.0.1:${Number(process.env.MIP_PROXY_PORT) || 8787}`;
const VIA_PROXY = await fetch(PROXY + '/health', { signal: AbortSignal.timeout(800) }).then((r) => r.json()).then((j) => j && j.mip === 'dev-proxy', () => false);
log(VIA_PROXY ? `Using the dev proxy at ${PROXY}` : 'Dev proxy not running: calling the sources directly, with the same limits');
async function fetchVia(key, rest, maxAgeS) {
  if (!VIA_PROXY) return upstream(key, rest, { maxAgeMs: maxAgeS * 1000 });
  const r = await fetch(PROXY + '/src/' + key + rest, { headers: { 'X-MIP-Client': 'fetch-intel', 'X-MIP-Max-Age': String(maxAgeS) } });
  return { status: r.status, body: await r.text() };
}
async function getText(url, maxAgeS = 3600) {
  const m = match(url); if (!m) throw new Error('No source registered for ' + url);
  const r = await fetchVia(m.key, m.path, maxAgeS);
  if (r.status < 200 || r.status >= 300) throw Object.assign(new Error(`HTTP ${r.status} from ${m.key}: ${String(r.body).replace(/\s+/g, ' ').slice(0, 160)}`), { status: r.status });
  return r.body;
}
/* Any other public page (articles and pages found by web search): one at a time, a pause between pages. */
const PAGE_UA = `Mozilla/5.0 (compatible; bh-apps-data-fetch/1.0${CONTACT ? '; ' + CONTACT : ''})`;
let lastPage = 0;
async function fetchPage(url) {
  const wait = lastPage + 1500 - Date.now(); if (wait > 0) await sleep(wait); lastPage = Date.now();
  const r = await fetch(url, { headers: { 'User-Agent': PAGE_UA, Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9', 'Accept-Language': 'en' }, redirect: 'follow', signal: AbortSignal.timeout(25000) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const type = (r.headers.get('content-type') || '').split(';')[0];
  if (type && !/html|text\/plain|xml/i.test(type)) throw new Error('not a web page (' + type + ')');
  const buf = Buffer.from(await r.arrayBuffer());
  return { html: buf.subarray(0, 4e6).toString('utf8'), finalUrl: r.url || url };
}

/* ---------- HTML to text, excerpts, and the quote check ---------- */
function htmlToText(html) {
  return decode(String(html)
    .replace(/<(head|script|style|noscript|svg|template|iframe)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/tr|\/h[1-6]|\/table|\/section|\/article|\/blockquote)\b[^>]*>/gi, '\n')
    .replace(/<\/t[dh]>/gi, ' \t ')
    .replace(/<[^>]+>/g, ' '))
    .replace(/[ \t ​]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
function pageTitle(html) { const m = String(html).match(/<title[^>]*>([\s\S]*?)<\/title>/i); return m ? decode(m[1]).replace(/\s+/g, ' ').trim().slice(0, 240) : ''; }
/* The lead of the document plus the passages around each mention of the given names, up to max characters. */
function excerpt(text, re, max = EXCERPT_CHARS) {
  if (text.length <= max) return text;
  const g = new RegExp(re.source, 'gi'), spans = [[0, 2500]];
  let m; while ((m = g.exec(text)) && spans.length < 80) spans.push([Math.max(0, m.index - 1200), m.index + 1500]);
  spans.sort((a, b) => a[0] - b[0]);
  const merged = []; for (const s of spans) { const l = merged[merged.length - 1]; if (l && s[0] <= l[1]) l[1] = Math.max(l[1], s[1]); else merged.push(s.slice()); }
  let out = ''; for (const [a, b] of merged) { const piece = text.slice(a, b); if (out.length + piece.length > max) { out += (out ? '\n[…]\n' : '') + piece.slice(0, max - out.length); break; } out += (out ? '\n[…]\n' : '') + piece; }
  return out;
}
const norm = (s) => String(s || '').normalize('NFKC').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
/* The quote must appear in the document (after lower-casing and dropping punctuation); "…" may join pieces of it. */
function quoteIn(quote, normDoc) {
  const parts = String(quote || '').split(/\.\.\.|…|\[…\]|\[\.\.\.\]/).map(norm).filter((p) => p.length >= 12);
  return parts.length > 0 && parts.reduce((n, p) => n + p.length, 0) >= 25 && parts.every((p) => normDoc.includes(p));
}

/* ---------- Dates the model may return, as a sortable day plus a precision ---------- */
const pad = (n) => String(n).padStart(2, '0');
function parseWhen(s) {
  s = String(s || '').trim(); let m;
  const ok = (d) => !Number.isNaN(Date.parse(d + 'T00:00:00Z'));
  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)) && ok(s)) return { date: s, precision: 'day', end: s };
  if ((m = s.match(/^(\d{4})-(\d{2})$/)) && +m[2] >= 1 && +m[2] <= 12) return { date: s + '-15', precision: 'month', end: isoDay(Date.UTC(+m[1], +m[2], 0)), label: s };
  if ((m = s.match(/^(\d{4})-?Q([1-4])$/i))) return { date: `${m[1]}-${pad(3 * m[2] - 1)}-15`, precision: 'quarter', end: isoDay(Date.UTC(+m[1], 3 * m[2], 0)), label: `Q${m[2]} ${m[1]}` };
  if ((m = s.match(/^(\d{4})-?H([12])$/i))) return { date: `${m[1]}-${m[2] === '1' ? '04' : '10'}-01`, precision: 'half', end: `${m[1]}-${m[2] === '1' ? '06-30' : '12-31'}`, label: `H${m[2]} ${m[1]}` };
  if ((m = s.match(/^(\d{4})$/))) return { date: `${m[1]}-07-01`, precision: 'year', end: `${m[1]}-12-31`, label: m[1] };
  return null;
}
const addDays = (day, n) => isoDay(Date.parse(day + 'T00:00:00Z') + n * 864e5);

/* =========================================================
   1. News: GDELT DOC 2.0, headlines that name a catalog asset
   ========================================================= */
let news = (prev.news || []).filter((n) => n.date >= daysAgo(NEWS_KEEP_DAYS));
const gdeltWord = (t) => (/\s/.test(t) ? `"${t}"` : t);
/* Up to three tries: a network error, a timeout or a server error waits 10 and then 30 seconds. HTTP 429 (after the
   source's own Retry-After waits in upstream.mjs) waits a minute once; a second 429 ends the news part for this run. */
async function gdelt(url) {
  let last = null;
  for (let i = 0; i < 3; i++) {
    try { return await getText(url, 3600); }
    catch (e) {
      last = e;
      if (e.status === 429) { if (i) throw Object.assign(e, { blocked: true }); log('gdelt     throttled, waiting 60 s'); await sleep(60000); continue; }
      if (e.status && e.status < 500) throw e; // the query itself was refused
      if (i < 2) { const w = i ? 30000 : 10000; log(`gdelt     ${e.message}; trying again in ${w / 1000} s`); await sleep(w); }
    }
  }
  throw last;
}
/* The queries of this run: assets not covered in the last NEWS_DUE_H hours, longest waiting first, packed up to NEWS_WORDS
   search words per query; an asset marked solo gets a query of its own. */
function newsPlan() {
  const due = WATCH.filter((w) => w.news.length && !(runs.news_skip[w.asset] >= daysAgo(NEWS_SKIP_DAYS)) && (!runs.news_at[w.asset] || now - Date.parse(runs.news_at[w.asset]) > NEWS_DUE_H * 3600e3))
    .sort((a, b) => (a.ext ? 1 : 0) - (b.ext ? 1 : 0) || String(runs.news_at[a.asset] || '').localeCompare(String(runs.news_at[b.asset] || '')));
  const groups = []; let cur = null, words = 0;
  for (const w of due) {
    if (runs.news_solo[w.asset]) { groups.push([w]); continue; }
    if (!cur || words + w.news.length > NEWS_WORDS) { cur = []; words = 0; groups.push(cur); }
    cur.push(w); words += w.news.length;
  }
  return { due: due.length, groups: groups.slice(0, NEWS_QUERIES) };
}
/* The window of a query: from the oldest last-answered time in the group (two hours' overlap), or 30 days for an asset never asked. */
function newsSpan(grp) {
  const oldest = Math.min(...grp.map((w) => (runs.news_at[w.asset] ? Date.parse(runs.news_at[w.asset]) : 0)));
  if (!oldest) return '30d';
  const h = Math.ceil((now - oldest) / 3600e3) + 2;
  return h > 72 ? Math.min(30, Math.ceil(h / 24)) + 'd' : h + 'h';
}
async function runNews() {
  const plan = newsPlan(), stopAt = Date.now() + NEWS_MAX_MIN * 60000;
  const byId = new Map(news.map((n) => [n.id, n])), byTitle = new Map(news.map((n) => [norm(n.title), n]));
  let added = 0, answered = 0, failed = 0, covered = 0, lastErr = null, blocked = false;
  for (const grp of plan.groups) {
    if (blocked || Date.now() > stopAt) break;
    const words = grp.flatMap((w) => w.news).map(gdeltWord);
    const query = (words.length > 1 ? `(${words.join(' OR ')})` : words[0]) + ' sourcelang:english';
    const url = 'https://api.gdeltproject.org/api/v2/doc/doc?' + new URLSearchParams({ query, mode: 'artlist', format: 'json', maxrecords: String(NEWS_MAX), timespan: newsSpan(grp), sort: 'datedesc' });
    let body;
    try { body = await gdelt(url); }
    catch (e) { failed++; lastErr = e.message; if (e.blocked) blocked = true; log(`gdelt     ${grp.map((w) => w.asset).join(', ')}: ${e.message}`); continue; }
    let j; try { j = JSON.parse(body); }
    catch {
      // GDELT answers a query it cannot run with a line of text: its assets are asked one by one next time, and an asset
      // refused on its own is set aside for a week.
      failed++; lastErr = 'GDELT answered: ' + String(body).replace(/\s+/g, ' ').slice(0, 140);
      for (const w of grp) { if (grp.length > 1) runs.news_solo[w.asset] = TODAY; else runs.news_skip[w.asset] = TODAY; }
      log(`gdelt     ${grp.map((w) => w.asset).join(', ')}: ${lastErr}`); continue;
    }
    answered++;
    const arts = j.articles || [], hits = {};
    for (const a of arts) {
      const title = decode(String(a.title || '')).replace(/\s+/g, ' ').trim(); if (!title || !a.url) continue;
      const assets = WATCH.filter((w) => ASSET_RE[w.asset].test(title)).map((w) => w.asset);
      if (!assets.length) continue; // the article matched in its body only; keep headlines that name the asset
      assets.forEach((x) => { hits[x] = (hits[x] || 0) + 1; });
      const id = 'gd:' + sha(a.url).slice(0, 16), nt = norm(title);
      if (byId.has(id)) continue;
      const twin = byTitle.get(nt); if (twin) { twin.also = (twin.also || 0) + 1; continue; }
      const sd = String(a.seendate || '');
      const item = { id, title: title.slice(0, 300), url: a.url, domain: a.domain || '', country: a.sourcecountry || '', date: sd.length >= 8 ? `${sd.slice(0, 4)}-${sd.slice(4, 6)}-${sd.slice(6, 8)}` : TODAY, match: assets, tags: null };
      news.push(item); byId.set(id, item); byTitle.set(nt, item); added++;
    }
    for (const w of grp) { runs.news_at[w.asset] = now.toISOString(); covered++; }
    // A full answer means the window held more than GDELT returns: the asset with the most headlines is asked alone from now on.
    if (arts.length >= NEWS_MAX && grp.length > 1) { const top = grp.map((w) => w.asset).sort((x, y) => (hits[y] || 0) - (hits[x] || 0))[0]; if (hits[top]) { runs.news_solo[top] = TODAY; log(`gdelt     ${top} filled the answer; asked alone from now on`); } }
  }
  const searchable = WATCH.filter((w) => w.news.length), fresh = searchable.filter((w) => runs.news_at[w.asset] && now - Date.parse(runs.news_at[w.asset]) < 36 * 3600e3).length;
  status.news = { source: 'GDELT DOC 2.0', at: now.toISOString(), ok: answered > 0 || !plan.groups.length, queries: plan.groups.length, answered, failed, added, kept: news.length, assets: searchable.length, due: plan.due, covered, fresh, error: failed ? lastErr : null };
  log(`gdelt     ${answered}/${plan.groups.length} queries answered for ${covered} of ${plan.due} assets due, ${added} new headlines naming an asset, ${fresh}/${searchable.length} assets covered in the last 36 h${failed ? ' · ' + lastErr : ''}`);
}
/* Headlines kept: the last 60 days, at most NEWS_PER_ASSET per asset (newest first; a headline counts for every asset it
   names). Those labelled not relevant stay NEWS_NOISE_DAYS only, so a repeat is not labelled twice. */
function pruneNews() {
  const per = {}, keep = [];
  for (const n of news.sort(byDateDesc)) {
    delete n.seen_utc; if (n.tags) { delete n.match; delete n.summary; } // a trade-press summary served the labelling only
    if (n.date < daysAgo(NEWS_KEEP_DAYS)) continue;
    if (n.tags && !n.tags.relevant) { if (n.date >= daysAgo(NEWS_NOISE_DAYS)) keep.push(n); continue; }
    const as = n.tags ? n.tags.assets : n.match || [];
    if (!as.some((a) => (per[a] || 0) < NEWS_PER_ASSET)) continue;
    as.forEach((a) => { per[a] = (per[a] || 0) + 1; }); keep.push(n);
  }
  news = keep.slice(0, NEWS_CAP);
}

/* =========================================================
   2. Regulator newsrooms: RSS and Atom feeds (data/intel-queries.js)
   ========================================================= */
let reg = (prev.reg || []).slice();
async function fetchFeed(url) {
  let last = null;
  for (let i = 0; i < 2; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': PAGE_UA, Accept: 'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8' }, redirect: 'follow', signal: AbortSignal.timeout(30000) });
      if (!r.ok) throw Object.assign(new Error('HTTP ' + r.status), { status: r.status });
      const t = await r.text(); if (!/<(rss|feed|rdf:RDF)\b/i.test(t)) throw new Error('the answer is not a feed');
      return t;
    } catch (e) { last = e; if (e.status && e.status < 500 && e.status !== 429) break; if (!i) await sleep(5000); }
  }
  throw last;
}
async function runFeeds() {
  const byUrl = new Map(reg.map((r) => [r.url, r])), by = {};
  let added = 0, failed = 0, lastErr = null;
  for (const f of INTEL_FEEDS) {
    let items;
    try { items = parseFeed(await fetchFeed(f.url)); }
    catch (e) { failed++; lastErr = `${f.name}: ${e.message}`; by[f.id] = { ok: false }; log(`feeds     ${f.id.padEnd(14)} ${e.message}`); continue; }
    const strip = f.strip ? new RegExp(f.strip, 'i') : null;
    let kept = 0, fresh = 0;
    for (const it of items) {
      const title = (strip ? it.title.replace(strip, '') : it.title).slice(0, 300); if (!title || !it.link) continue;
      const summary = clip(it.summary, 400), text = title + '\n' + summary;
      const assets = WATCH.filter((w) => ASSET_RE[w.asset].test(text)).map((w) => w.asset);
      const inds = ALL.inds.filter((i) => indInTitle(i.id, title)).map((i) => i.id);
      if (!assets.length && !inds.length) continue;
      kept++;
      const cur = byUrl.get(it.link);
      if (cur) { Object.assign(cur, { title, summary, assets, inds, source: f.name }); continue; } // republished (GOV.UK updates): keeps its first date
      const r = { id: 'rg:' + sha(it.link).slice(0, 16), feed: f.id, source: f.name, agency: f.agency, region: f.region, kind: f.kind, title, url: it.link, date: it.date || TODAY, summary, assets, inds };
      reg.push(r); byUrl.set(it.link, r); added++; fresh++;
      if (assets.length && f.kind === 'news') enqueue({ id: 'reg:' + r.id.slice(3), kind: 'reg', task: 'milestones', url: it.link, date: r.date, publisher: f.agency, title, assets });
    }
    by[f.id] = { ok: true, items: items.length, kept, added: fresh };
    log(`feeds     ${f.id.padEnd(14)} ${items.length} items, ${kept} about a catalog asset or indication, ${fresh} new`);
  }
  reg = reg.filter((r) => r.date >= daysAgo(REG_KEEP_DAYS)).sort(byDateDesc).slice(0, REG_CAP);
  status.feeds = { source: 'Regulator newsrooms (FDA, EMA, MHRA)', at: now.toISOString(), ok: failed < INTEL_FEEDS.length, feeds: INTEL_FEEDS.length, failed, added, kept: reg.length, by, error: failed ? lastErr : null };
}

/* =========================================================
   2b. Trade press: pharma trade-press feeds (data/intel-queries.js), into the news headlines
   ========================================================= */
async function runTrade() {
  const byId = new Map(news.map((n) => [n.id, n])), byUrl = new Map(news.map((n) => [n.url, n])), byTitle = new Map(news.map((n) => [norm(n.title), n])), by = {};
  let added = 0, failed = 0, lastErr = null;
  for (const f of INTEL_TRADE_FEEDS) {
    let items;
    try { items = parseFeed(await fetchFeed(f.url)); }
    catch (e) { failed++; lastErr = `${f.name}: ${e.message}`; by[f.id] = { ok: false, error: clip(e.message, 160) }; log(`trade     ${f.id.padEnd(14)} ${e.message}`); continue; }
    let matched = 0, fresh = 0;
    for (const it of items) {
      const title = it.title.slice(0, 300); if (!title || !it.link) continue;
      // The headline first; the summary too, as business titles lead with the company ("Roche's MS pill").
      const summary = clip(it.summary, 400), inTitle = WATCH.filter((w) => ASSET_RE[w.asset].test(title)).map((w) => w.asset);
      const assets = inTitle.concat(WATCH.filter((w) => !inTitle.includes(w.asset) && ASSET_RE[w.asset].test(summary)).map((w) => w.asset));
      if (!assets.length) continue;
      matched++;
      const id = 'tp:' + sha(it.link).slice(0, 16), nt = norm(title);
      if (byId.has(id) || byUrl.has(it.link)) continue;
      const twin = byTitle.get(nt); if (twin) { twin.also = (twin.also || 0) + 1; continue; } // the same story in a sister publication
      let domain = ''; try { domain = new URL(it.link).hostname.replace(/^www\./, ''); } catch { /* no host */ }
      const item = { id, title, url: it.link, domain, source: f.name, country: '', date: it.date || TODAY, match: assets, summary, tags: null };
      news.push(item); byId.set(id, item); byUrl.set(it.link, item); byTitle.set(nt, item); added++; fresh++;
    }
    by[f.id] = { ok: true, items: items.length, matched, added: fresh };
    log(`trade     ${f.id.padEnd(14)} ${items.length} items, ${matched} name a catalog asset, ${fresh} new`);
  }
  status.trade = { source: 'Trade press feeds', at: now.toISOString(), ok: failed < INTEL_TRADE_FEEDS.length, feeds: INTEL_TRADE_FEEDS.length, failed, added, kept: news.filter((n) => n.source).length, by, error: failed ? lastErr : null };
  log(`trade     ${INTEL_TRADE_FEEDS.length - failed}/${INTEL_TRADE_FEEDS.length} feeds read, ${added} new headlines naming an asset${failed ? ' · ' + lastErr : ''}`);
}

/* =========================================================
   3. SEC EDGAR: 8-K and 6-K press releases filed by each asset's sponsor
   ========================================================= */
const cleanCo = (s) => String(s || '').replace(/\s*\(CIK[^)]*\)\s*$/, '').replace(/\s*\([A-Z0-9.\-, ]+\)\s*$/, '').trim();
async function runSec() {
  if (!CONTACT) { status.sec = { source: 'SEC EDGAR full-text search', at: now.toISOString(), ok: false, error: 'Skipped: the SEC requires a declared contact. Set CONTACT_EMAIL.' }; log('sec       skipped: set CONTACT_EMAIL (the SEC requires a declared contact)'); return; }
  const all = WATCH.filter((w) => w.sponsor), list = all.filter((w) => runs.sec_at[w.asset] !== TODAY).sort((a, b) => (a.ext ? 1 : 0) - (b.ext ? 1 : 0) || String(runs.sec_at[a.asset] || '').localeCompare(String(runs.sec_at[b.asset] || ''))).slice(0, SEC_ASSETS);
  const stopAt = Date.now() + SEC_MAX_MIN * 60000;
  let found = 0, added = 0, failed = 0, done = 0, lastErr = null;
  for (const w of list) {
    if (Date.now() > stopAt) break;
    const since = runs.sec_at[w.asset] ? addDays(runs.sec_at[w.asset], -14) : daysAgo(SEC_BACKFILL_DAYS);
    const q = w.terms.map((t) => `"${t}"`).join(' OR '), sp = new RegExp(w.sponsor, 'i');
    let ok = true;
    for (let from = 0; from < 300; from += 100) {
      const url = 'https://efts.sec.gov/LATEST/search-index?' + new URLSearchParams({ q, forms: '8-K,6-K', dateRange: 'custom', startdt: since, enddt: TODAY, from: String(from) });
      let j = null, err = null;
      for (let attempt = 0; attempt < 2 && !j; attempt++) { // EDGAR search answers a passing HTTP 500 now and then
        try { j = JSON.parse(await getText(url, 6 * 3600)); } catch (e) { err = e.message; if (!(e.status >= 500) || attempt) break; await sleep(3000); }
      }
      if (!j) { failed++; ok = false; lastErr = err; break; }
      const hits = (j.hits && j.hits.hits) || [];
      for (const h of hits) {
        const s = h._source || {}, [adsh, file] = String(h._id || '').split(':');
        if (!adsh || !file || !sp.test((s.display_names || []).join(' '))) continue;
        const type = String(s.file_type || ''), form = String(s.form || s.root_forms && s.root_forms[0] || '');
        if (!/^EX-99/i.test(type) && !(form === '6-K' && /^6-K/i.test(type))) continue; // 8-K cover pages only point to the exhibit
        const cik = String(Number((s.ciks || [])[0] || 0)); if (cik === '0') continue;
        found++;
        const company = cleanCo((s.display_names || [])[0]);
        if (enqueue({ id: `sec:${adsh}:${file}`, kind: 'sec', task: 'milestones', url: `https://www.sec.gov/Archives/edgar/data/${cik}/${adsh.replace(/-/g, '')}/${file}`, date: s.file_date || null, publisher: company, title: `${company} ${form}${type && type !== form ? ' ' + type : ''}`.trim(), assets: [w.asset] })) added++;
      }
      if (hits.length < 100) break;
    }
    if (ok) { runs.sec_at[w.asset] = TODAY; done++; }
  }
  const left = all.filter((w) => runs.sec_at[w.asset] !== TODAY).length;
  status.sec = { source: 'SEC EDGAR full-text search', at: now.toISOString(), ok: failed === 0, assets: all.length, searched: done, left, found, added, error: lastErr };
  log(`sec       ${done} of ${all.length} sponsors' assets searched (${left} left for the next runs), ${found} press releases, ${added} new to read${failed ? ` · ${failed} queries failed: ${lastErr}` : ''}`);
}

/* =========================================================
   4. LLM tasks
   ========================================================= */
const KINDS = ['Approval', 'Filing submitted', 'Filing accepted', 'Action date (PDUFA)', 'Complete response letter', 'Discontinued', 'Topline results', 'Trial started', 'Label update', 'Launch', 'Partnership or licensing'];
const NEWS_KINDS = KINDS.concat(['Clinical data', 'Commercial', 'Safety', 'Access and pricing', 'Legal', 'Other']);
const MILESTONE_NEWS = new Set(['Approval', 'Filing submitted', 'Filing accepted', 'Action date (PDUFA)', 'Complete response letter', 'Discontinued', 'Topline results', 'Launch']);
const REGIONS = ['US', 'EU', 'UK', 'Japan', 'China', 'Canada', 'Australia', 'Global', 'Other'];
const HTA_AGENCIES = Object.keys(INTEL_HTA_AGENCIES);
const drugLine = (w) => `- ${w.asset}: ${w.name} (${w.terms.join(', ')}), developer ${w.company}`;
const S = (t, extra) => Object.assign({ type: t }, extra || {});
const strEnum = (list) => S('STRING', list.length ? { enum: list } : {});

let llm = null, llmStop = null, deadline = Infinity; // set when the LLM tasks start
const outOfTime = () => Date.now() > deadline;
async function ask(o) {
  if (llmStop) throw llmStop;
  try { return await llm.generate(o); }
  catch (e) {
    // A spent or overloaded search ladder only ends web search; a spent or overloaded reading ladder, or a rejected key,
    // ends all LLM work this run, and the documents not read stay queued.
    if (e instanceof LlmError && (e.code === 'auth' || ((e.code === 'quota' || e.code === 'busy') && !o.search))) { llmStop = e; log(`llm       stopping: ${e.message}`); }
    throw e;
  }
}

/* 4a. Label new headlines (batches of 40, newest first). */
async function runTag() {
  const todo = news.filter((n) => !n.tags).sort(byDateDesc);
  let done = 0;
  for (let i = 0, b = 0; i < todo.length && b < TAG_BATCHES && !llmStop && !outOfTime(); i += 40, b++) {
    const batch = todo.slice(i, i + 40);
    const assets = Array.from(new Set(batch.flatMap((n) => n.match))), inds = indsFor(assets);
    const schema = S('OBJECT', { properties: { items: S('ARRAY', { items: S('OBJECT', { properties: { i: S('INTEGER'), relevant: S('BOOLEAN'), assets: S('ARRAY', { items: strEnum(assets) }), event: S('STRING', { enum: NEWS_KINDS }), indications: S('ARRAY', { items: strEnum(inds) }) }, required: ['i', 'relevant', 'assets', 'event', 'indications'] }) }) }, required: ['items'] });
    const prompt = `Label each news headline below. For each, return i (its number), relevant (true only if the headline, read with its summary where one is given, reports news about one of the listed drugs themselves: development, regulatory, clinical, safety, commercial or access news; false for market-research reports, stock tips, lists, or a passing mention), assets (the listed drugs the headline is about), event (the one kind of news it reports), and indications (from: ${inds.length ? inds.map((k) => `${k} = ${IND[k].name.toLowerCase()}`).join('; ') : 'none listed'}; empty if none is named).\n\nDrugs:\n${assets.map((a) => drugLine(W[a])).join('\n')}\n\nHeadlines:\n${batch.map((n, k) => `${k}. ${n.title}${n.summary ? ' [summary: ' + clip(n.summary, 240) + ']' : ''} (${n.source || n.domain}, ${n.date})`).join('\n')}\n\nReturn JSON: {"items": [{"i": 0, "relevant": true, "assets": ["..."], "event": "...", "indications": ["..."]}]}`;
    let r; try { r = await ask({ profile: 'tag', system: 'You label pharmaceutical news headlines for a medical affairs team. Judge only from the headline text, and its summary where one is given. Return JSON only.', prompt, schema, maxOutputTokens: 8192 }); } catch (e) { log(`tag       batch failed: ${e.message}`); continue; }
    for (const x of (Array.isArray(r.data) ? r.data : r.data && r.data.items) || []) {
      const n = batch[x.i]; if (!n || n.tags) continue;
      // An asset label stands only if the headline (or, for a trade-press item, its summary) names that asset.
      const named = (x.assets || []).filter((a) => n.match.includes(a));
      const rel = !!x.relevant && (named.length || n.match.length) > 0;
      n.tags = { relevant: rel, assets: rel ? (named.length ? named : n.match) : [], event: NEWS_KINDS.includes(x.event) ? x.event : 'Other', ind: (x.indications || []).filter((k) => inds.includes(k)), model: r.model };
      done++;
    }
  }
  log(`tag       ${done} of ${todo.length} new headlines labelled`);
  // Headlines that report a milestone: read the article too.
  for (const n of news) if (n.tags && n.tags.relevant && MILESTONE_NEWS.has(n.tags.event)) enqueue({ id: 'news:' + n.id, kind: 'news', task: 'milestones', url: n.url, date: n.date, publisher: n.source || n.domain, title: n.title, assets: n.tags.assets });
}

/* 4b. Web search (Google Search grounding): the pages it cites become documents to read. */
const NO_SEARCH = 'No model on the search ladder offers Google Search grounding to this key today (on the free tier only some Flash models do)';
const SKIP_HOSTS = /(^|\.)(youtube\.com|wikipedia\.org|linkedin\.com|facebook\.com|x\.com|twitter\.com|reddit\.com|instagram\.com|tiktok\.com)$/i;
async function resolveUrl(u) {
  if (!/grounding-api-redirect/.test(u)) return u;
  try { const r = await fetch(u, { redirect: 'manual', signal: AbortSignal.timeout(15000) }); return r.headers.get('location') || null; } catch { return null; }
}
async function webSearch(kind, w) {
  const prompt = kind === 'hta'
    ? `Find health technology assessment and reimbursement decisions on ${w.name} (${w.terms.join(', ')}) by ${HTA_AGENCIES.join(', ')}. Give each decision with its agency, date and outcome. Prefer the agencies' own pages.`
    : `Find official news from the last 12 months, and any announced upcoming dates, about ${w.name} (${w.terms.join(', ')}) from ${w.company}: regulatory submissions or acceptances, approvals by FDA, EMA, MHRA, PMDA, Health Canada, TGA or NMPA, PDUFA or other target action dates, complete response letters, discontinued programs, Phase 2 or 3 topline results, and launches. One finding per line with its date. Prefer the company's press releases and the regulators' own pages.`;
  const r = await ask({ search: true, prompt, maxOutputTokens: 4096 });
  const chunks = ((r.grounding && r.grounding.groundingChunks) || []).map((c) => c.web).filter((x) => x && x.uri);
  const urls = [];
  for (const c of chunks) {
    if (urls.length >= URLS_PER_SEARCH) break;
    const u = await resolveUrl(c.uri); if (!u) continue;
    let host; try { host = new URL(u).hostname; } catch { continue; }
    if (SKIP_HOSTS.test(host) || urls.some((x) => x.u === u)) continue;
    urls.push({ u, host });
  }
  let added = 0;
  for (const { u, host } of urls) if (enqueue({ id: (kind === 'hta' ? 'hta:' : 'web:') + sha(u).slice(0, 16), kind: 'web', task: kind === 'hta' ? 'hta' : 'milestones', url: u, date: null, publisher: host.replace(/^www\./, ''), title: host, assets: [w.asset] })) added++;
  return { cited: chunks.length, added, model: r.model };
}
async function runWeb(kind) {
  const every = kind === 'hta' ? HTA_EVERY_DAYS : WEB_EVERY_DAYS, per = kind === 'hta' ? HTA_PER_RUN : WEB_PER_RUN, book = runs[kind === 'hta' ? 'hta' : 'web'];
  // HTA decisions exist only for marketed products: assets with a US brand.
  const list = (kind === 'hta' ? WATCH.filter((w) => w.marketed) : WATCH).filter((w) => !book[w.asset] || book[w.asset] < daysAgo(every)).sort((a, b) => (a.ext ? 1 : 0) - (b.ext ? 1 : 0) || String(book[a.asset] || '').localeCompare(String(book[b.asset] || ''))).slice(0, per);
  if (!llm.canRun('extract', true)) { status.web = Object.assign({}, status.web, { at: now.toISOString(), ok: false, error: llm.searchLadder.length ? NO_SEARCH : 'No model offering Google Search grounding is visible to this key' }); log(`web       ${status.web.error}`); return; }
  let done = 0, added = 0, lastErr = null;
  for (const w of list) {
    if (llmStop || outOfTime() || !llm.canRun('extract', true)) break;
    try { const r = await webSearch(kind, w); book[w.asset] = TODAY; done++; added += r.added; log(`${(kind === 'hta' ? 'hta' : 'web').padEnd(9)} ${w.asset.padEnd(16)} ${r.cited} pages cited, ${r.added} new to read (${r.model})`); }
    catch (e) { lastErr = e.message; log(`${(kind === 'hta' ? 'hta' : 'web').padEnd(9)} ${w.asset.padEnd(16)} search failed: ${e.message}`); if (!llm.canRun('extract', true)) break; }
  }
  if (list.length && !done) { // every search failed: say why rather than report an empty success
    status.web = { source: 'Google Search grounding (Gemini)', at: now.toISOString(), ok: false, error: llm.canRun('extract', true) ? lastErr : NO_SEARCH };
    return;
  }
  const pw = status.web && status.web.ok ? status.web : {};
  status.web = { source: 'Google Search grounding (Gemini)', at: now.toISOString(), ok: true, searched: Object.assign({}, pw.searched, { [kind]: done }), added: Object.assign({}, pw.added, { [kind]: added }), error: null };
}

/* 4c. Read each queued document once and extract milestones or HTA decisions. */
const MS_SYSTEM = 'You read one public document (an SEC filing, a press release, a regulator\'s announcement, a news article or a web page) and list the dated regulatory and development milestones it reports for the drugs listed. Rules: use only what the document says, never outside knowledge; only the listed drugs and only the listed indications; only milestones of the drug\'s own developer or its regulators, not a competitor\'s comparison or a market report; quote = one sentence copied from the document exactly, character for character, that states the milestone; date = the date of the milestone itself, as precise as the document gives it (YYYY-MM-DD, YYYY-MM, YYYY-Q1 to Q4, YYYY-H1 or H2, or YYYY); timing "expected" for a date the company or regulator expects, "occurred" for something that has happened; Filing accepted = a regulator accepted or validated an application; Filing submitted = the company submitted it; Action date (PDUFA) = a target action date; Topline results = primary results of a Phase 2 or 3 trial; Trial started = a Phase 2 or 3 trial started or dosed its first patient; skip financial results and sales, and events older than 12 months that the document only restates. If nothing qualifies, return an empty events list. Return JSON only.';
const HTA_SYSTEM = 'You read one public document and list the health technology assessment and reimbursement decisions it reports for the drugs listed. Rules: use only what the document says; only the listed drugs and indications; agency = the body that decided; decision = the agency\'s own wording in at most 80 characters; outcome = recommended, restricted (recommended for a narrower population or with conditions), not recommended, terminated or withdrawn, under review, or other; date = the decision date as precise as given; reference = the agency\'s reference number if shown (for example TA1047), else empty; population, comparator and rationale in at most 200 characters each, from the document only, empty when not stated; quote = one sentence copied exactly from the document that states the decision. If nothing qualifies, return an empty decisions list. Return JSON only.';
function msSchema(assets, inds) {
  return S('OBJECT', { properties: { headline: S('STRING'), events: S('ARRAY', { items: S('OBJECT', { properties: { asset: S('STRING', { enum: assets }), indication: S('STRING', { enum: inds.concat(['all']) }), event: S('STRING', { enum: KINDS }), region: S('STRING', { enum: REGIONS }), date: S('STRING'), timing: S('STRING', { enum: ['occurred', 'expected'] }), detail: S('STRING'), quote: S('STRING') }, required: ['asset', 'indication', 'event', 'region', 'date', 'timing', 'detail', 'quote'] }) }) }, required: ['headline', 'events'] });
}
function htaSchema(assets, inds) {
  return S('OBJECT', { properties: { headline: S('STRING'), decisions: S('ARRAY', { items: S('OBJECT', { properties: { agency: S('STRING', { enum: HTA_AGENCIES.concat(['Other']) }), asset: S('STRING', { enum: assets }), indication: S('STRING', { enum: inds.concat(['all']) }), decision: S('STRING'), outcome: S('STRING', { enum: ['recommended', 'restricted', 'not recommended', 'terminated or withdrawn', 'under review', 'other'] }), date: S('STRING'), reference: S('STRING'), population: S('STRING'), comparator: S('STRING'), rationale: S('STRING'), quote: S('STRING') }, required: ['agency', 'asset', 'indication', 'decision', 'outcome', 'date', 'quote'] }) }) }, required: ['headline', 'decisions'] });
}
const clip = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim().replace(/^[•·▪◦*–—-]\s*/, ''); return s.length > n ? s.slice(0, n - 1).trim() + '…' : s; };
const DOC_KIND = { sec: 'SEC filing (company press release)', news: 'news article', reg: 'regulator\'s announcement', web: 'web page' };
const newEvents = [], newHta = [];
async function readDoc(d) {
  // Fetch the text.
  let html, finalUrl = d.url;
  if (d.kind === 'sec') html = await getText(d.url, 30 * 86400);
  else ({ html, finalUrl } = await fetchPage(d.url));
  const text = htmlToText(html), title = d.kind === 'sec' ? d.title : pageTitle(html) || d.title;
  if (text.length < 400) return { s: 'unreadable', e: 'too little text (the page may need a browser)', t: title };
  // Which assets: the ones the document was found for, then the same sponsor's other assets, if the text names them.
  const sponsorRe = d.kind === 'sec' ? d.publisher : null;
  const mine = d.assets.filter((a) => W[a]).map((a) => W[a]), same = sponsorRe ? WATCH.filter((w) => !d.assets.includes(w.asset) && w.sponsor && new RegExp(w.sponsor, 'i').test(sponsorRe)) : [];
  const cands = mine.concat(same).filter((w) => ASSET_RE[w.asset].test(text)).slice(0, MAX_CANDS).map((w) => w.asset);
  if (!cands.length) return { s: 'none', e: 'no watched asset named in the text', t: title };
  const inds = indsFor(cands);
  const re = new RegExp(cands.map((a) => ASSET_RE[a].source).join('|'), 'i');
  const body = excerpt(text, re);
  const hta = d.task === 'hta';
  const prompt = `Document: ${DOC_KIND[d.kind] || 'web page'} · ${d.publisher || ''} · ${d.date ? 'dated ' + d.date : 'date not given'} · ${finalUrl}\nToday is ${TODAY}.\n\nDrugs:\n${cands.map((a) => drugLine(W[a])).join('\n')}\n\nIndications: ${indLines(inds)}\n\nDocument text${body.length < text.length ? ' (the lead and the passages that name the drugs; […] marks a cut)' : ''}:\n<<<\n${body}\n>>>\n\nReturn JSON: ${hta
    ? '{"headline": "<the title of the press release, article or page, copied verbatim; not a filing cover page>", "decisions": [{"agency": "<' + HTA_AGENCIES.join('|') + '|Other>", "asset": "<drug id>", "indication": "<code or all>", "decision": "...", "outcome": "<recommended|restricted|not recommended|terminated or withdrawn|under review|other>", "date": "...", "reference": "...", "population": "...", "comparator": "...", "rationale": "...", "quote": "..."}]}'
    : '{"headline": "<the title of the press release, article or page, copied verbatim; not a filing cover page>", "events": [{"asset": "<drug id>", "indication": "<code or all>", "event": "<' + KINDS.join('|') + '>", "region": "<' + REGIONS.join('|') + '>", "date": "...", "timing": "<occurred|expected>", "detail": "<one plain sentence, at most 160 characters>", "quote": "..."}]}'}`;
  const r = await ask({ profile: 'extract', system: hta ? HTA_SYSTEM : MS_SYSTEM, prompt, schema: hta ? htaSchema(cands, inds) : msSchema(cands, inds) });
  // The model's headline is used only if it is in the document; otherwise the page title or the filing label.
  const normDoc = norm(text), docDay = d.date || TODAY, h = String(r.data.headline || '');
  const headline = quoteIn(h, normDoc) && !/\.(htm|html|txt)\b|securities and exchange commission/i.test(h) ? clip(h, 240) : title;
  const src = { kind: d.kind, url: finalUrl, title: headline, publisher: d.publisher || '', date: d.date || null };
  let kept = 0, dropped = 0;
  const rows = (Array.isArray(r.data) ? r.data : hta ? r.data.decisions : r.data.events) || [];
  for (const x of rows) {
    const w = W[x.asset], ind = x.indication, when = parseWhen(x.date);
    const fail = !w || !cands.includes(x.asset) ? 'asset' : !(ind === 'all' || inds.includes(ind)) ? 'indication' : !when ? 'date' : !quoteIn(x.quote, normDoc) ? 'quote not found in the document' : (ind !== 'all' && !indNamed(ind, text)) ? 'indication not named' : null;
    if (fail) { dropped++; log(`          dropped (${fail}): ${clip(x.quote || x.detail || x.decision, 90)}`); continue; }
    if (hta) {
      if (when.date > addDays(docDay, 3) && d.date) { dropped++; continue; }
      newHta.push({ agency: x.agency, country: INTEL_HTA_AGENCIES[x.agency] || null, asset: x.asset, ind, decision: clip(x.decision, 100), outcome: x.outcome, date: when.date, precision: when.precision, when: when.label || null, reference: clip(x.reference, 40), population: clip(x.population, 220), comparator: clip(x.comparator, 220), rationale: clip(x.rationale, 220), quote: clip(x.quote, 600), src, model: r.model, found_utc: now.toISOString() });
    } else {
      // An event that happened cannot postdate its document or be a restatement from long before it; an expected one must not have lapsed when the document was written.
      if (x.timing === 'occurred' && (when.date > addDays(docDay, 3) || when.end < addDays(docDay, -400))) { dropped++; log(`          dropped (date outside the document's window): ${clip(x.detail, 90)}`); continue; }
      if (x.timing === 'expected' && when.end < addDays(docDay, -31)) { dropped++; continue; }
      newEvents.push({ asset: x.asset, ind, event: x.event, region: REGIONS.includes(x.region) ? x.region : 'Other', date: when.date, end: when.end, precision: when.precision, when: when.label || null, timing: x.timing === 'expected' ? 'expected' : 'occurred', detail: clip(x.detail, 200), quote: clip(x.quote, 600), src, model: r.model, found_utc: now.toISOString() });
    }
    kept++;
  }
  return { s: kept ? 'ok' : 'none', n: kept, x: dropped || undefined, m: r.model, t: headline };
}
async function runExtract() {
  pending = pending.filter((d) => { const l = docs[d.id]; return !l || (l.s === 'failed' && (l.tries || 0) < 3); });
  // Newest first. Pages from this run's web search have no date yet: they count as today's.
  pending.sort((a, b) => String(b.date || TODAY).localeCompare(String(a.date || TODAY)));
  let read = 0;
  for (const d of pending.slice()) {
    if (read >= MAX_DOCS || llmStop || outOfTime()) break;
    const tries = ((docs[d.id] && docs[d.id].tries) || 0) + 1;
    let res;
    try { res = await readDoc(d); }
    catch (e) {
      if (llmStop) break; // quota or key: leave it queued for the next run
      res = { s: e instanceof LlmError && e.code === 'blocked' ? 'blocked' : 'failed', e: clip(e.message, 200) };
    }
    read++;
    docs[d.id] = { t: clip(res.t || d.title, 240), u: d.url, d: d.date, k: d.kind, p: d.publisher, a: d.assets, s: res.s, n: res.n || 0, x: res.x, m: res.m, at: now.toISOString(), e: res.e, tries: res.s === 'failed' ? tries : undefined };
    log(`read      ${res.s.padEnd(10)} ${String(res.n || 0).padStart(2)} ${d.kind.padEnd(4)} ${String(d.date || '').padEnd(10)} ${clip(res.t || d.title, 70)}${res.e ? ' · ' + res.e : ''}`);
    if (res.s !== 'failed' || tries >= 3) { pending = pending.filter((x) => x.id !== d.id); queued.delete(d.id); }
  }
  return read;
}

/* =========================================================
   5. Consolidate: one row per milestone, newest guidance for expected dates, expected dates dropped once they happen
   ========================================================= */
const SUPERSEDES = { 'Action date (PDUFA)': ['Approval', 'Complete response letter'], Approval: ['Approval', 'Complete response letter'], 'Filing submitted': ['Filing submitted', 'Filing accepted'], 'Filing accepted': ['Filing accepted'], 'Topline results': ['Topline results'], Launch: ['Launch'], 'Trial started': ['Trial started'], 'Label update': ['Label update'], Discontinued: ['Discontinued'], 'Complete response letter': ['Complete response letter'], 'Partnership or licensing': ['Partnership or licensing'] };
function consolidate(list) {
  const by = new Map();
  for (const e of list) {
    const k = [e.asset, e.ind, e.event, e.region, e.timing === 'expected' ? 'expected' : e.date.slice(0, 7)].join('|');
    const cur = by.get(k);
    if (!cur) { by.set(k, Object.assign({}, e, { more: (e.more || []).slice() })); continue; }
    const sd = (x) => String((x.src && x.src.date) || x.found_utc || '');
    if (e.timing === 'expected') { if (sd(e) > sd(cur)) by.set(k, Object.assign({}, e, { more: [] })); continue; } // the latest guidance wins
    // Occurred: keep the earliest announcement and list the other documents as further sources.
    const earlier = sd(e) && sd(e) < sd(cur);
    const keep = earlier ? Object.assign({}, e, { more: [cur.src].concat(cur.more) }) : cur;
    keep.more = keep.more.concat(earlier ? [] : [e.src].concat(e.more || [])).filter((m, i, a) => m && m.url !== keep.src.url && a.findIndex((y) => y && y.url === m.url) === i).slice(0, 4);
    by.set(k, keep);
  }
  const all = Array.from(by.values());
  const occurred = all.filter((e) => e.timing === 'occurred');
  const out = all.filter((e) => {
    if (e.timing === 'occurred') return e.date >= daysAgo(730);
    if ((e.end || e.date) < daysAgo(60)) return false; // an expected date that passed without news
    const since = addDays((e.src && e.src.date) || e.date, -7);
    return !occurred.some((o) => o.asset === e.asset && (o.ind === e.ind || o.ind === 'all') && o.region === e.region && (SUPERSEDES[e.event] || []).includes(o.event) && o.date >= since);
  });
  out.forEach((e) => { e.id = sha([e.asset, e.ind, e.event, e.region, e.timing, e.timing === 'expected' ? '' : e.date.slice(0, 7)].join('|')).slice(0, 12); });
  return out.sort(byDateDesc);
}
function consolidateHta(list) {
  const by = new Map();
  for (const h of list) {
    const k = [h.agency, h.asset, h.ind, h.reference || h.date.slice(0, 7)].join('|');
    const cur = by.get(k);
    if (!cur || String((h.src && h.src.date) || h.found_utc) > String((cur.src && cur.src.date) || cur.found_utc)) by.set(k, h);
  }
  const out = Array.from(by.values());
  out.forEach((h) => { h.id = sha([h.agency, h.asset, h.ind, h.reference || h.date.slice(0, 7)].join('|')).slice(0, 12); });
  return out.sort(byDateDesc);
}

/* =========================================================
   Run
   ========================================================= */
if (part('news')) await runNews();
if (part('feeds')) await runFeeds();
if (part('trade')) await runTrade();
if (part('sec')) await runSec();
llm = await createGemini({ log: (m) => log('llm       ' + m) });
if (!llm.available) log(`llm       not used: ${llm.reason}. Documents stay queued until a key is set.`);
if (llm.available) {
  deadline = Date.now() + MAX_MIN * 60000;
  if (part('tag')) await runTag();
  if (part('web') && !llmStop) await runWeb('milestones');
  if (part('hta') && !llmStop) await runWeb('hta');
  if (part('extract') && !llmStop) await runExtract();
  llm.save();
}

// Prune the headlines, the ledger and the queue.
pruneNews();
for (const [id, l] of Object.entries(docs)) if ((l.d || l.at || '').slice(0, 10) < daysAgo(LEDGER_KEEP_DAYS)) delete docs[id];
pending = pending.filter((d) => !docs[d.id] || docs[d.id].s === 'failed').slice(0, 600);

const events = consolidate((prev.events || []).concat(newEvents));
const hta = consolidateHta((prev.hta || []).concat(newHta));
runs.news_utc = part('news') ? now.toISOString() : runs.news_utc || null;
const counts = Object.values(docs).reduce((c, l) => { c[l.s] = (c[l.s] || 0) + 1; return c; }, {});
const payload = {
  generated_utc: now.toISOString(),
  interval_min: INTERVAL_MIN,
  watch: { assets: WATCH.length, inds: ALL.inds.length, areas: CAT.allIds().length },
  sources: Object.assign({}, status, { llm: Object.assign({ provider: 'Gemini API', available: llm.available, reason: llm.available ? null : llm.reason, stopped: llmStop ? llmStop.message : null, calls_this_run: llm.calls || 0 }, llm.summary()) }),
  runs,
  stats: { docs_read: Object.keys(docs).length, docs_by_status: counts, docs_pending: pending.length, events: events.length, hta: hta.length, news: news.length, news_relevant: news.filter((n) => n.tags && n.tags.relevant).length, reg: reg.length },
  news, reg, events, hta, docs, pending,
  notes: [
    'Scope: every asset and indication of every therapeutic area in js/catalog.js; the app shows each watchlist the records about its own assets and indications. Indication ids are those of the catalog\'s areas merged (CAT.indsFromAll maps them to a watchlist\'s).',
    'News: GDELT DOC 2.0 (gdeltproject.org), English-language articles whose headline names a catalog asset; headlines and links only, at most ' + NEWS_PER_ASSET + ' per asset over ' + NEWS_KEEP_DAYS + ' days.',
    'Trade press: items from pharma trade-press RSS feeds (' + INTEL_TRADE_FEEDS.map((f) => f.name).join(', ') + ') whose headline or summary names a catalog asset; headline, link and publication (source) only, in the same list as the news.',
    'Regulator news: FDA, EMA and MHRA newsroom feeds (RSS and Atom), items that name a catalog asset or, in the title, a catalog indication; title, date, link and the feed\'s own summary.',
    'Filings: SEC EDGAR full-text search, 8-K and 6-K press-release exhibits filed by each asset\'s sponsor.',
    'Milestones and HTA decisions: read out of those documents by an LLM (Gemini). Each row carries a sentence copied from its source, checked against the fetched text; rows whose sentence, asset, indication or date did not check out were dropped.',
    'Labels on headlines (event kind, indication) are the model\'s reading of the headline alone.'
  ]
};
const header = `/* Competitor news, regulator newsrooms, company filings and the milestones read out of them, generated by jobs/fetch-intel.mjs on ${payload.generated_utc}.\n   Sources: GDELT, pharma trade-press feeds, FDA, EMA and MHRA feeds, SEC EDGAR, pages cited by Google Search; extraction by the Gemini API. Do not edit by hand: rerun the script. */\n`;
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT + '.tmp', header + 'window.MIP_INTEL = ' + JSON.stringify(payload) + ';\n');
fs.renameSync(OUT + '.tmp', OUT);
log(`Wrote ${path.relative(process.cwd(), OUT)} · ${news.length} headlines · ${reg.length} regulator items · ${events.length} milestones (${newEvents.length} new) · ${hta.length} HTA decisions · ${pending.length} documents queued · ${llm.calls || 0} LLM calls · ${((Date.now() - t0) / 1000).toFixed(0)}s`);
