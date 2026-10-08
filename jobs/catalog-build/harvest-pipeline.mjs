#!/usr/bin/env node
// Catalog build tool (maintainer script, not run by the scheduled jobs).
// Lists the late-stage products of a therapeutic area from ClinicalTrials.gov: the interventions of industry-sponsored
// Phase 3 (and Phase 2/3) interventional trials in the area's indications that are recruiting or not yet recruiting,
// active, or completed since a cut-off. One row per intervention name (doses and formulations folded together), with its
// sponsors, trials, phases and indications. Products already in the catalog, and the marketed products of the harvest,
// are left out; what remains still holds comparators, background therapy and codes of one product under several names,
// which a person (or a reviewer agent) sorts out.
//   node jobs/catalog-build/harvest-pipeline.mjs <TA id | all> <out dir> [--marketed=<harvest dir>] [--names=<names.txt>] [--since=2021-01-01] [--completed-since=2025-01-01]
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const CAT = require('../../js/catalog.js');
const args = process.argv.slice(2).filter((a) => !a.startsWith('--')), opt = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')));
const [TAARG, OUT] = args;
if (!TAARG || !OUT) { console.error('usage: harvest-pipeline.mjs <TA|all> <out dir> [--marketed=dir]'); process.exit(1); }
const SINCE = opt.since || '2021-01-01', COMPLETED_SINCE = opt['completed-since'] || '2025-01-01';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => String(s).toLowerCase().replace(/[®™]/g, '').replace(/\s+/g, ' ').trim();

async function get(url) {
  for (let k = 0; k < 4; k++) {
    const r = await fetch(url, { headers: { Accept: 'application/json' } });
    if (r.status === 429 || r.status >= 500) { await sleep(3000 * (k + 1)); continue; }
    if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + url);
    return r.json();
  }
  throw new Error('gave up ' + url);
}
const ADV = `AREA[StudyType]INTERVENTIONAL AND AREA[LeadSponsorClass]INDUSTRY AND AREA[Phase]PHASE3 AND AREA[StartDate]RANGE[${SINCE},MAX] AND (AREA[OverallStatus]NOT_YET_RECRUITING OR AREA[OverallStatus]RECRUITING OR AREA[OverallStatus]ENROLLING_BY_INVITATION OR AREA[OverallStatus]ACTIVE_NOT_RECRUITING OR (AREA[OverallStatus]COMPLETED AND AREA[PrimaryCompletionDate]RANGE[${COMPLETED_SINCE},MAX]))`;
const FIELDS = 'NCTId,BriefTitle,Acronym,Phase,Condition,LeadSponsorName,InterventionName,InterventionType,OverallStatus,StartDate,PrimaryCompletionDate';
async function trials(cond) {
  const out = []; let token = null;
  for (let page = 0; page < 8; page++) {
    const u = 'https://clinicaltrials.gov/api/v2/studies?' + new URLSearchParams(Object.assign({ 'query.cond': cond, 'filter.advanced': ADV, fields: FIELDS, pageSize: '1000', countTotal: 'true' }, token ? { pageToken: token } : {}));
    const j = await get(u);
    for (const s of j.studies || []) {
      const ps = s.protocolSection || {}, id = ps.identificationModule || {}, st = ps.statusModule || {}, ai = ps.armsInterventionsModule || {};
      out.push({ nct: id.nctId, title: id.briefTitle || '', acr: id.acronym || '', phases: (ps.designModule || {}).phases || [], conds: (ps.conditionsModule || {}).conditions || [], sponsor: ((ps.sponsorCollaboratorsModule || {}).leadSponsor || {}).name || '', status: st.overallStatus, start: (st.startDateStruct || {}).date || '', pcd: (st.primaryCompletionDateStruct || {}).date || '', ints: (ai.interventions || []).map((x) => ({ n: x.name, t: x.type })) });
    }
    token = j.nextPageToken; if (!token) break; await sleep(400);
  }
  return out;
}
const NOISE = /^(placebo|vehicle|saline|standard of care|best supportive care|usual care|observation|control|sham|no treatment|matching placebo|normal saline|dummy|physician'?s choice|investigator'?s choice|treatment of physician|chemotherapy|standard therapy|active comparator|background therapy)\b/i;
const fold = (n) => norm(n).replace(/\b(placebo[- ]matching|matching placebo|placebo)\b/g, '').replace(/\(.*?\)/g, ' ').replace(/\b\d+([.,]\d+)?\s*(mg|mcg|µg|ug|g|ml|iu|units?|%|mg\/kg|mg\/ml|mg\/m2)\b(\s*\/\s*\w+)?/g, ' ').replace(/\b(low|medium|high|loading|maintenance|dose|doses|q\d+w|qw|q\d+d|once|twice|daily|weekly|monthly|every|weeks?|days?|injection|infusion|tablets?|capsules?|cream|ointment|gel|foam|solution|oral|subcutaneous|intravenous|iv|sc|pre-?filled|syringe|autoinjector|pen|formulation|arm|group|cohort|part)\b/g, ' ').replace(/[,;:+/-]+/g, ' ').replace(/\s+/g, ' ').trim();

const known = new Set(), knownText = [];
function addKnown(s) { const k = norm(s); if (k && k.length > 2) { known.add(k); knownText.push(k); } }
CAT.TAS.forEach((t) => t.assets.forEach((a) => { [a.name, a.short, a.generic, a.brand].concat(a.brands || [], a.codes || []).filter(Boolean).forEach((x) => { addKnown(x); addKnown(String(x).replace(/\s*\(.*\)\s*/g, '')); }); }));
if (opt.marketed) for (const f of fs.readdirSync(opt.marketed).filter((x) => x.endsWith('.marketed.json'))) for (const r of JSON.parse(fs.readFileSync(path.join(opt.marketed, f), 'utf8'))) { r.key.split(' + ').forEach(addKnown); (r.brands || []).forEach(addKnown); }
/* Every generic, substance and brand name on a US label (names.txt from slim-openfda.mjs): approved products, generics included. */
if (opt.names) for (const line of fs.readFileSync(opt.names, 'utf8').split('\n')) { const k = norm(line); if (k.length > 3) known.add(k); }
const isKnown = (n) => { const k = fold(n); if (!k) return true; if (known.has(k) || known.has(norm(n))) return true; return k.split(' ').some((w) => w.length > 5 && known.has(w)) && k.split(' ').length <= 2; };

fs.mkdirSync(OUT, { recursive: true });
for (const t of CAT.TAS) {
  if (TAARG !== 'all' && t.id !== TAARG) continue;
  const byNct = new Map();
  for (const i of t.inds) { const rs = await trials(i.ct); rs.forEach((r) => { const e = byNct.get(r.nct) || r; byNct.set(r.nct, e); }); console.error(t.id, i.id, 'trials', rs.length); await sleep(500); }
  const agg = new Map();
  for (const tr of byNct.values()) {
    const inds = t.inds.filter((i) => tr.conds.some((c) => i.re.test(c) && !(i.not && i.not.test(c)))).map((i) => i.id);
    for (const it of tr.ints) {
      if (!/^(DRUG|BIOLOGICAL|GENETIC|COMBINATION_PRODUCT|OTHER|DIETARY_SUPPLEMENT)$/.test(it.t) || NOISE.test(it.n.trim())) continue;
      const k = fold(it.n); if (!k || k.length < 3) continue;
      const e = agg.get(k) || { key: k, names: new Set(), sponsors: new Map(), trials: [], inds: new Set(), types: new Set() };
      e.names.add(it.n); e.types.add(it.t); e.sponsors.set(tr.sponsor, (e.sponsors.get(tr.sponsor) || 0) + 1); e.trials.push(tr); inds.forEach((x) => e.inds.add(x)); agg.set(k, e);
    }
  }
  const rows = [];
  for (const e of agg.values()) {
    if (Array.from(e.names).some(isKnown)) continue;
    const ts = e.trials.filter((x, i, a) => a.findIndex((y) => y.nct === x.nct) === i);
    rows.push({
      key: e.key, names: Array.from(e.names).slice(0, 6), types: Array.from(e.types), sponsors: Array.from(e.sponsors.entries()).sort((a, b) => b[1] - a[1]).slice(0, 4).map((x) => x[0] + ' (' + x[1] + ')'),
      trials: ts.length, statuses: Array.from(new Set(ts.map((x) => x.status))), firstStart: ts.map((x) => x.start).sort()[0] || '', lastPcd: ts.map((x) => x.pcd).sort().pop() || '', inds: Array.from(e.inds),
      sample: ts.slice(0, 3).map((x) => x.nct + ' ' + x.title.slice(0, 110))
    });
  }
  rows.sort((a, b) => b.trials - a.trials);
  fs.writeFileSync(path.join(OUT, t.id + '.pipeline.json'), JSON.stringify(rows, null, 1));
  console.error(t.id, 'trials', byNct.size, 'candidate interventions', rows.length);
}
