// Gemini client for the scheduled intel job (jobs/fetch-intel.mjs). Zero dependencies.
//
// Free-tier limits are per Google Cloud project and per model: requests per minute, tokens per minute and requests per
// day, the daily count resetting at midnight Pacific time. So every call walks a ladder of models instead of leaning on
// one: a model that answers 429 for the minute cools down for the retry delay the API sends and the call moves to the
// next model; a model that has used its day (or has no free quota at all) is skipped until the Pacific date changes;
// a model that answers 503 (overloaded) is skipped for BUSY_MS. Only when every model is cooling does the call wait,
// and only when every model has used its day does it give up.
//
// The ladder is built from the models the key can see (ListModels), best suited first, so newly released models join
// on their own. LLM_MODELS=model-a,model-b overrides it. Google Search grounding is free only on some models: calls
// that need it try the stable Flash and Flash-Lite models on the ladder, newest first, or LLM_SEARCH_MODELS when set;
// a model that refuses to search, or has used its search quota, is skipped for the day.
//
// Environment: LLM_API_KEY (or GEMINI_API_KEY), optional LLM_MODELS, LLM_SEARCH_MODELS, LLM_MIN_GAP_MS (default 4500,
// the pause between two calls to the same model), LLM_API_BASE (for a local stand-in during tests).
// Per-model counts and daily exhaustion persist in <MIP_HOME>/llm-state.json, so reruns on the same day skip spent models.
import fs from 'node:fs';
import path from 'node:path';
import { HOME } from './upstream.mjs';

const BASE = (process.env.LLM_API_BASE || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '');
const STATE_FILE = path.join(HOME, 'llm-state.json');
const MIN_GAP_MS = Number(process.env.LLM_MIN_GAP_MS) || 4500;
const MAX_WAIT_MS = 65000;
const BUSY_MS = 10 * 60000;   // an overloaded model (HTTP 503) usually stays so for minutes, not seconds
const list = (s) => String(s || '').split(',').map((x) => x.trim().replace(/^models\//, '')).filter(Boolean);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/* The Pacific-time date: the day free-tier daily quotas belong to. */
const ptDay = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

/* Text models only: no speech, image, video, music, embedding, live or agent models, no moving aliases. */
const NOT_TEXT = /(tts|image|imagen|embedding|live|audio|transcribe|translate|robotics|computer-use|omni|veo|lyria|aqa|deep-research|antigravity|learnlm|-exp|latest|gemma-3n)/i;
export function describe(id) {
  const g = id.match(/^gemini-(\d+(?:\.\d+)?)-(flash-lite|flash|pro)\b/);
  if (g) return { id, family: 'gemini', ver: parseFloat(g[1]), tier: g[2], preview: /preview/.test(id) };
  const m = id.match(/^gemma-(\d+(?:\.\d+)?)/);
  if (m) return { id, family: 'gemma', ver: parseFloat(m[1]), tier: 'gemma', preview: false, size: parseFloat((id.match(/-(\d+)b\b/) || [])[1]) || 0 };
  return null;
}
/* Ladder order per kind of work. extract: reading documents, quality first. tag: short labelling, highest quotas first. */
const TIERS = { extract: ['flash', 'pro', 'flash-lite', 'gemma'], tag: ['flash-lite', 'flash', 'pro', 'gemma'] };
export function rank(ids, profile) {
  const tiers = TIERS[profile] || TIERS.extract;
  const ds = ids.map(describe).filter(Boolean);
  // Gemma last and only its two largest sizes; stable before preview (previews get tighter limits); newest version first.
  const gemma = ds.filter((d) => d.family === 'gemma').sort((a, b) => b.ver - a.ver || b.size - a.size).slice(0, 2);
  const gem = ds.filter((d) => d.family === 'gemini').sort((a, b) => (a.preview - b.preview) || (tiers.indexOf(a.tier) - tiers.indexOf(b.tier)) || (b.ver - a.ver) || a.id.localeCompare(b.id));
  return gem.concat(gemma).map((d) => d.id);
}

/* What a 429 means: the day is used, the model has no free quota (limit 0), or wait retryMs and try again. */
function quotaInfo(err) {
  const det = (err && err.details) || [];
  const qf = det.find((d) => /QuotaFailure/.test(d['@type'] || '')), ri = det.find((d) => /RetryInfo/.test(d['@type'] || ''));
  const v = (qf && qf.violations) || [];
  const ids = v.map((x) => (x.quotaId || '') + ' ' + (x.quotaMetric || '')).join(' ');
  const msg = String((err && err.message) || '');
  return {
    daily: /PerDay|per_day/i.test(ids) || (!v.length && /per day|daily/i.test(msg)),
    zero: v.some((x) => String(x.quotaValue) === '0') || /limit: 0\b/.test(msg),
    search: /search|ground/i.test(ids),
    retryMs: ri && ri.retryDelay ? Math.ceil(parseFloat(ri.retryDelay) * 1000) : null,
    ids: ids.trim()
  };
}
/* Parse the JSON a model returned: plain, fenced, or the first object or array in the text. */
export function parseJSON(text) {
  const t = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try { return JSON.parse(t); } catch { /* fall through */ }
  const s = t.search(/[[{]/); if (s < 0) return null;
  const open = t[s], close = open === '{' ? '}' : ']', e = t.lastIndexOf(close);
  if (e <= s) return null;
  try { return JSON.parse(t.slice(s, e + 1)); } catch { return null; }
}

export class LlmError extends Error { constructor(code, message) { super(message); this.code = code; } }

export async function createGemini(opts = {}) {
  const key = opts.key || process.env.LLM_API_KEY || process.env.GEMINI_API_KEY || '';
  const log = opts.log || (() => {});
  const g = { available: false, reason: '', ladders: {}, searchLadder: [], calls: 0 };
  if (!key) { g.reason = 'No LLM_API_KEY set'; return Object.assign(g, stubs(g)); }

  let state = { day: ptDay(), models: {} };
  try { const s = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); if (s && s.models) state = s; } catch { /* first run */ }
  const today = () => { const d = ptDay(); if (state.day !== d) { state.day = d; Object.values(state.models).forEach((m) => { m.calls = 0; }); } return d; };
  const ms = (id) => state.models[id] || (state.models[id] = { calls: 0 });
  const save = () => { try { fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true }); fs.writeFileSync(STATE_FILE, JSON.stringify(state)); } catch { /* read-only home */ } };

  async function api(method, url, body) {
    const r = await fetch(BASE + url, { method, headers: { 'x-goog-api-key': key, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(180000) });
    const j = await r.json().catch(() => ({}));
    return { status: r.status, j };
  }

  /* The models this key can call. */
  let ids = list(process.env.LLM_MODELS);
  const outLimit = {};
  if (!ids.length) {
    const r = await api('GET', '/models?pageSize=1000').catch((e) => ({ status: 0, j: { error: { message: e.message } } }));
    if (r.status !== 200) { g.reason = 'ListModels failed: ' + ((r.j.error && r.j.error.message) || 'HTTP ' + r.status); log(g.reason); return Object.assign(g, stubs(g)); }
    const usable = (r.j.models || []).filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'));
    usable.forEach((m) => { if (m.outputTokenLimit) outLimit[m.name.replace(/^models\//, '')] = m.outputTokenLimit; });
    ids = usable.map((m) => m.name.replace(/^models\//, '')).filter((id) => !NOT_TEXT.test(id));
  }
  g.ladders.extract = process.env.LLM_MODELS ? ids : rank(ids, 'extract');
  g.ladders.tag = process.env.LLM_MODELS ? ids : rank(ids, 'tag');
  const wanted = list(process.env.LLM_SEARCH_MODELS);
  const flash = (id) => { const d = describe(id); return !!d && d.family === 'gemini' && !d.preview && (d.tier === 'flash' || d.tier === 'flash-lite'); };
  g.searchLadder = !wanted.length ? g.ladders.extract.filter(flash) : process.env.LLM_MODELS ? ids.filter((id) => wanted.includes(id)) : wanted.filter((id) => ids.includes(id));
  g.available = g.ladders.extract.length > 0;
  if (!g.available) g.reason = 'The key sees no text models';
  log(`Gemini ladder (extract): ${g.ladders.extract.join(' > ') || 'none'}`);
  log(`Gemini ladder (search):  ${g.searchLadder.join(' > ') || 'none'}`);

  function usable(id, search) {
    const m = ms(id), d = today();
    if (m.unusable_day === d || m.exhausted_day === d) return false;
    if (search && m.no_search_day === d) return false;
    return true;
  }
  /* Can this kind of call run at all today? (false once every model on its ladder is spent or unusable) */
  g.canRun = (profile, search) => (search ? g.searchLadder : g.ladders[profile] || g.ladders.extract).some((id) => usable(id, search));

  /* One call, walking the ladder. o: { profile, system, prompt, schema, search, maxOutputTokens, avoid, exclude }.
     avoid: models tried only after every other (a second opinion from a different model); exclude: models not used.
     Resolves to { text, data, model, grounding, finish }. Rejects with LlmError code 'quota' (every model spent),
     'auth' (bad key), 'blocked' (the prompt was refused), 'busy' (every model left is overloaded) or 'failed' (no model
     could answer this request). */
  g.generate = async function (o) {
    const base = (o.search ? g.searchLadder : g.ladders[o.profile || 'extract'] || g.ladders.extract).filter((id) => !(o.exclude || []).includes(id));
    const ladder = base.filter((id) => !(o.avoid || []).includes(id)).concat(base.filter((id) => (o.avoid || []).includes(id)));
    if (!ladder.length) throw new LlmError('quota', o.search ? 'No model on the search ladder' : 'No models');
    const tried = new Map();
    let lastErr = '', busy = false;
    for (let round = 0; round < ladder.length * 3 + 4; round++) {
      const now = Date.now();
      const open = ladder.filter((id) => usable(id, o.search) && (tried.get(id) || 0) < 2);
      if (!open.length) break;
      // The best model that is not cooling down; wait out its short pause between calls rather than drop to a weaker one.
      const id = open.find((x) => (ms(x).cooldown_until || 0) <= now);
      if (!id) {
        const wait = Math.min(...open.map((x) => ms(x).cooldown_until)) - now;
        if (wait > MAX_WAIT_MS) { lastErr = 'every model is overloaded or cooling down'; busy = true; break; }
        await sleep(Math.max(250, wait)); continue;
      }
      const gap = (ms(id).last_at || 0) + MIN_GAP_MS - now;
      if (gap > 0) await sleep(gap);
      const m = ms(id), d = describe(id) || {};
      tried.set(id, (tried.get(id) || 0) + 1);
      const gemma = d.family === 'gemma', mergeSystem = gemma || m.no_system, json = o.schema && !o.search && !gemma && !m.no_json;
      const body = {
        contents: [{ role: 'user', parts: [{ text: (mergeSystem && o.system ? o.system + '\n\n' : '') + o.prompt }] }],
        generationConfig: Object.assign({ maxOutputTokens: Math.min(o.maxOutputTokens || 16384, outLimit[id] || Infinity) }, json ? { responseMimeType: 'application/json', responseSchema: o.schema } : {})
      };
      if (!mergeSystem && o.system) body.systemInstruction = { parts: [{ text: o.system }] };
      if (o.search) body.tools = [{ google_search: {} }];
      m.last_at = Date.now(); m.calls = (m.calls || 0) + 1; g.calls++;
      let r;
      try { r = await api('POST', `/models/${encodeURIComponent(id)}:generateContent`, body); }
      catch (e) { m.cooldown_until = Date.now() + 15000; lastErr = `${id}: ${e.message}`; log(`  ${id} network error, trying the next model`); continue; }
      const err = r.j.error || {}, msg = String(err.message || '');
      if (r.status === 200) {
        const cand = (r.j.candidates || [])[0];
        if (!cand || !cand.content) { save(); throw new LlmError('blocked', 'No answer: ' + ((r.j.promptFeedback && r.j.promptFeedback.blockReason) || (cand && cand.finishReason) || 'empty')); }
        const text = (cand.content.parts || []).filter((p) => !p.thought && typeof p.text === 'string').map((p) => p.text).join('');
        const data = o.schema ? parseJSON(text) : null;
        if (o.schema && data == null) { lastErr = `${id}: unreadable JSON (${cand.finishReason})`; log(`  ${id} returned unreadable JSON (${cand.finishReason}), trying the next model`); continue; }
        m.last_ok = new Date().toISOString(); m.last_error = null; save();
        return { text, data, model: id, grounding: cand.groundingMetadata || null, finish: cand.finishReason };
      }
      m.last_error = `HTTP ${r.status}: ${msg.slice(0, 160)}`; lastErr = `${id}: ${m.last_error}`;
      if (r.status === 429) {
        const qi = quotaInfo(err);
        if (qi.search && o.search) { m.no_search_day = today(); log(`  ${id} search quota used for today`); }
        else if (qi.zero) { m.unusable_day = today(); log(`  ${id} has no free quota, skipped until tomorrow (Pacific)`); }
        else if (qi.daily) { m.exhausted_day = today(); log(`  ${id} used its daily quota, skipped until tomorrow (Pacific)`); }
        else { m.cooldown_until = Date.now() + Math.min(MAX_WAIT_MS, qi.retryMs || 30000); log(`  ${id} per-minute limit, cooling ${Math.round((m.cooldown_until - Date.now()) / 1000)} s`); }
      } else if (r.status === 400 && /api key not valid|api_key_invalid/i.test(msg)) {
        save(); throw new LlmError('auth', 'The API key was rejected: ' + msg);
      } else if (r.status === 400 && o.search && /search|ground|tool/i.test(msg)) {
        m.no_search_day = today(); log(`  ${id} cannot search: ${msg.slice(0, 100)}`);
      } else if (r.status === 400 && json && /mime|schema|json/i.test(msg)) {
        m.no_json = true; tried.set(id, 0); log(`  ${id} rejects JSON mode, retrying without it`);
      } else if (r.status === 400 && !mergeSystem && /instruction/i.test(msg)) {
        m.no_system = true; tried.set(id, 0); log(`  ${id} rejects system instructions, retrying without them`);
      } else if (r.status === 400) {
        log(`  ${id} rejected the request: ${msg.slice(0, 120)}`);
      } else if (r.status === 401 || (r.status === 403 && /api key|unregistered|API_KEY/i.test(msg))) {
        save(); throw new LlmError('auth', 'The API key was rejected: ' + msg);
      } else if (r.status === 403 || r.status === 404) {
        m.unusable_day = today(); log(`  ${id} not available to this key (${r.status}), skipped until tomorrow (Pacific)`);
      } else if (r.status === 503) {
        m.cooldown_until = Date.now() + BUSY_MS; log(`  ${id} overloaded (503), skipped for ${BUSY_MS / 60000} minutes`);
      } else {
        m.cooldown_until = Date.now() + 20000; log(`  ${id} HTTP ${r.status}, cooling 20 s`);
      }
    }
    save();
    const spent = !ladder.some((id) => usable(id, o.search));
    throw new LlmError(spent ? 'quota' : busy ? 'busy' : 'failed', !spent ? 'No model answered: ' + lastErr : o.search ? 'No model with Google Search grounding is available to this key today (Pacific)' : 'Every model on the ladder has used its free quota, or is unavailable to this key, for today (Pacific)');
  };

  /* Summary for data/intel.js and the Data sources page. */
  g.summary = () => {
    const d = today(), mm = (id) => ms(id);
    const all = Array.from(new Set(g.ladders.extract.concat(g.searchLadder)));
    return {
      day_pt: d, ladder: g.ladders.extract, tag_ladder: g.ladders.tag, search_ladder: g.searchLadder,
      models: all.map((id) => ({ id, calls_today: mm(id).calls || 0, state: mm(id).unusable_day === d ? 'unavailable' : mm(id).exhausted_day === d ? 'daily quota used' : (mm(id).cooldown_until || 0) > Date.now() ? 'cooling' : 'ready', no_search: mm(id).no_search_day === d || undefined, last_ok: mm(id).last_ok || null, last_error: mm(id).last_error || null })).filter((x) => x.calls_today || x.state !== 'ready' || x.last_ok)
    };
  };
  g.save = save;
  return g;
}
function stubs(g) {
  return { canRun: () => false, generate: async () => { throw new LlmError('quota', g.reason); }, summary: () => ({ ladder: [], models: [], reason: g.reason }), save: () => {} };
}
