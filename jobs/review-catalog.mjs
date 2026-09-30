#!/usr/bin/env node
// Catalog review: checks the product, indication and therapeutic-area mappings in js/catalog.js against public
// sources, proposes corrections and additions, and applies a proposal only after three independent reviews agree.
//   node jobs/review-catalog.mjs                 run if the last run is older than MIP_CATALOG_INTERVAL_H (default 36)
//   node jobs/review-catalog.mjs --force         run now
//   node jobs/review-catalog.mjs --ta=IDERM,ONC  limit the audit and discovery to some therapeutic areas
//   node jobs/review-catalog.mjs --only=review   run some parts: review, audit, discover, inds
//   node jobs/review-catalog.mjs --dry           print, write nothing
//
// Scope: add and correct, never delete. What it may change:
//   an asset's US brand, company, mechanism or route (set), a development code (add_code), an asset's indications
//   within an area (add_link), a new asset in an area, or an asset of another area added to this one (add_asset), and a
//   new indication in an area (add_ind). Ids, names and the query fields of existing entries are never changed.
//   A link that looks wrong is not removed: once confirmed it is listed for a person under "Needs a person".
//
// Where the evidence comes from (no LLM): current US labels (openFDA drug/label, NDA and BLA only), the industry
// trials on ClinicalTrials.gov (the newest Phase 2 and 3, then the newest Phase 1), and for assets without a label two
// Europe PMC abstracts. The evidence is fetched again for every review, so a reviewer always sees the current sources.
//
// How a change gets in:
//   1. Proposed, by a rule (a label or a sponsor's own trial names an indication the asset lacks; a single-route label
//      disagrees with the route; an asset without a brand has exactly one) or by an LLM audit of each asset against its
//      evidence. An LLM proposal carries a sentence copied from the evidence; the job checks it is there and that it
//      names the proposed value, and drops the proposal if not.
//   2. Reviewed three times, at most once per run, so a change takes at least three runs (about six days): "verify"
//      (does the evidence state it?), "challenge" (look for a reason it is wrong: another formulation or company, a
//      comparator arm, a rewording) and "blind" (the question asked without the proposal; the answer must match it).
//      Each accept must quote the evidence; the job checks the quote. One reject ends the proposal (held back for 180
//      days); two "unsure" answers end it too. The three accepts must come from at least two different models.
//   3. Applied: appended to data/catalog-updates.js, which js/catalog.js applies on load in the browser and in the
//      snapshot job. A change is skipped there when a person has since edited the value it corrects.
// Discovery of new assets reads the industry trials of any phase (Phase 1 included) started in the last five years in
// an area's indications. A drug is a candidate when a trial title names it and two trials list it, or one trial of a
// company the area already tracks does (its early pipeline); two of the five candidates shown to the model are kept
// for those companies. It stops in an area that lists MIP_CATALOG_AREA_CAP assets (default 60).
// Users' saved watchlists are untouched: a new asset or indication is listed in Watchlist but not watched until the
// user picks it (or resets the area to the catalog).
//
// Gemini budget: the job shares the free quota with the intel job, so it is scheduled late in the Pacific day (quotas
// reset at midnight Pacific) and stops the moment that day ends. MIP_CATALOG_MAX_CALLS (default 36) caps the LLM calls
// per run and MIP_CATALOG_MAX_MIN (default 15) the run time; reviews go first, then audits (each asset every
// MIP_CATALOG_RECHECK_DAYS, default 90), then discovery (each area every 30 days). The rest waits for the next run.
// State and results: data/catalog-review.js (window.MIP_CATALOG_REVIEW), shown on the Data sources page.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { upstream } from './upstream.mjs';
import { createGemini, LlmError } from './gemini.mjs';

const require = createRequire(import.meta.url);
const CAT = require('../js/catalog.js');
const { match } = require('../js/sources.js');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT_UPD = path.join(HERE, '..', 'data', 'catalog-updates.js');
const OUT_REV = path.join(HERE, '..', 'data', 'catalog-review.js');            // for the app: summary, proposals, flags, history
const OUT_LEDGER = path.join(HERE, '..', 'data', 'catalog-review-ledger.json'); // for the job only: audit dates, rejections, condition counts
const args = process.argv.slice(2);
const FORCE = args.includes('--force'), DRY = args.includes('--dry');
const arg = (k) => (args.find((a) => a.startsWith(`--${k}=`)) || '').slice(k.length + 3).split(',').map((x) => x.trim()).filter(Boolean);
const ONLY = arg('only'), ONLY_TA = arg('ta');
const part = (p) => !ONLY.length || ONLY.includes(p);
const num = (v, d) => (Number(v) > 0 ? Number(v) : d);
const INTERVAL_H = num(process.env.MIP_CATALOG_INTERVAL_H, 36);
const MAX_MIN = num(process.env.MIP_CATALOG_MAX_MIN, 15);
const MAX_CALLS = num(process.env.MIP_CATALOG_MAX_CALLS, 36);
const RECHECK_DAYS = num(process.env.MIP_CATALOG_RECHECK_DAYS, 90);
const DISCOVER_DAYS = 30, REJECT_HOLD_DAYS = 180, MAX_PENDING = 60, PER_REVIEW = 4, PER_AUDIT = 4, NEW_PER_AREA = 2, CAND_SHOWN = 5, TRACKED_SHOWN = 2;
// Discovery stops adding to an area at this many assets. A new user's watchlist watches every asset of the area, and
// several live queries join every watched asset into one GET URL (ClinicalTrials.gov, Europe PMC), so the ceiling keeps
// an unattended job from growing those past what the sources accept. Hand edits to js/catalog.js are not capped.
const AREA_CAP = num(process.env.MIP_CATALOG_AREA_CAP, 60);
const REVIEWS = 3, LENSES = ['verify', 'challenge', 'blind'];

const now = new Date(), t0 = Date.now(), deadline = t0 + MAX_MIN * 60000;
const isoDay = (d) => new Date(d).toISOString().slice(0, 10);
const TODAY = isoDay(now);
const daysAgo = (n) => isoDay(now.getTime() - n * 864e5);
const ptDay = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const START_PT = ptDay();
const sha = (s) => crypto.createHash('sha1').update(String(s)).digest('hex');
const log = (...a) => console.log(...a);
const escRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const norm = (s) => String(s || '').normalize('NFKC').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const clip = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1).trim() + '…' : s; };
/* Evidence cut to n characters with its line breaks kept. */
const cut = (s, n) => (s.length > n ? s.slice(0, s.lastIndexOf('\n', n) > n * 0.7 ? s.lastIndexOf('\n', n) : n) + '\n[…]' : s);
const uniq = (a) => Array.from(new Set(a.filter(Boolean)));
/* Names as a whole-word pattern; hyphens and spaces in codes match either way (ARQ-151, ARQ 151). */
const termRe = (terms) => new RegExp('(?:^|[^a-z0-9])(?:' + uniq(terms).map((t) => escRe(t).replace(/\\?[- ]/g, '[- ]?')).join('|') + ')(?![a-z0-9])', 'i');
/* The quote must appear in the evidence (lower-cased, punctuation dropped); "…" may join pieces of it. */
function quoteIn(quote, normText) {
  const parts = String(quote || '').split(/\.\.\.|…|\[…\]/).map(norm).filter((p) => p.length >= 8);
  return parts.length > 0 && parts.reduce((n, p) => n + p.length, 0) >= 20 && parts.every((p) => normText.includes(p));
}
/* The first sentence of text that matches re, as a quote. */
function sentenceOf(text, re) {
  const s = String(text || '').split(/(?<=[.;])\s+|\n/).find((x) => re.test(x));
  return s ? clip(s, 400) : null;
}
const sig = (s) => norm(s).split(' ').filter((w) => w.length >= 4 && !/^(inhibitor|inhibitors|agonist|antagonist|antibody|receptor|therapeutics|pharmaceuticals|pharma|inc|ltd|limited|corporation|company|the|and)$/.test(w));

/* ---------- Previous state ---------- */
const fresh = (file) => { try { delete require.cache[require.resolve(file)]; return require(file); } catch { return null; } };
const prevUpd = fresh(OUT_UPD) || { changes: [] };
const prev = fresh(OUT_REV) || {};
const prevLedger = (() => { try { return JSON.parse(fs.readFileSync(OUT_LEDGER, 'utf8')); } catch { return {}; } })();
if (!FORCE && !ONLY.length && !ONLY_TA.length && prev.generated_utc && now - new Date(prev.generated_utc) < INTERVAL_H * 3600000) {
  log(`Catalog review last ran ${prev.generated_utc}; next run due after ${INTERVAL_H} hours. Nothing to do (--force to run now).`);
  process.exit(0);
}
const changes = (prevUpd.changes || []).slice();
const appliedKeys = new Set(changes.map((c) => c.key));
const ledger = { assets: Object.assign({}, prevLedger.assets), discover: Object.assign({}, prevLedger.discover), cond: Object.assign({}, prevLedger.cond) };
let pending = (prev.proposals || []).slice();
let rejected = (prevLedger.rejected || []).filter((r) => r.at >= daysAgo(REJECT_HOLD_DAYS));
let flagged = (prev.flagged || []).slice();
const history = (prev.history || []).slice(0, 200);
const counts = { proposed: 0, reviews: 0, applied: 0, rejected: 0, flagged: 0, audited: 0, discovered: 0, dropped: 0 };
const record = (kind, p, why) => { history.unshift({ at: now.toISOString(), kind, key: p.key, ta: p.ta || null, text: p.text, why: clip(why || '', 240) }); };

/* ---------- Sources, through the dev proxy when it runs ---------- */
const PROXY = `http://127.0.0.1:${Number(process.env.MIP_PROXY_PORT) || 8787}`;
const VIA_PROXY = await fetch(PROXY + '/health', { signal: AbortSignal.timeout(800) }).then((r) => r.json()).then((j) => j && j.mip === 'dev-proxy', () => false);
log(VIA_PROXY ? `Using the dev proxy at ${PROXY}` : 'Dev proxy not running: calling the sources directly, with the same limits');
let httpCalls = 0, httpErrors = 0, lastHttpErr = null;
async function get(url, maxAgeS = 12 * 3600) {
  const m = match(url); if (!m) throw new Error('No source registered for ' + url);
  httpCalls++;
  const r = VIA_PROXY
    ? await fetch(PROXY + '/src/' + m.key + m.path, { headers: { 'X-MIP-Client': 'review-catalog', 'X-MIP-Max-Age': String(maxAgeS) } }).then(async (x) => ({ status: x.status, body: await x.text() }))
    : await upstream(m.key, m.path, { maxAgeMs: maxAgeS * 1000 });
  if (r.status === 404) return null;
  if (r.status < 200 || r.status >= 300) throw Object.assign(new Error(`HTTP ${r.status} from ${m.key}: ${String(r.body).replace(/\s+/g, ' ').slice(0, 160)}`), { status: r.status });
  return JSON.parse(r.body);
}

/* ---------- Evidence ---------- */
const ROUTE_OF = { TOPICAL: 'Topical', CUTANEOUS: 'Topical', ORAL: 'Oral', SUBCUTANEOUS: 'Injectable', INTRAMUSCULAR: 'Injectable', INTRADERMAL: 'Injectable', INTRAVENOUS: 'Intravenous', 'RESPIRATORY (INHALATION)': 'Inhaled', NASAL: 'Intranasal', INTRAVITREAL: 'Intravitreal', OPHTHALMIC: 'Ophthalmic', INTRATHECAL: 'Intrathecal', VAGINAL: 'Vaginal', TRANSDERMAL: 'Transdermal' };
const ROUTE_WORDS = { Topical: /topical|cream|ointment|foam|gel|lotion|shampoo|cutaneous/i, Oral: /\boral|tablet|capsule/i, Injectable: /subcutaneous|intramuscular|injection|injectable|prefilled|autoinjector|\bs\.?c\.?\b/i, Intravenous: /intravenous|infusion|\bi\.?v\.?\b/i, Inhaled: /inhal/i, Intranasal: /nasal/i, Intravitreal: /intravitreal/i, Ophthalmic: /ophthalmic|eye drop/i, Intrathecal: /intrathecal/i, Vaginal: /vaginal/i, Transdermal: /transdermal|patch/i };
const CT_FIELDS = 'NCTId,BriefTitle,Phase,Condition,OverallStatus,LeadSponsorName,InterventionName,InterventionType,StartDate';
const CT_ADV = 'AREA[StudyType]INTERVENTIONAL AND AREA[LeadSponsorClass]INDUSTRY AND (AREA[Phase]PHASE2 OR AREA[Phase]PHASE3)';
const CT_EARLY = 'AREA[StudyType]INTERVENTIONAL AND AREA[LeadSponsorClass]INDUSTRY AND (AREA[Phase]EARLY_PHASE1 OR AREA[Phase]PHASE1)';
const CT_ANY_PHASE = '(AREA[Phase]EARLY_PHASE1 OR AREA[Phase]PHASE1 OR AREA[Phase]PHASE2 OR AREA[Phase]PHASE3)';
const phaseRank = (p) => (/Phase 3/.test(p) ? 3 : /Phase 2/.test(p) ? 2 : /Phase 1/.test(p) ? 1 : 0);
const qs = (o) => Object.keys(o).map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(o[k])).join('&');
const fdaQ = (q) => encodeURIComponent(q).replace(/%20/g, '+');

async function labelsFor(generic, brand) {
  const q = `(openfda.generic_name:"${generic.replace(/"/g, '')}"${brand ? ` OR openfda.brand_name:"${brand.replace(/"/g, '')}"` : ''}) AND (openfda.application_number:NDA* OR openfda.application_number:BLA*)`;
  const j = await get('https://api.fda.gov/drug/label.json?search=' + fdaQ(q) + '&limit=50', 24 * 3600);
  const by = new Map();
  for (const r of (j && j.results) || []) {
    const o = r.openfda || {}, gens = (o.generic_name || []).map((x) => x.toLowerCase()), br = (o.brand_name || [])[0] || '';
    if (!gens.includes(generic.toLowerCase()) && !(brand && br.toUpperCase() === brand.toUpperCase())) continue;
    const l = { brand: br.toUpperCase(), generic: gens[0] || generic, app: (o.application_number || [])[0] || '', routes: o.route || [], maker: (o.manufacturer_name || [])[0] || '', date: r.effective_time ? `${r.effective_time.slice(0, 4)}-${r.effective_time.slice(4, 6)}-${r.effective_time.slice(6, 8)}` : '', ind: (r.indications_and_usage || []).join(' ').replace(/\s+/g, ' '), moa: (r.mechanism_of_action || []).join(' ').replace(/\s+/g, ' '), epc: (o.pharm_class_epc || []).concat(o.pharm_class_moa || []).join('; '), setid: r.set_id || null };
    const k = l.brand + '|' + l.routes.join(','), cur = by.get(k);
    if (!cur || l.date > cur.date) by.set(k, l);
  }
  return Array.from(by.values()).slice(0, 4);
}
function trialRows(j) {
  return ((j && j.studies) || []).map((s) => {
    const ps = s.protocolSection || {}, st = ps.statusModule || {}, ph = (ps.designModule && ps.designModule.phases) || [];
    const iv = ((ps.armsInterventionsModule && ps.armsInterventionsModule.interventions) || []).filter((x) => /DRUG|BIOLOGICAL|COMBINATION/.test(x.type || 'DRUG'));
    return { nct: ps.identificationModule.nctId, title: ps.identificationModule.briefTitle || '', phase: ph.includes('PHASE3') ? 'Phase 3' : ph.includes('PHASE2') ? 'Phase 2' : ph.includes('PHASE1') || ph.includes('EARLY_PHASE1') ? 'Phase 1' : ph.join('/'), status: st.overallStatus || '', start: (st.startDateStruct && st.startDateStruct.date) || '', sponsor: (ps.sponsorCollaboratorsModule && ps.sponsorCollaboratorsModule.leadSponsor && ps.sponsorCollaboratorsModule.leadSponsor.name) || '', conds: (ps.conditionsModule && ps.conditionsModule.conditions) || [], intrs: iv.map((x) => x.name) };
  });
}
/* A current program: the trial is ongoing, or started in the last five years and not stopped early. */
const ACTIVE = /RECRUITING|NOT_YET_RECRUITING|ENROLLING_BY_INVITATION|ACTIVE_NOT_RECRUITING/;
const current = (t) => ACTIVE.test(t.status) || (t.start >= daysAgo(5 * 365) && !/TERMINATED|WITHDRAWN|SUSPENDED/.test(t.status));
const trialLine = (t) => `${t.nct} | ${t.phase} | ${t.status} | started ${t.start || 'n/a'} | sponsor: ${t.sponsor} | conditions: ${t.conds.join('; ')} | interventions: ${t.intrs.join('; ')} | ${t.title}`;
/* The newest Phase 2 and 3 trials, then the newest Phase 1 (a Phase 1/2 trial is in both answers; kept once). */
async function trialsFor(intr, n = 40) {
  const page = (adv, size) => get('https://clinicaltrials.gov/api/v2/studies?' + qs({ 'query.intr': intr, 'filter.advanced': adv, fields: CT_FIELDS, sort: 'StartDate:desc', pageSize: size }));
  const [late, early] = await Promise.all([page(CT_ADV, n), page(CT_EARLY, 10)]), seen = new Set();
  return trialRows(late).concat(trialRows(early)).filter((t) => !seen.has(t.nct) && seen.add(t.nct));
}
/* Up to max pages of a ClinicalTrials.gov search, as one answer. */
async function trialPages(params, max) {
  const studies = []; let token = null;
  for (let n = 0; n < max; n++) {
    const j = await get('https://clinicaltrials.gov/api/v2/studies?' + qs(token ? Object.assign({}, params, { pageToken: token }) : params));
    studies.push(...((j && j.studies) || [])); token = j && j.nextPageToken; if (!token) break;
  }
  return { studies };
}
async function trialsByIds(ids) { return ids.length ? trialRows(await get('https://clinicaltrials.gov/api/v2/studies?' + qs({ 'filter.ids': ids.join(','), fields: CT_FIELDS, pageSize: ids.length }))) : []; }
async function abstractsFor(q) {
  const j = await get('https://www.ebi.ac.uk/europepmc/webservices/rest/search?' + qs({ query: `(${q}) AND HAS_ABSTRACT:y`, resultType: 'core', pageSize: 2, format: 'json' }), 7 * 86400);
  return ((j && j.resultList && j.resultList.result) || []).map((r) => ({ id: r.pmid || r.id, title: r.title || '', year: r.pubYear || '', text: clip(String(r.abstractText || '').replace(/<[^>]+>/g, ' '), 900) }));
}
/* Evidence for one asset (current catalog entry), a candidate (names), or a list of trials. Memoised for the run. */
const evMemo = new Map();
function evidence(spec) {
  const k = JSON.stringify(spec);
  if (!evMemo.has(k)) evMemo.set(k, buildEvidence(spec).catch((e) => { evMemo.delete(k); throw e; }));
  return evMemo.get(k);
}
async function buildEvidence(spec) {
  let names, generic, brand = null, labels = [], trials = [], abstracts = [], a = null;
  if (spec.kind === 'asset') {
    a = findAsset(spec.ta, spec.asset); if (!a) throw new Error('asset gone: ' + spec.asset);
    generic = a.generic; brand = a.brand || null; names = uniq([a.generic, a.brand, a.short].concat(a.codes));
    [labels, trials] = await Promise.all([labelsFor(generic, brand), trialsFor(a.intr)]);
  } else if (spec.kind === 'cand') {
    generic = spec.generic; names = uniq([spec.generic].concat(spec.names || []));
    [labels, trials] = await Promise.all([labelsFor(generic, null), trialsFor(names.map((x) => (/\s|-/.test(x) ? `"${x}"` : x)).join(' OR '))]);
  } else {
    trials = await trialsByIds(spec.ids);
  }
  const nameRe = names ? termRe(names) : null;
  trials.forEach((t) => { t.names = nameRe ? t.intrs.some((n) => nameRe.test(n)) || nameRe.test(t.title) : true; });
  if (names && !labels.length) abstracts = await abstractsFor(names.slice(0, 4).map((x) => `"${x}"`).join(' OR ')).catch(() => []);
  const blocks = [];
  labels.forEach((l) => blocks.push({ src: 'FDA label ' + l.brand, url: l.setid ? `https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=${l.setid}` : 'https://open.fda.gov/apis/drug/label/', text: `FDA label: ${l.brand} (${l.generic}), ${l.app}, route ${l.routes.join(', ') || 'not stated'}, labeler ${l.maker}, revised ${l.date}. Pharmacologic class: ${l.epc || 'not stated'}.\nIndications: ${clip(l.ind, 2400)}\nMechanism: ${clip(l.moa, 500) || 'not stated'}` }));
  const shown = trials.filter((t) => t.names).sort((x, y) => phaseRank(y.phase) - phaseRank(x.phase)).slice(0, 16);
  if (shown.length) blocks.push({ src: 'ClinicalTrials.gov', url: 'https://clinicaltrials.gov/search?' + qs(spec.kind === 'ncts' ? { term: spec.ids.join(' OR ') } : { intr: generic }), text: 'Industry trials, highest phase first:\n' + shown.map(trialLine).join('\n') });
  abstracts.forEach((x) => blocks.push({ src: 'Europe PMC ' + x.id, url: 'https://europepmc.org/article/MED/' + x.id, text: `Abstract (${x.year}): ${x.title} ${x.text}` }));
  const text = blocks.map((b) => `[${b.src}]\n${b.text}`).join('\n\n');
  return { a, labels, trials, shown, blocks, text: text || '(no evidence found)', norm: norm(text), names: names || [] };
}

/* ---------- Catalog access (the catalog as users see it: js/catalog.js plus the applied changes) ---------- */
const AREAS = CAT.TAS.filter((t) => !ONLY_TA.length || ONLY_TA.includes(t.id));
const taOf = (id) => CAT.TAS.find((t) => t.id === id);
function findAsset(ta, id) { const t = taOf(ta), raw = t && t.assets.find((a) => a.id === id); return raw ? CAT.asset(raw) : null; }
const indOf = (ta, id) => { const t = taOf(ta); return t && t.inds.find((i) => i.id === id); };
const indMatch = (i, s) => i.re.test(s) && !(i.not && i.not.test(s));
const anyIndMatch = (s) => CAT.TAS.some((t) => t.inds.some((i) => indMatch(i, s)));
const FIELD_LABEL = { brand: 'US brand', company: 'company', moa: 'mechanism of action', route: 'route' };
function assetLine(t, a) { return `${a.id}: ${a.name}${a.brand ? ' (US brand ' + a.brand + ')' : ' (no US brand in the catalog)'} · company ${a.company} · mechanism ${a.moa} · route ${a.route} · codes ${(a.codes || []).join(', ') || 'none'} · indications in ${t.name}: ${(a.inds || []).map((k) => (indOf(t.id, k) || {}).name || k).join(', ') || 'none'}`; }
const indList = (t) => t.inds.map((i) => `${i.id} = ${i.name}`).join('; ');

/* ---------- Proposals ---------- */
function describe(p) {
  const t = taOf(p.ta), a = p.asset ? findAsset(p.ta, p.asset) : null, an = a ? a.name : p.asset, iname = p.ind ? ((indOf(p.ta, p.ind) || {}).name || p.ind) : '';
  if (p.op === 'set') return `${an}: change the ${FIELD_LABEL[p.field]} from "${p.from || 'none'}" to "${p.to}"`;
  if (p.op === 'add_code') return `${an}: add the development code ${p.value}`;
  if (p.op === 'add_link') return `${an}: add the indication ${iname} (${t.name})`;
  if (p.op === 'flag_link') return `${an}: the indication ${iname} (${t.name}) may be wrong`;
  if (p.op === 'add_asset') return `${t.name}: add the asset ${p.entry.name}${p.entry.brand ? ' (' + p.entry.brand + ')' : ''} by ${p.entry.company} for ${p.entry.inds.map((k) => (indOf(p.ta, k) || {}).name || k).join(', ')}`;
  if (p.op === 'add_ind') return `${t.name}: add the indication ${p.entry.name}`;
  return p.op;
}
function keyOf(p) {
  if (p.op === 'set') return `set|${p.asset}|${p.field}|${norm(p.to)}`;
  if (p.op === 'add_code') return `code|${p.asset}|${norm(p.value)}`;
  if (p.op === 'add_link') return `link|${p.ta}|${p.asset}|${p.ind}`;
  if (p.op === 'flag_link') return `flag|${p.ta}|${p.asset}|${p.ind}`;
  if (p.op === 'add_asset') return `asset|${p.ta}|${p.entry.id}`;
  return `ind|${p.ta}|${norm(p.entry.name)}`;
}
/* Is the change still a change against the current catalog? */
function stillOpen(p) {
  const a = p.asset ? findAsset(p.ta, p.asset) : null, t = taOf(p.ta);
  if (!t) return false;
  if (p.op === 'set') return !!a && String(a[p.field] || '') === String(p.from || '') && norm(p.to) !== norm(p.from);
  if (p.op === 'add_code') return !!a && !a.codes.concat([a.name, a.brand || '', a.generic]).some((c) => norm(c) === norm(p.value));
  if (p.op === 'add_link') return !!a && !!indOf(p.ta, p.ind) && !a.inds.includes(p.ind);
  if (p.op === 'flag_link') return !!a && a.inds.includes(p.ind) && !flagged.some((f) => f.key === p.key);
  if (p.op === 'add_asset') return !t.assets.some((x) => x.id === p.entry.id || norm(CAT.asset(x).generic) === norm(p.entry.generic || p.entry.name));
  if (p.op === 'add_ind') return !t.inds.some((i) => i.id === p.entry.id || norm(i.name) === norm(p.entry.name));
  return false;
}
const pendingKeys = () => new Set(pending.map((p) => p.key));
function propose(p, proposer) {
  p.key = keyOf(p);
  if (appliedKeys.has(p.key) || pendingKeys().has(p.key) || rejected.some((r) => r.key === p.key) || flagged.some((f) => f.key === p.key) || !stillOpen(p)) return false;
  Object.assign(p, { text: describe(p), proposer, at: now.toISOString(), reviews: [], unsure: 0 });
  pending.push(p); counts.proposed++;
  log(`  proposed  ${p.text}${proposer === 'rules' ? ' (rule)' : ' (' + proposer + ')'}`);
  return true;
}

/* ---------- LLM ---------- */
let llm = null, llmStop = null, llmCalls = 0;
const outOfTime = () => Date.now() > deadline;
const canAsk = () => !llmStop && !outOfTime() && llmCalls < MAX_CALLS && ptDay() === START_PT;
async function ask(o) {
  if (ptDay() !== START_PT) { llmStop = llmStop || new Error('The Pacific day ended; its new quota is left to the intel job'); throw llmStop; }
  if (llmStop) throw llmStop;
  llmCalls++;
  try { return await llm.generate(Object.assign({ profile: 'extract', maxOutputTokens: 4096 }, o)); }
  catch (e) { if (e instanceof LlmError && (e.code === 'auth' || ((e.code === 'quota' || e.code === 'busy') && !o.soft))) { llmStop = e; log(`llm       stopping: ${e.message}`); } throw e; }
}
const S = (t, extra) => Object.assign({ type: t }, extra || {});
const itemsOf = (d, k) => (Array.isArray(d) ? d : d && d[k]) || [];

/* The quote must be in the evidence and must name the value it supports. */
function quoteFits(p, quote, ev) {
  if (!quoteIn(quote, ev.norm)) return false;
  const q = norm(quote);
  if (p.op === 'set') { if (p.field === 'route') return ROUTE_WORDS[p.to].test(quote) || Object.keys(ROUTE_OF).some((r) => ROUTE_OF[r] === p.to && q.includes(norm(r))); const w = sig(p.to); return !w.length ? q.includes(norm(p.to)) : w.some((x) => q.includes(x)); }
  if (p.op === 'add_code') return q.includes(norm(p.value));
  if (p.op === 'add_link' || p.op === 'flag_link') { const i = indOf(p.ta, p.ind); return !!i && (i.re.test(quote) || (i.label && i.label.test(quote))) || p.op === 'flag_link'; }
  if (p.op === 'add_asset') return termRe([p.entry.generic || p.entry.name].concat(p.entry.codes || [])).test(quote);
  if (p.op === 'add_ind') return p.conds.some((c) => q.includes(norm(c)));
  return false;
}

/* ---------- 1. Reviews ---------- */
const LENS_SYSTEM = {
  verify: 'You check proposed corrections to a drug catalog used by a medical affairs team. Judge only from the evidence given (FDA labels, ClinicalTrials.gov records, abstracts), never from memory. accept = the evidence directly states what the change says; quote the sentence or trial line that states it, copied exactly. reject = the evidence contradicts it, or it would make the catalog less accurate. unsure = the evidence does not settle it. Return JSON only.',
  challenge: 'You are the skeptical second reviewer of proposed changes to a drug catalog used by a medical affairs team. Look for a reason each change is wrong, judging only from the evidence given: it describes another product or formulation of the same molecule (oral versus topical, a biosimilar, a combination), another company\'s product or trial, a comparator or background therapy rather than the drug itself, an old, terminated or withdrawn trial rather than a current program, a basket or platform trial listing many conditions rather than a program in this one, an indication outside the therapeutic area, outdated evidence superseded by newer evidence, or a mere rewording of a value that was already right. accept only if you find no such problem and the evidence supports the change; quote the sentence or trial line, copied exactly. Otherwise reject (say why) or unsure. Return JSON only.',
  blind: 'You answer factual questions about drugs for a medical affairs team, judging only from the evidence given (FDA labels, ClinicalTrials.gov records, abstracts), never from memory. For each question pick the answer the evidence supports and quote the sentence or trial line that supports it, copied exactly. If the evidence does not settle it, answer unclear. Return JSON only.'
};
/* The blind question for a proposal: options shown without saying which one was proposed; accept = the proposed one. */
function blindQuestion(p) {
  const a = p.asset ? findAsset(p.ta, p.asset) : null, t = taOf(p.ta), who = a ? `${a.name}${a.brand ? ' (' + a.brand + ')' : ''}` : '';
  if (p.op === 'set') {
    const opts = [p.from || 'none', p.to]; if (sha(p.key).charCodeAt(0) % 2) opts.reverse();
    return { q: `What is the current ${FIELD_LABEL[p.field]} of ${who}${p.field === 'route' ? ' (one of ' + CAT.ROUTES.join(', ') + ')' : ''}? A) ${opts[0]}  B) ${opts[1]}  C) neither`, choices: ['A', 'B', 'C', 'unclear'], yes: opts[0] === p.to ? 'A' : 'B' };
  }
  if (p.op === 'add_code') return { q: `Is "${p.value}" a development code or other name of ${who} itself (not of a comparator, a combination or another company's drug)?`, choices: ['yes', 'no', 'unclear'], yes: 'yes' };
  if (p.op === 'add_link') return { q: `Is ${who} approved for, or in current Phase 2 or 3 trials (ongoing, or started in the last five years) run by its own company for, ${(indOf(p.ta, p.ind) || {}).name}?`, choices: ['yes', 'no', 'unclear'], yes: 'yes' };
  if (p.op === 'flag_link') return { q: `Does the evidence show that ${who} is approved for, or in Phase 2 or 3 development for, ${(indOf(p.ta, p.ind) || {}).name}? Answer no only if the evidence shows it is not (for example a discontinued program, or trials only in other conditions).`, choices: ['yes', 'no', 'unclear'], yes: 'no' };
  if (p.op === 'add_asset') return { q: `Is ${p.entry.name} a distinct drug (not a formulation, biosimilar or generic of another drug) that its company develops or markets for ${p.entry.inds.map((k) => (indOf(p.ta, k) || {}).name).join(', ')}, with ${p.entry.company} as that company and ${p.entry.route} as its route?`, choices: ['yes', 'no', 'unclear'], yes: 'yes' };
  return { q: `Is "${p.entry.name}" (trial conditions: ${p.conds.join('; ')}) a distinct disease of the therapeutic area "${t.name}" (${t.desc}), not already covered by: ${t.inds.map((i) => i.name).join(', ')}?`, choices: ['yes', 'no', 'unclear'], yes: 'yes' };
}
/* The next review: the three lenses in turn; if all three accepts came from one model, a 'verify' by another model. */
function lensOf(p) {
  const acc = p.reviews.filter((r) => r.verdict === 'accept');
  return acc.length < REVIEWS ? LENSES[acc.length] : 'extra';
}
const usedModels = (p) => uniq([p.proposer].concat(p.reviews.map((r) => r.model)).filter((m) => m && m !== 'rules'));
async function reviewBatch(stage, batch) {
  const lens = stage === 'extra' ? 'verify' : stage, extra = stage === 'extra';
  const evs = [];
  for (const p of batch) { try { evs.push(await evidence(p.ev)); } catch (e) { evs.push(null); httpErrors++; lastHttpErr = e.message; } }
  const live = batch.map((p, i) => ({ p, ev: evs[i] })).filter((x) => x.ev);
  if (!live.length) return;
  const blinds = live.map((x) => (lens === 'blind' ? blindQuestion(x.p) : null));
  const items = live.map((x, i) => {
    const t = taOf(x.p.ta), a = x.p.asset ? findAsset(x.p.ta, x.p.asset) : null;
    const head = lens === 'blind' ? `Question: ${blinds[i].q}\nAnswers: ${blinds[i].choices.join(', ')}` : `Therapeutic area: ${t.name} (indications: ${indList(t)})\n${a ? 'Current catalog entry: ' + assetLine(t, a) + '\n' : ''}Proposed change: ${x.p.text}${x.p.entry ? '\nProposed entry: ' + JSON.stringify(x.p.entry) : ''}`;
    return `### Item ${i}\n${head}\nEvidence:\n<<<\n${cut(x.ev.text, 7000)}\n>>>`;
  }).join('\n\n');
  const verdicts = lens === 'blind' ? uniq(blinds.flatMap((b) => b.choices)) : ['accept', 'reject', 'unsure'];
  const schema = S('OBJECT', { properties: { items: S('ARRAY', { items: S('OBJECT', { properties: { i: S('INTEGER'), [lens === 'blind' ? 'answer' : 'verdict']: S('STRING', { enum: verdicts }), quote: S('STRING'), why: S('STRING') }, required: ['i', lens === 'blind' ? 'answer' : 'verdict', 'quote', 'why'] }) }) }, required: ['items'] });
  const prompt = `Today is ${TODAY}.\n\n${items}\n\nReturn JSON: {"items": [{"i": 0, "${lens === 'blind' ? 'answer": "<one of the answers listed>' : 'verdict": "<accept|reject|unsure>'}", "quote": "<copied exactly from that item's evidence>", "why": "<one short sentence>"}]}`;
  const used = uniq(live.flatMap((x) => usedModels(x.p)));
  let r;
  try { r = await ask({ system: LENS_SYSTEM[lens], prompt, schema, avoid: used, exclude: extra ? used : undefined, soft: extra }); }
  catch (e) { log(`review    ${lens} batch failed: ${e.message}`); return; }
  const got = new Set();
  for (const x of itemsOf(r.data, 'items')) {
    const it = live[x.i]; if (!it || got.has(x.i)) continue; got.add(x.i);
    const p = it.p;
    let verdict = lens === 'blind' ? (x.answer === blinds[x.i].yes ? 'accept' : x.answer === 'unclear' ? 'unsure' : 'reject') : x.verdict;
    if (!['accept', 'reject', 'unsure'].includes(verdict)) verdict = 'unsure';
    if (verdict === 'accept' && !quoteFits(p, x.quote, it.ev)) { verdict = 'unsure'; x.why = 'Accepted without a matching quote from the evidence: not counted. ' + (x.why || ''); }
    p.reviews.push({ lens, model: r.model, verdict, quote: clip(x.quote, 400), why: clip(x.why, 240), at: now.toISOString() });
    counts.reviews++;
    log(`  ${lens.padEnd(9)} ${verdict.padEnd(7)} ${p.text} (${r.model})${verdict !== 'accept' ? ' · ' + clip(x.why, 120) : ''}`);
    settle(p);
  }
}
function settle(p) {
  const acc = p.reviews.filter((r) => r.verdict === 'accept'), rej = p.reviews.find((r) => r.verdict === 'reject'), uns = p.reviews.filter((r) => r.verdict === 'unsure').length;
  if (rej || uns >= 2) {
    const why = rej ? `${rej.lens} review: ${rej.why}` : 'Not confirmed by the evidence (two reviewers were unsure)';
    pending = pending.filter((x) => x !== p);
    rejected.unshift({ key: p.key, ta: p.ta, text: p.text, at: now.toISOString(), why: clip(why, 240), reviews: p.reviews });
    record('rejected', p, why); counts.rejected++;
    return;
  }
  if (acc.length < REVIEWS || uniq(acc.map((r) => r.model)).length < 2) return;
  pending = pending.filter((x) => x !== p);
  if (!stillOpen(p)) { record('outdated', p, 'The catalog changed while this was under review'); return; }
  if (p.op === 'flag_link') {
    flagged.unshift({ key: p.key, ta: p.ta, asset: p.asset, ind: p.ind, text: p.text, at: now.toISOString(), why: p.why, reviews: p.reviews.map((r) => ({ lens: r.lens, model: r.model, quote: r.quote })) });
    record('flagged', p, p.why); counts.flagged++;
    return;
  }
  const c = { id: 'cu-' + sha(p.key).slice(0, 10), key: p.key, op: p.op, ta: p.ta, asset: p.asset || undefined, field: p.field, from: p.op === 'set' ? p.from || '' : undefined, to: p.to, value: p.value, ind: p.ind, entry: p.entry, text: p.text, why: p.why, sources: p.sources, proposer: p.proposer, proposed_utc: p.at, reviews: acc.map((r) => ({ lens: r.lens, model: r.model, quote: r.quote, at: r.at })), applied_utc: now.toISOString() };
  Object.keys(c).forEach((k) => c[k] === undefined && delete c[k]);
  const res = CAT.applyUpdates([c]);
  if (!res.applied) { record('outdated', p, 'The change no longer applies to the catalog'); return; }
  changes.push(c); appliedKeys.add(c.key); counts.applied++;
  record('applied', p, p.why);
  log(`  APPLIED   ${p.text}`);
}
async function runReviews() {
  // Runs before anything is proposed, so a proposal gets at most one review per run. Oldest first, batched by stage.
  const todo = pending.filter((p) => !ONLY_TA.length || ONLY_TA.includes(p.ta)).sort((a, b) => a.at.localeCompare(b.at));
  const byLens = {}; todo.forEach((p) => { if (!stillOpen(p)) { pending = pending.filter((x) => x !== p); record('outdated', p, 'The catalog changed while this was under review'); return; } (byLens[lensOf(p)] = byLens[lensOf(p)] || []).push(p); });
  for (const lens of ['extra', 'blind', 'challenge', 'verify']) {
    const list = byLens[lens] || [];
    for (let i = 0; i < list.length && canAsk(); i += PER_REVIEW) await reviewBatch(lens, list.slice(i, i + PER_REVIEW));
  }
}

/* ---------- 2. Audit: rules, then the LLM, per asset ---------- */
function ruleProposals(t, a, ev) {
  const own = ev.trials.filter((x) => x.names && new RegExp(a.sponsor, 'i').test(x.sponsor) && (!a.only || x.intrs.some((n) => a.only.test(n))));
  const mine = ev.labels.filter((l) => (a.brand ? l.brand === a.brand.toUpperCase() : l.generic === a.generic && l.routes.some((r) => ROUTE_OF[r] === a.route)) && (!a.labelRoute || l.routes.includes(a.labelRoute)));
  const labelSrc = (l) => ({ label: 'FDA label ' + l.brand, url: l.setid ? `https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=${l.setid}` : null });
  // Links: an indication in the product's own label, or in a Phase 2 or 3 trial its company runs.
  for (const i of t.inds) {
    if (a.inds.includes(i.id)) continue;
    const l = mine.find((x) => i.label && i.label.test(x.ind));
    if (l) { propose({ op: 'add_link', ta: t.id, asset: a.id, ind: i.id, why: `The ${l.brand} label lists it`, quote: sentenceOf(l.ind, i.label), sources: [labelSrc(l)], ev: { kind: 'asset', ta: t.id, asset: a.id } }, 'rules'); continue; }
    // A focused trial (at most three conditions, so not a basket or platform study); one in Phase 3, or two in Phase 2.
    const tr = own.filter((x) => /Phase [23]/.test(x.phase) && current(x) && x.conds.length <= 3 && x.conds.some((c) => indMatch(i, c)));
    if (tr.some((x) => x.phase === 'Phase 3') || tr.length >= 2) propose({ op: 'add_link', ta: t.id, asset: a.id, ind: i.id, why: `${tr.length} Phase 2 or 3 trial${tr.length > 1 ? 's' : ''} by ${tr[0].sponsor}`, quote: trialLine(tr[0]), sources: tr.slice(0, 3).map((x) => ({ label: x.nct, url: 'https://clinicaltrials.gov/study/' + x.nct })), ev: { kind: 'asset', ta: t.id, asset: a.id } }, 'rules');
  }
  // Route: every label of the product states one route that differs (not for molecules sold by several routes).
  const routes = uniq(mine.flatMap((l) => l.routes.map((r) => ROUTE_OF[r] || 'Other')));
  if (mine.length && routes.length === 1 && routes[0] !== 'Other' && routes[0] !== a.route && !a.labelRoute && !a.sibling)
    propose({ op: 'set', ta: t.id, asset: a.id, field: 'route', from: a.route, to: routes[0], why: `Every current label of the product gives route ${mine[0].routes.join(', ')}`, quote: `route ${mine[0].routes.join(', ')}`, sources: mine.slice(0, 2).map(labelSrc), ev: { kind: 'asset', ta: t.id, asset: a.id } }, 'rules');
  // Brand: no brand in the catalog, and exactly one branded label of the same molecule by the catalog's route.
  if (!a.brand) {
    const same = ev.labels.filter((l) => l.generic === a.generic && l.routes.some((r) => ROUTE_OF[r] === a.route));
    const brands = uniq(same.map((l) => l.brand)).filter((b) => b && norm(b) !== norm(a.generic));
    if (brands.length === 1) propose({ op: 'set', ta: t.id, asset: a.id, field: 'brand', from: '', to: brands[0], why: `The only ${a.route.toLowerCase()} label of ${a.generic} is ${brands[0]}`, quote: `FDA label: ${brands[0]}`, sources: same.slice(0, 1).map(labelSrc), ev: { kind: 'asset', ta: t.id, asset: a.id } }, 'rules');
  }
  // Conditions the company studies in Phase 2 or 3 that no indication of any area covers: counted for the indication step.
  const cc = ledger.cond[t.id] = ledger.cond[t.id] || {};
  for (const x of own.filter((y) => phaseRank(y.phase) >= 2)) for (const c of x.conds) {
    if (anyIndMatch(c) || /healthy|volunteer|pharmacokinetic|bioequivalence|drug interaction|renal impairment|hepatic impairment/i.test(c)) continue;
    const k = norm(c); if (!k || k.length < 4) continue;
    const e = cc[k] = cc[k] || { c, ncts: [], assets: [] };
    if (!e.ncts.includes(x.nct)) e.ncts = e.ncts.concat([x.nct]).slice(-8);
    if (!e.assets.includes(a.id)) e.assets = e.assets.concat([a.id]);
  }
}
const AUDIT_SYSTEM = 'You audit a drug catalog used by a medical affairs team against public evidence (current FDA labels, ClinicalTrials.gov records, abstracts). Report only clear factual errors or omissions that the evidence shows; never reword a value that is already right, never use memory, and when unsure report nothing. Kinds: company = the company that now develops or markets the drug differs from the catalog (an acquisition, a licence); brand = the catalog lacks the US brand or has a wrong one, exactly as on the FDA label of this same product and route; moa = the catalog\'s mechanism of action is wrong (not merely worded differently); code = a development code of this drug seen in the evidence and missing from the catalog; link = an indication of the listed therapeutic area that the drug is approved for, or in current Phase 2 or 3 trials run by its own company for (ongoing, or started in the last five years; not an old, terminated or withdrawn trial, nor a basket or platform trial listing many conditions), missing from the catalog; wrong_link = evidence shows a catalog indication is wrong for this drug. Each issue needs a quote copied exactly from that drug\'s evidence that states the new value. Return JSON only.';
const KINDS = ['company', 'brand', 'moa', 'code', 'link', 'wrong_link'];
async function auditBatch(t, batch) {
  const evs = [];
  for (const a of batch) { try { const ev = await evidence({ kind: 'asset', ta: t.id, asset: a.id }); ruleProposals(t, a, ev); evs.push(ev); } catch (e) { evs.push(null); httpErrors++; lastHttpErr = e.message; log(`  evidence  ${a.id} failed: ${e.message}`); } }
  const live = batch.map((a, i) => ({ a, ev: evs[i] })).filter((x) => x.ev);
  if (!live.length) return false;
  if (!canAsk()) return false;
  const ids = live.map((x) => x.a.id);
  const schema = S('OBJECT', { properties: { issues: S('ARRAY', { items: S('OBJECT', { properties: { asset: S('STRING', { enum: ids }), kind: S('STRING', { enum: KINDS }), value: S('STRING'), indication: S('STRING', { enum: t.inds.map((i) => i.id).concat(['none']) }), quote: S('STRING'), why: S('STRING') }, required: ['asset', 'kind', 'value', 'indication', 'quote', 'why'] }) }) }, required: ['issues'] });
  const prompt = `Therapeutic area: ${t.name}. Its indications: ${indList(t)}.\nToday is ${TODAY}.\n\n` + live.map((x) => `### ${assetLine(t, x.a)}\nEvidence for ${x.a.id}:\n<<<\n${cut(x.ev.text, 6500)}\n>>>`).join('\n\n') + `\n\nReturn JSON: {"issues": [{"asset": "<id>", "kind": "<${KINDS.join('|')}>", "value": "<the correct value; for link and wrong_link the indication name>", "indication": "<indication id for link and wrong_link, else none>", "quote": "<copied exactly from that asset's evidence>", "why": "<one short sentence>"}]}. An empty list is the usual answer.`;
  let r;
  try { r = await ask({ system: AUDIT_SYSTEM, prompt, schema, maxOutputTokens: 4096 }); }
  catch (e) { log(`audit     ${t.id} batch failed: ${e.message}`); return false; }
  for (const x of itemsOf(r.data, 'issues')) {
    const it = live.find((y) => y.a.id === x.asset); if (!it) continue;
    const a = it.a, ev = it.ev, value = clip(x.value, 80), base = { ta: t.id, asset: a.id, why: clip(x.why, 240), quote: clip(x.quote, 400), sources: ev.blocks.filter((b) => norm(b.text).includes(norm(x.quote).slice(0, 40))).slice(0, 2).map((b) => ({ label: b.src, url: b.url })), ev: { kind: 'asset', ta: t.id, asset: a.id } };
    let p = null;
    if (x.kind === 'company' && value && !sig(a.company).some((w) => sig(value).includes(w)) && !sig(value).every((w) => norm(a.company).includes(w))) p = Object.assign(base, { op: 'set', field: 'company', from: a.company, to: value });
    else if (x.kind === 'brand' && ev.labels.some((l) => l.brand === value.toUpperCase() && (l.generic === a.generic)) && value.toUpperCase() !== String(a.brand || '').toUpperCase()) p = Object.assign(base, { op: 'set', field: 'brand', from: a.brand || '', to: value.toUpperCase() });
    else if (x.kind === 'moa' && value.length <= 60 && sig(value).length && !sig(value).every((w) => norm(a.moa).includes(w)) && !sig(a.moa).every((w) => norm(value).includes(w))) p = Object.assign(base, { op: 'set', field: 'moa', from: a.moa, to: value });
    else if (x.kind === 'code' && /\d/.test(value) && value.length <= 20 && termRe([value]).test(ev.text)) p = Object.assign(base, { op: 'add_code', value });
    else if (x.kind === 'link' && indOf(t.id, x.indication)) p = Object.assign(base, { op: 'add_link', ind: x.indication });
    else if (x.kind === 'wrong_link' && a.inds.includes(x.indication)) p = Object.assign(base, { op: 'flag_link', ind: x.indication });
    if (!p || !quoteFits(p, p.quote, ev)) { counts.dropped++; log(`  dropped   ${a.id} ${x.kind} "${value}": ${p ? 'quote not in the evidence or does not name the value' : 'not a change, or not checkable'}`); continue; }
    propose(p, r.model);
  }
  return true;
}
async function runAudit() {
  const due = [];
  for (const t of AREAS) for (const raw of t.assets) { const k = t.id + ':' + raw.id; if (!ledger.assets[k] || ledger.assets[k] < daysAgo(RECHECK_DAYS)) due.push({ t, id: raw.id, last: ledger.assets[k] || '' }); }
  due.sort((x, y) => x.last.localeCompare(y.last) || AREAS.indexOf(x.t) - AREAS.indexOf(y.t));
  log(`audit     ${due.length} assets due`);
  for (let i = 0; i < due.length && canAsk() && pending.length < MAX_PENDING;) {
    const t = due[i].t, batch = [];
    while (i < due.length && due[i].t === t && batch.length < PER_AUDIT) { const a = findAsset(t.id, due[i].id); if (a) batch.push(a); i++; }
    if (!batch.length) continue;
    const ok = await auditBatch(t, batch);
    if (ok) batch.forEach((a) => { ledger.assets[t.id + ':' + a.id] = TODAY; counts.audited++; });
  }
}

/* ---------- 3. Discovery: new assets from industry trials of any phase in an area's indications ---------- */
const NOT_DRUG = /placebo|vehicle|standard of care|standard therapy|best supportive|investigator'?s? choice|physician'?s? choice|usual care|saline|sham|no intervention|observation|comparator|background|rescue|matching/i;
const FORM_WORDS = /\b(tablets?|capsules?|cream|ointment|foam|gel|lotion|injection|injectable|solution|suspension|infusion|oral|topical|subcutaneous|intravenous|sc|iv|film[- ]coated|prefilled syringe|autoinjector|pen|high dose|low dose|dose|arm|group|cohort|mg|mcg|µg|ml|kg)\b/gi;
function cleanName(n) { return String(n).replace(/\([^)]*\)/g, ' ').replace(/\d+(\.\d+)?\s*(mg\/kg|mg|mcg|µg|g|ml|%|iu|units?)\b/gi, ' ').replace(FORM_WORDS, ' ').replace(/[^A-Za-z0-9\- ]+/g, ' ').replace(/\s+/g, ' ').trim(); }
const knownRe = new Map();
function knownIn(t, name) {
  if (!knownRe.has(t)) knownRe.set(t, t.assets.map((raw) => { const a = CAT.asset(raw); return { a, re: termRe(uniq([a.generic, a.brand, a.short].concat(a.codes))) }; }));
  const hit = knownRe.get(t).find((x) => x.re.test(name)); return hit ? hit.a : null;
}
function knownAnywhere(name) { for (const t of CAT.TAS) { const a = knownIn(t, name); if (a) return a; } return null; }
const DISCOVER_SYSTEM = 'You help keep the competitive landscape of a therapeutic area current for a medical affairs team. From candidate drugs found in recent industry trials of any phase (early Phase 1 programs count), pick those that are distinct investigational or marketed drugs developed by their own company for the area\'s indications. Leave out comparators, background or rescue therapy, old generics and biosimilars, supplements, devices, and combinations of drugs already tracked. Fill each field only from the evidence and quote the sentence or trial line behind the company, the route and, if stated, the mechanism, copied exactly; use "Not stated" for a mechanism the evidence does not give. Return JSON only.';
async function runDiscover() {
  const t = AREAS.filter((x) => !ledger.discover[x.id] || ledger.discover[x.id] < daysAgo(DISCOVER_DAYS)).sort((x, y) => String(ledger.discover[x.id] || '').localeCompare(String(ledger.discover[y.id] || '')))[0];
  if (!t) return;
  if (t.assets.length >= AREA_CAP) { ledger.discover[t.id] = TODAY; log(`discover  ${t.id} already lists ${t.assets.length} assets; skipped`); return; }
  const since = daysAgo(5 * 365), cands = new Map();
  // The lead sponsors of the area's assets: one trial of theirs is enough to make a candidate (their early pipeline).
  const tracked = uniq(t.assets.map((raw) => CAT.asset(raw).sponsor)).filter((s) => s && s !== '.').map((s) => { try { return new RegExp(s, 'i'); } catch { return null; } }).filter(Boolean);
  for (const i of t.inds) {
    let rows;
    try { rows = trialRows(await trialPages({ 'query.cond': i.ct, 'filter.advanced': `AREA[StudyType]INTERVENTIONAL AND AREA[LeadSponsorClass]INDUSTRY AND ${CT_ANY_PHASE} AND AREA[StartDate]RANGE[${since},MAX]`, fields: CT_FIELDS, sort: 'StartDate:desc', pageSize: 1000 }, 3)); }
    catch (e) { httpErrors++; lastHttpErr = e.message; log(`discover  ${t.id} ${i.id} trials failed: ${e.message}`); return; }
    for (const r of rows) {
      const ph = phaseRank(r.phase);
      if (!ph || !r.conds.some((c) => indMatch(i, c))) continue;
      for (const n of r.intrs) {
        if (NOT_DRUG.test(n)) continue;
        const base = cleanName(n); if (base.length < 3 || /^(and|with|plus|or)$/i.test(base) || knownIn(t, base)) continue;
        const k = norm(base), e = cands.get(k) || { name: base, ncts: new Set(), titled: new Set(), sponsors: new Set(), inds: new Set(), phase: 0, tracked: false };
        e.ncts.add(r.nct); if (termRe([base]).test(r.title)) e.titled.add(r.nct); e.sponsors.add(r.sponsor); e.inds.add(i.id);
        e.phase = Math.max(e.phase, ph); if (tracked.some((x) => x.test(r.sponsor))) e.tracked = true; cands.set(k, e);
      }
    }
  }
  const held = new Set(rejected.map((r) => r.key));
  // Named in a trial title, and listed in two trials or in one of a tracked company. Highest phase first; two of the
  // places are kept for tracked companies so their early programs are not always outranked by Phase 3 drugs.
  const ok = Array.from(cands.values()).filter((e) => e.titled.size >= 1 && (e.ncts.size >= 2 || e.tracked) && !held.has(`asset|${t.id}|${norm(e.name).replace(/ /g, '')}`));
  const rank = (a, b) => b.phase - a.phase || b.titled.size - a.titled.size || b.ncts.size - a.ncts.size;
  const kept = ok.filter((e) => e.tracked).sort(rank).slice(0, TRACKED_SHOWN);
  const top = kept.concat(ok.filter((e) => !kept.includes(e)).sort(rank)).slice(0, CAND_SHOWN);
  // Marked as done once the model has looked at the candidates (or there were none), so a spent quota retries next run.
  log(`discover  ${t.id}: ${cands.size} unlisted interventions, ${ok.length} named in a trial title and in two trials or one of a tracked company; ${top.length} shown`);
  if (!top.length) { ledger.discover[t.id] = TODAY; return; }
  if (!canAsk()) return;
  const evs = [];
  for (const e of top) { try { evs.push(await evidence({ kind: 'cand', ta: t.id, generic: e.name.toLowerCase(), names: [e.name] })); } catch (err) { evs.push(null); httpErrors++; lastHttpErr = err.message; } }
  const live = top.map((e, i) => ({ e, ev: evs[i], other: knownAnywhere(e.name) })).filter((x) => x.ev && x.ev.shown.length);
  if (!live.length) { if (!evs.includes(null)) ledger.discover[t.id] = TODAY; return; }
  const grps = uniq(t.assets.map((a) => a.grp)).concat(['Other']);
  const schema = S('OBJECT', { properties: { drugs: S('ARRAY', { items: S('OBJECT', { properties: { i: S('INTEGER'), include: S('BOOLEAN'), name: S('STRING'), generic: S('STRING'), codes: S('ARRAY', { items: S('STRING') }), company: S('STRING'), company_quote: S('STRING'), moa: S('STRING'), moa_quote: S('STRING'), grp: S('STRING', { enum: grps }), route: S('STRING', { enum: CAT.ROUTES }), route_quote: S('STRING'), indications: S('ARRAY', { items: S('STRING', { enum: t.inds.map((i) => i.id) }) }), why: S('STRING') }, required: ['i', 'include', 'name', 'generic', 'codes', 'company', 'company_quote', 'moa', 'moa_quote', 'grp', 'route', 'route_quote', 'indications', 'why'] }) }) }, required: ['drugs'] });
  const prompt = `Therapeutic area: ${t.name} (${t.desc}). Indications: ${indList(t)}.\nAlready tracked: ${t.assets.map((a) => a.name).join(', ')}.\nMechanism groups used in this area: ${grps.join('; ')}.\nToday is ${TODAY}. Pick at most ${NEW_PER_AREA}.\n\n` + live.map((x, i) => `### Candidate ${i}: ${x.e.name} (${x.e.ncts.size} industry trial${x.e.ncts.size === 1 ? '' : 's'} since ${since}, highest Phase ${x.e.phase}; sponsors ${Array.from(x.e.sponsors).slice(0, 4).join(', ')}${x.e.tracked ? '; a sponsor already tracked in this area' : ''})\nEvidence:\n<<<\n${cut(x.ev.text, 5000)}\n>>>`).join('\n\n') + `\n\nReturn JSON: {"drugs": [{"i": 0, "include": true, "name": "<INN, or the code when there is none>", "generic": "<INN lower case, or the code>", "codes": ["<development codes seen in the evidence>"], "company": "<developer>", "company_quote": "...", "moa": "<short mechanism, or Not stated>", "moa_quote": "...", "grp": "<one of the mechanism groups>", "route": "<${CAT.ROUTES.join('|')}>", "route_quote": "...", "indications": ["<ids>"], "why": "<one short sentence>"}]}`;
  let r;
  try { r = await ask({ system: DISCOVER_SYSTEM, prompt, schema, maxOutputTokens: 4096 }); }
  catch (e) { log(`discover  ${t.id} failed: ${e.message}`); return; }
  ledger.discover[t.id] = TODAY;
  let added = 0;
  for (const x of itemsOf(r.data, 'drugs')) {
    const it = live[x.i]; if (!it || !x.include || added >= NEW_PER_AREA) continue;
    const ev = it.ev, fail = (why) => { counts.dropped++; log(`  dropped   candidate ${it.e.name}: ${why}`); };
    const generic = norm(x.generic || x.name), id = generic.replace(/ /g, '');
    if (!id || !termRe([x.generic || x.name]).test(ev.text)) { fail('its name is not in the evidence'); continue; }
    // The indications must be in trial conditions of this drug; the company must lead one of its trials.
    const own = ev.trials.filter((tr) => tr.names);
    const inds = (x.indications || []).filter((k) => own.some((tr) => tr.conds.some((c) => indMatch(indOf(t.id, k), c))));
    const coRe = sig(x.company).length ? new RegExp(sig(x.company).map(escRe).join('|'), 'i') : null;
    if (!inds.length) { fail('no trial of it in the indications named'); continue; }
    let entry;
    if (it.other) {
      // Already in another area: the same entry (same id, so a user's choices follow it) with this area's indications.
      const raw = CAT.TAS.flatMap((tt) => tt.assets).find((a) => a.id === it.other.id);
      entry = {}; Object.keys(raw).forEach((k) => { if (!['updates', 'added', 'only', 'inds'].includes(k)) entry[k] = raw[k]; });
      entry.inds = inds;
    } else {
      if (!coRe || !own.some((tr) => coRe.test(tr.sponsor)) || !quoteIn(x.company_quote, ev.norm)) { fail('company not shown as a trial sponsor, or its quote is not in the evidence'); continue; }
      if (!quoteIn(x.route_quote, ev.norm) || !ROUTE_WORDS[x.route] || !ROUTE_WORDS[x.route].test(x.route_quote)) { fail('route not supported by its quote'); continue; }
      const moaOk = x.moa && !/not stated/i.test(x.moa) && quoteIn(x.moa_quote, ev.norm) && sig(x.moa).some((w) => norm(x.moa_quote).includes(w));
      const codes = uniq((x.codes || []).map((c) => clip(c, 20)).filter((c) => /\d/.test(c) && termRe([c]).test(ev.text) && norm(c) !== generic));
      const brandL = ev.labels.find((l) => l.generic === generic && l.routes.some((rr) => ROUTE_OF[rr] === x.route));
      entry = { id, name: clip(x.name, 60), company: clip(x.company, 60), moa: moaOk ? clip(x.moa, 60) : 'Not stated', grp: moaOk && grps.includes(x.grp) ? x.grp : 'Other', route: x.route, codes, inds };
      if (brandL) entry.brand = brandL.brand;
      if (norm(entry.name) !== generic) entry.generic = generic;
    }
    const tr0 = own.find((tr) => tr.conds.some((c) => indMatch(indOf(t.id, inds[0]), c)));
    const p = { op: 'add_asset', ta: t.id, entry, why: clip(x.why, 240), quote: trialLine(tr0), sources: [{ label: 'ClinicalTrials.gov', url: 'https://clinicaltrials.gov/search?intr=' + encodeURIComponent(x.generic || x.name) }], ev: { kind: 'cand', ta: t.id, generic: it.e.name.toLowerCase(), names: [it.e.name] } };
    if (propose(p, r.model)) { added++; counts.discovered++; }
  }
}

/* ---------- 4. New indications: conditions an area's companies study that no indication covers ---------- */
const IND_SYSTEM = 'You maintain the indication list of a therapeutic area for a medical affairs team. Given a condition that several of the area\'s drugs are in Phase 2 or 3 trials for, decide whether it is a distinct disease that belongs to this area and is not covered by an existing indication, and if so write its catalog entry. Patterns are JavaScript regular expressions, case-insensitive: re matches how trial registries write the condition; label matches how an FDA label indication would name it. epmc is a Europe PMC query of quoted synonyms joined by OR, in parentheses. Return JSON only.';
async function runInds() {
  for (const t of AREAS) {
    if (!canAsk()) return;
    const cc = ledger.cond[t.id] || {};
    const cand = Object.values(cc).filter((e) => e.ncts.length >= 3 && e.assets.length >= 2 && !e.done && !anyIndMatch(e.c)).sort((a, b) => b.ncts.length - a.ncts.length)[0];
    if (!cand) continue;

    let ev; try { ev = await evidence({ kind: 'ncts', ids: cand.ncts.slice(-6) }); } catch (e) { httpErrors++; lastHttpErr = e.message; continue; }
    const schema = S('OBJECT', { properties: { include: S('BOOLEAN'), id: S('STRING'), name: S('STRING'), short: S('STRING'), abbr: S('ARRAY', { items: S('STRING') }), syn: S('ARRAY', { items: S('STRING') }), epmc: S('STRING'), ct: S('STRING'), re: S('STRING'), label: S('STRING'), quote: S('STRING'), why: S('STRING') }, required: ['include', 'id', 'name', 'short', 'abbr', 'syn', 'epmc', 'ct', 're', 'label', 'quote', 'why'] });
    const prompt = `Therapeutic area: ${t.name} (${t.desc}).\nExisting indications: ${t.inds.map((i) => `${i.id} = ${i.name} (re /${i.re.source}/)`).join('; ')}.\nOther areas of the catalog (include is false when the condition belongs to one of them rather than here, or is a variant of an existing indication): ${CAT.TAS.filter((x) => x !== t).map((x) => x.name).join(', ')}.\nCondition: "${cand.c}", in ${cand.ncts.length} trials of ${cand.assets.join(', ')}.\n\nEvidence:\n<<<\n${cut(ev.text, 6000)}\n>>>\n\nReturn JSON: {"include": true, "id": "<2 to 6 capital letters>", "name": "<Sentence case name>", "short": "<lower case name>", "abbr": ["<lower case abbreviations>"], "syn": ["<lower case synonyms>"], "epmc": "(\\"...\\" OR \\"...\\")", "ct": "<condition as searched on ClinicalTrials.gov>", "re": "<pattern>", "label": "<pattern>", "quote": "<a trial line from the evidence naming the condition, copied exactly>", "why": "<one short sentence>"}`;
    let r;
    try { r = await ask({ system: IND_SYSTEM, prompt, schema, maxOutputTokens: 2048 }); cand.done = TODAY; } catch (e) { log(`inds      ${t.id} failed: ${e.message}`); continue; }
    const x = r.data || {};
    if (!x.include) { log(`inds      ${t.id}: "${cand.c}" not a new indication (${clip(x.why, 100)})`); continue; }
    let re, label; try { re = new RegExp(x.re, 'i'); label = new RegExp(x.label, 'i'); } catch { counts.dropped++; log(`  dropped   indication ${x.name}: pattern does not compile`); continue; }
    let id = String(x.id || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    if (!id) { counts.dropped++; continue; }
    for (let n = 2; t.inds.some((i) => i.id === id); n++) id = id.slice(0, 5) + n;
    const others = t.inds.map((i) => i.name);
    const bad = !re.test(cand.c) ? 're does not match the condition' : !re.test(x.name) ? 're does not match its own name' : others.some((o) => re.test(o)) ? 're also matches an existing indication' : !label.test(x.name) ? 'label does not match its own name' : (String(x.epmc).match(/\(/g) || []).length !== (String(x.epmc).match(/\)/g) || []).length || (String(x.epmc).match(/"/g) || []).length % 2 ? 'epmc query unbalanced' : !x.ct ? 'no ClinicalTrials.gov term' : null;
    if (bad) { counts.dropped++; log(`  dropped   indication ${x.name}: ${bad}`); continue; }
    const entry = { id, name: clip(x.name, 60), short: clip(x.short || x.name.toLowerCase(), 60), abbr: (x.abbr || []).slice(0, 4).map((s) => clip(s, 12).toLowerCase()), syn: (x.syn || []).slice(0, 5).map((s) => clip(s, 60).toLowerCase()), epmc: clip(x.epmc, 240), ct: clip(x.ct, 80), re: re.source, label: label.source };
    propose({ op: 'add_ind', ta: t.id, entry, conds: [cand.c], why: clip(x.why, 240), quote: clip(x.quote, 400), sources: cand.ncts.slice(-3).map((n) => ({ label: n, url: 'https://clinicaltrials.gov/study/' + n })), ev: { kind: 'ncts', ids: cand.ncts.slice(-6) } }, r.model);
  }
}

/* =========================================================
   Run
   ========================================================= */
let stopReason = null;
llm = await createGemini({ log: (m) => log('llm       ' + m) });
if (!llm.available) { stopReason = 'No AI model: ' + llm.reason; log(`llm       not used: ${llm.reason}. Nothing is reviewed without it.`); }
else {
  if (part('review')) await runReviews();
  if (part('audit') && canAsk()) await runAudit();
  if (part('discover') && canAsk() && pending.length < MAX_PENDING) await runDiscover();
  if (part('inds') && canAsk() && pending.length < MAX_PENDING) await runInds();
  llm.save();
  stopReason = llmStop ? llmStop.message : outOfTime() ? `Time limit (${MAX_MIN} minutes) reached` : llmCalls >= MAX_CALLS ? `Call limit (${MAX_CALLS}) reached` : null;
}

// Trim: condition counters of areas outside the catalog, old history.
Object.keys(ledger.cond).forEach((k) => { if (!taOf(k)) delete ledger.cond[k]; else Object.keys(ledger.cond[k]).forEach((c) => { const e = ledger.cond[k][c]; if (e.done && e.done < daysAgo(365)) delete ledger.cond[k][c]; }); });
const totalAssets = CAT.TAS.reduce((n, t) => n + t.assets.length, 0);
const review = {
  generated_utc: now.toISOString(),
  interval_h: INTERVAL_H,
  run: { ok: !!llm.available && !(llmStop && llmStop.code === 'auth'), stopped: stopReason, error: llm.available ? (llmStop && llmStop.code === 'auth' ? llmStop.message : httpErrors ? `${httpErrors} source call(s) failed: ${lastHttpErr}` : null) : llm.reason, llm_calls: llmCalls, max_calls: MAX_CALLS, source_calls: httpCalls, seconds: Math.round((Date.now() - t0) / 1000), counts },
  llm: Object.assign({ provider: 'Gemini API', available: llm.available }, llm.summary()),
  stats: { assets: totalAssets, audited: Object.keys(ledger.assets).length, recheck_days: RECHECK_DAYS, pending: pending.length, applied: changes.length, rejected: rejected.length, flagged: flagged.length },
  proposals: pending,
  flagged: flagged.slice(0, 100),
  rejected: rejected.slice(0, 30).map((r) => ({ key: r.key, ta: r.ta, text: r.text, at: r.at, why: r.why })),
  history: history.slice(0, 200),
  notes: [
    'Evidence: current US labels (openFDA, NDA and BLA), industry trials of any phase (ClinicalTrials.gov) and, for assets without a label, Europe PMC abstracts.',
    'Discovery: industry trials of any phase in the area\'s indications; a new drug needs a trial title naming it and two trials, or one trial of a company the area already tracks.',
    'A change is applied after three independent reviews (verify, challenge, blind), each in a separate run, each quoting the evidence; at least two different models; one reject ends it.',
    'Nothing is deleted. A link that looks wrong is listed for a person, not removed.'
  ]
};
if (DRY) { log(`Dry run: ${counts.proposed} proposed, ${counts.reviews} reviews, ${counts.applied} applied, ${counts.rejected} rejected, ${counts.flagged} flagged, ${pending.length} pending · ${llmCalls} LLM calls · nothing written`); process.exit(0); }
fs.mkdirSync(path.dirname(OUT_REV), { recursive: true });
const hdr = (what) => `/* ${what}, generated by jobs/review-catalog.mjs on ${review.generated_utc}.\n   Do not edit by hand: correct js/catalog.js instead (a hand edit there wins over a change here). */\n`;
const wrap = (name, obj) => `(function (root) { var U = ${JSON.stringify(obj)}; if (typeof module === 'object' && module.exports) module.exports = U; else root.${name} = U; })(this);\n`;
if (counts.applied || !fs.existsSync(OUT_UPD)) {
  fs.writeFileSync(OUT_UPD + '.tmp', hdr('catalog changes that passed three independent reviews; js/catalog.js applies them') + wrap('MIP_CATALOG_UPDATES', { generated_utc: review.generated_utc, changes }));
  fs.renameSync(OUT_UPD + '.tmp', OUT_UPD);
}
fs.writeFileSync(OUT_LEDGER + '.tmp', JSON.stringify({ generated_utc: review.generated_utc, assets: ledger.assets, discover: ledger.discover, rejected, cond: ledger.cond }));
fs.renameSync(OUT_LEDGER + '.tmp', OUT_LEDGER);
fs.writeFileSync(OUT_REV + '.tmp', hdr('catalog review: proposals under review, flagged links, recent decisions') + wrap('MIP_CATALOG_REVIEW', review));
fs.renameSync(OUT_REV + '.tmp', OUT_REV);
log(`Wrote data/catalog-review.js${counts.applied ? ' and data/catalog-updates.js' : ''} · ${counts.proposed} proposed, ${counts.reviews} reviews, ${counts.applied} applied, ${counts.rejected} rejected, ${counts.flagged} flagged, ${pending.length} pending · ${llmCalls} LLM calls, ${httpCalls} source calls · ${review.run.seconds}s${stopReason ? ' · stopped: ' + stopReason : ''}`);
