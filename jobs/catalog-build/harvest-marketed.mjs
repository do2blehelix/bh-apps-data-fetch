#!/usr/bin/env node
// Catalog build tool (maintainer script, not run by the scheduled jobs).
// Lists the US-marketed prescription products (NDA and BLA) whose current label names an indication of a catalog
// therapeutic area, from the slim openFDA files that slim-openfda.mjs writes. One row per molecule, with its brands,
// sponsor, routes, first approval and the catalog indications its labels name.
//   node jobs/catalog-build/harvest-marketed.mjs <slim dir> <TA id | all> <out dir> [--extra=<json file of {id,name,re}>]
//   node jobs/catalog-build/harvest-marketed.mjs <slim dir> find '<regex>'     products whose indications text matches a regex
// Labels with an empty openfda block (about a quarter of the current ones) are resolved to an application through the
// Drugs@FDA brand name at the start of their first product element, so a new label is not lost for want of harmonisation.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const CAT = require('../../js/catalog.js');
const [, , SLIM, TAARG, OUTARG, ...rest] = process.argv;
if (!SLIM || !TAARG) { console.error('usage: harvest-marketed.mjs <slim dir> <TA|all|find> <out dir | regex>'); process.exit(1); }

const up = (s) => String(s || '').toUpperCase();
const daf = JSON.parse(fs.readFileSync(path.join(SLIM, 'daf.json'), 'utf8'));
const appInfo = new Map(daf.map((a) => [a.app, a]));
const brandApps = new Map(); // BRAND -> Set(app)
for (const a of daf) for (const p of a.products) { const k = up(p.brand); if (!k) continue; if (!brandApps.has(k)) brandApps.set(k, new Set()); brandApps.get(k).add(a.app); }

const labels = [];
{
  const rl = readline.createInterface({ input: fs.createReadStream(path.join(SLIM, 'labels.jsonl'), 'utf8'), crlfDelay: Infinity });
  for await (const line of rl) { if (line) labels.push(JSON.parse(line)); }
}
/* Resolve every label to { brand, apps }. */
const resolved = [];
for (const l of labels) {
  let brand = (l.brand || [])[0] || '', apps = (l.app || []).filter((x) => /^(NDA|BLA)/.test(x));
  if (!apps.length && l.empty && l.rx) {
    const toks = l.first.split(/\s+/);
    for (let n = Math.min(3, toks.length); n >= 1; n--) { const k = up(toks.slice(0, n).join(' ')); if (brandApps.has(k)) { brand = toks.slice(0, n).join(' '); apps = Array.from(brandApps.get(k)); break; } }
    if (!apps.length) continue;
  }
  if (!apps.length) continue;
  if (l.pt && !/HUMAN PRESCRIPTION/i.test(l.pt)) continue;
  resolved.push(Object.assign({}, l, { brandR: brand, appsR: apps }));
}
console.error('labels', labels.length, 'resolved to NDA/BLA', resolved.length);

if (TAARG === 'find') {
  // usage: find '<regex>' [--new]   one row per brand: brand, applications, sponsor, routes, labels, marketing status, first approval, molecule, already in the catalog
  const re = new RegExp(OUTARG, 'i'), onlyNew = rest.includes('--new'), seen = new Map();
  const catBrands = new Set(); CAT.TAS.forEach((t) => t.assets.forEach((a) => [a.brand].concat(a.brands || []).filter(Boolean).forEach((b) => catBrands.add(up(b)))));
  for (const l of resolved) if (re.test(l.ind)) {
    const k = up(l.brandR); const e = seen.get(k) || { brand: l.brandR, apps: new Set(), sponsor: '', n: 0, route: new Set(), st: new Set(), first: '', gen: (l.gen || [])[0] || '' };
    l.appsR.forEach((a) => { e.apps.add(a); const ai = appInfo.get(a); if (ai) { e.sponsor = ai.sponsor; if (!e.first || (ai.first && ai.first < e.first)) e.first = ai.first; ai.products.filter((p) => up(p.brand) === k).forEach((p) => { e.st.add(p.status); if (p.route) e.route.add(p.route); }); } });
    e.n++; (l.route || []).forEach((r) => e.route.add(r)); seen.set(k, e);
  }
  console.log(['brand', 'applications', 'sponsor', 'routes', 'labels', 'marketing_status', 'first_approval', 'generic', 'in_catalog'].join('	'));
  for (const [k, e] of seen) { if (onlyNew && catBrands.has(k)) continue; console.log([e.brand, Array.from(e.apps).join('/'), e.sponsor, Array.from(e.route).join('/'), e.n, Array.from(e.st).join('/'), e.first, e.gen, catBrands.has(k) ? 'yes' : ''].join('	')); }
  process.exit(0);
}

const SALT = /\s+(hydrochloride|dihydrochloride|hydrobromide|sodium|potassium|calcium|magnesium|phosphate|sulfate|sulphate|acetate|succinate|tosylate|mesylate|maleate|fumarate|tartrate|citrate|besylate|dipropionate|propionate|valerate|butyrate|furoate|benzoate|cypionate|hexacetonide|diacetate|monohydrate|anhydrous|disodium|bromide|chloride|nitrate|lactate|malate|oxalate|pamoate|hemihydrate|dimesylate|medoxomil|axetil|pivoxil|disoproxil|alafenamide|etexilate|cilexetil|olamine|tromethamine|decanoate|enanthate|palmitate|undecanoate)\b/g;
const baseIng = (name, bla) => { let s = String(name).toLowerCase().replace(/\s+(eq|equiv)\b.*$/i, '').replace(/\s+\d[\d.,/ ]*\s*(mg|mcg|g|ml|unit|units|iu|%|meq|mmol|mci|ug|\[.*)?.*$/i, '').replace(/\s*\(.*?\)\s*/g, ' ').trim(); if (bla) s = s.replace(/-[a-z]{4}$/, ''); return s.replace(SALT, '').replace(/\s+/g, ' ').trim(); };
const ROUTE = [[/INTRATHECAL/, 'Intrathecal'], [/INTRAVITREAL/, 'Intravitreal'], [/OPHTHALMIC|CONJUNCTIVAL|INTRACAMERAL/, 'Ophthalmic'], [/RESPIRATORY|INHAL/, 'Inhaled'], [/NASAL/, 'Intranasal'], [/VAGINAL/, 'Vaginal'], [/TRANSDERMAL/, 'Transdermal'], [/\bTOPICAL\b|^CUTANEOUS$/, 'Topical'], [/ORAL|SUBLINGUAL|BUCCAL/, 'Oral']];
function routeOf(routes) {
  const r = routes.map(up); if (!r.length) return 'Other';
  for (const [re, name] of ROUTE) if (r.some((x) => re.test(x))) return name;
  if (r.every((x) => /INTRAVENOUS/.test(x))) return 'Intravenous';
  if (r.some((x) => /SUBCUTANEOUS|INTRAMUSCULAR|INTRADERMAL|INTRAVENOUS|INTRA-ARTICULAR|PERCUTANEOUS|EPIDURAL/.test(x))) return 'Injectable';
  return 'Other';
}
const existing = [];
CAT.TAS.forEach((t) => t.assets.forEach((a) => existing.push({ ta: t.id, id: a.id, brand: up(a.brand), brands: (a.brands || []).map(up), generic: String(a.generic || a.name).toLowerCase(), name: a.name })));

const companyGuess = (s) => String(s).toLowerCase().replace(/\b(inc|corp|corporation|llc|ltd|limited|lp|co|company|gmbh|ag|sa|bv|plc|usa|us|pharma|pharms|pharmaceuticals?|labs?|laboratories|biotherapeutics|biopharma|biotech|biosciences?|holdings?|international|intl|global|america|north|technologies)\b\.?/g, ' ').replace(/[,.]/g, ' ').replace(/\s+/g, ' ').trim().replace(/\b[a-z]/g, (c) => c.toUpperCase());
function harvest(t, extraInds) {
  const inds = t.inds.map((i) => ({ id: i.id, re: i.label, name: i.name })).concat(extraInds || []);
  const mols = new Map();
  for (const l of resolved) {
    const hit = inds.filter((i) => i.re && i.re.test(l.ind)).map((i) => i.id);
    if (!hit.length) continue;
    const primary = inds.filter((i) => i.re && i.re.test(l.ind.slice(0, 900))).map((i) => i.id);
    // Molecule key from the active ingredients of the label's applications.
    const ais = new Set();
    for (const a of l.appsR) { const ai = appInfo.get(a); if (ai) for (const p of ai.products) for (const x of p.ai) ais.add(baseIng(x, /^BLA/.test(a))); }
    if (!ais.size) (l.gen || []).forEach((g) => ais.add(String(g).toLowerCase()));
    // One row per molecule and route class: the cream and the tablet of a molecule, or its injection, are different products.
    const lroutes = new Set(l.route || []);
    for (const a of l.appsR) { const ai = appInfo.get(a); if (ai) ai.products.filter((p) => up(p.brand) === up(l.brandR)).forEach((p) => { if (p.route) String(p.route).split(/[;,]/).forEach((r) => lroutes.add(r.trim())); }); }
    const rc = routeOf(Array.from(lroutes)), key0 = Array.from(ais).sort().join(' + '), key = key0 + ' | ' + rc;
    const m = mols.get(key) || { key: key0, rc, brands: new Map(), apps: new Set(), sponsors: new Set(), routes: new Set(), forms: new Set(), first: '', epc: new Set(), moa: new Set(), inds: new Set(), primary: new Set(), nLabels: 0, lastEff: '', indLenMin: 1e9, sample: '', marketed: false, bla: false };
    const bk = up(l.brandR); const b = m.brands.get(bk) || { name: l.brandR, apps: new Set(), n: 0 };
    l.appsR.forEach((a) => { b.apps.add(a); m.apps.add(a); const ai = appInfo.get(a); if (ai) { m.sponsors.add(ai.sponsor); if (!m.first || (ai.first && ai.first < m.first)) m.first = ai.first; if (ai.products.some((p) => /Prescription/i.test(p.status))) m.marketed = true; ai.products.forEach((p) => { if (p.form) m.forms.add(p.form); }); if (/^BLA/.test(a)) m.bla = true; } });
    b.n++; m.brands.set(bk, b);
    lroutes.forEach((r) => m.routes.add(r)); if (!m.gen && (l.gen || [])[0]) m.gen = String(l.gen[0]).toLowerCase();
    (l.epc || []).forEach((x) => m.epc.add(x)); (l.moa || []).forEach((x) => m.moa.add(x));
    hit.forEach((x) => m.inds.add(x)); primary.forEach((x) => m.primary.add(x));
    m.nLabels++; if (l.eff > m.lastEff) m.lastEff = l.eff; if (l.indLen < m.indLenMin) { m.indLenMin = l.indLen; m.sample = l.ind.slice(0, 420); }
    mols.set(key, m);
  }
  const rows = [];
  for (const m of mols.values()) {
    const firstOf = (b) => Array.from(b.apps).map((a) => (appInfo.get(a) || {}).first || '9').sort()[0];
    const brands = Array.from(m.brands.values()).sort((a, b) => (firstOf(a) < firstOf(b) ? -1 : firstOf(a) > firstOf(b) ? 1 : b.n - a.n));
    const ex = existing.filter((e) => brands.some((b) => up(b.name) === e.brand || e.brands.includes(up(b.name))) || e.generic === m.key);
    const route = m.rc;
    const steroid = Array.from(m.epc).some((x) => /corticosteroid/i.test(x)) && route !== 'Topical' && m.indLenMin > 1500;
    rows.push({
      key: m.key, autoExclude: steroid ? 'multi-indication systemic corticosteroid' : (m.marketed ? '' : 'no product in Prescription status'),
      companyGuess: companyGuess(Array.from(m.sponsors)[0] || ""), openfdaGeneric: m.gen || "", brands: brands.map((b) => b.name), apps: Array.from(m.apps), sponsor: Array.from(m.sponsors)[0] || '', sponsors: Array.from(m.sponsors), firstApproval: m.first ? m.first.slice(0, 4) + '-' + m.first.slice(4, 6) + '-' + m.first.slice(6) : '',
      marketed: m.marketed, bla: m.bla, route, routes: Array.from(m.routes), forms: Array.from(m.forms).slice(0, 4), epc: Array.from(m.epc).slice(0, 3), moa: Array.from(m.moa).slice(0, 3),
      inds: Array.from(m.inds), primaryInds: Array.from(m.primary), labels: m.nLabels, lastLabel: m.lastEff, shortestIndText: m.indLenMin, sample: m.sample,
      inCatalog: ex.map((e) => e.ta + ':' + e.id)
    });
  }
  rows.sort((a, b) => (b.primaryInds.length - a.primaryInds.length) || a.key.localeCompare(b.key));
  return rows;
}

const outDir = OUTARG || '.'; fs.mkdirSync(outDir, { recursive: true });
const extraArg = rest.find((x) => x.startsWith('--extra='));
const extra = extraArg ? JSON.parse(fs.readFileSync(extraArg.slice(8), 'utf8')).map((x) => ({ id: x.id, name: x.name, re: new RegExp(x.re, 'i') })) : [];
for (const t of CAT.TAS) {
  if (TAARG !== 'all' && t.id !== TAARG) continue;
  const rows = harvest(t, extra.filter((x) => !x.ta || x.ta === t.id));
  fs.writeFileSync(path.join(outDir, t.id + '.marketed.json'), JSON.stringify(rows, null, 1));
  console.error(t.id, 'molecules', rows.length, 'marketed', rows.filter((r) => r.marketed).length, 'new', rows.filter((r) => r.marketed && !r.inCatalog.length).length);
}
