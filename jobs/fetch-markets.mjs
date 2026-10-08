#!/usr/bin/env node
// Markets job: which countries each catalog product is authorised or marketed in, from the national public sources
// that can be read without a login, for every asset in js/catalog.js (all therapeutic areas).
//   node jobs/fetch-markets.mjs              refresh the assets last checked more than MARKETS_REFRESH_DAYS ago (default 14)
//   node jobs/fetch-markets.mjs --force      check every asset again
//   node jobs/fetch-markets.mjs --only=ca,fr,es,gb,au,jp,eu     run some sources
//   node jobs/fetch-markets.mjs --limit=200  at most 200 assets per API source in this run (CA and ES call an API per asset)
// Writes data/markets.js (window.MIP_MARKETS), which the apps load like data/regulatory.js.
//
// Status per asset and country: M = marketed (the source says so), A = authorised or listed (marketing not stated),
// N = searched and not found, ? = not assessed (no open source, or the source cannot tell). Products are matched by
// active substance (INN, salts ignored) and, when the catalog has them, by brand name.
//   US   not here: the apps read the US label from openFDA when they draw (a US brand in the catalog is a US product).
//   CA   Health Canada Drug Product Database API: product by brand or active ingredient, status of the newest products
//        (Marketed, Approved, Cancelled ...).
//   FR   ANSM / Base de donnees publique des medicaments, CIS_bdpm.txt and CIS_COMPO_bdpm.txt (open files): authorised
//        products and whether they are "Commercialisee".
//   ES   AEMPS CIMA REST API: authorised products by active substance, with the commercialised flag.
//   GB   NHS Business Services Authority BNF code information (open data): a substance or brand with a BNF code is
//        listed in the UK drug dictionary (A). The list follows primary-care dispensing, so a hospital-only product (many
//        biologics) is missing from it: a product not found is ?, never N.
//   AU   PBS Schedule (data-api.health.gov.au, public key): a drug or brand listed on the Pharmaceutical Benefits Scheme is
//        M. A product not on the PBS may still be on the ARTG (not read: no open list), so it is ?.
//   JP   PMDA review reports of new drugs (English list of brand, non-proprietary name and approval month): A. A product not
//        on that list may still be approved (older drugs, generics), so it is ?.
//   EU, DE, IT   the EMA data of data/regulatory.js (centrally authorised medicines, written by fetch-regulatory.mjs): A
//        for every EU country when an authorised medicine has the substance. National lists of DE and IT have no open source.
//   CN, EG   no open source: ?.
// A product whose catalog entry is route-specific (labelRoute or sibling: topical roflumilast next to the oral tablet) is
// matched by brand name only, and in the EMA data by the medicine's own brand or indications, so another route of the
// molecule is not taken for it.
// A source that fails keeps its previous values and is marked in sources.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const CAT = require('../js/catalog.js');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '..', 'data', 'markets.js');
const REG = path.join(HERE, '..', 'data', 'regulatory.js');
const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const ONLY = (args.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const LIMIT = Number((args.find((a) => a.startsWith('--limit=')) || '').slice(8)) || 100000;
const REFRESH_DAYS = Number(process.env.MARKETS_REFRESH_DAYS) || 14;
const part = (p) => !ONLY.length || ONLY.includes(p);
const now = new Date(), TODAY = now.toISOString().slice(0, 10);
const log = (...a) => console.log(...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const UA = 'bh-apps-data-fetch/1.0' + (process.env.CONTACT_EMAIL ? ` (${process.env.CONTACT_EMAIL})` : '');

async function http(url, opts = {}, tries = 3) {
  for (let k = 0; k < tries; k++) {
    try {
      const r = await fetch(url, { headers: Object.assign({ 'User-Agent': UA, Accept: 'application/json,text/plain,*/*' }, opts.headers || {}), signal: AbortSignal.timeout(opts.timeout || 60000) });
      if (r.status === 404) return { status: 404, body: opts.json ? [] : '' };
      if (r.status === 429 || r.status >= 500) { await sleep(2000 * (k + 1)); continue; }
      if (!r.ok) throw Object.assign(new Error('HTTP ' + r.status), { status: r.status });
      return { status: r.status, body: opts.json ? await r.json() : opts.buffer ? Buffer.from(await r.arrayBuffer()) : await r.text() };
    } catch (e) { if (k === tries - 1) throw e; await sleep(1500 * (k + 1)); }
  }
}
/* A paced caller: at most perSec calls a second. */
const pace = (perSec) => { let next = 0; return async () => { const t = Date.now(); next = Math.max(next, t) + 1000 / perSec; const w = next - 1000 / perSec - t; if (w > 0) await sleep(w); }; };

/* ---------- Names ---------- */
const SALT = /\s+(hydrochloride|dihydrochloride|hydrobromide|sodium|potassium|calcium|magnesium|phosphate|sulfate|sulphate|acetate|succinate|tosylate|mesylate|maleate|fumarate|tartrate|citrate|besylate|dipropionate|propionate|valerate|butyrate|furoate|benzoate|cypionate|monohydrate|anhydrous|disodium|bromide|chloride|nitrate|lactate|malate|oxalate|pamoate|hemihydrate|dimesylate|medoxomil|axetil|pivoxil|disoproxil|alafenamide|etexilate|cilexetil|olamine|tromethamine|decanoate|enanthate|palmitate|undecanoate|hydrate|dihydrate|trihydrate)\b/g;
const fold = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\([^)]*\)/g, ' ').replace(/[^a-z0-9 ]+/g, ' ').replace(SALT, '').replace(/\s+/g, ' ').trim();
const bfold = (s) => fold(s).replace(/ /g, '');
/* The substances of an asset: a combination "A / B" or "A and B" is a list; a biologic suffix is dropped. */
const innsOf = (a) => fold(a.generic || a.name).split(/\s*\/\s*|\s+and\s+|\s*\+\s*/).map((x) => x.trim().replace(/-[a-z]{4}$/, '')).filter(Boolean);
const brandsOf = (a) => [a.brand].concat(a.brands || []).filter(Boolean);

/* ---------- The assets: one record per distinct id (an asset in several areas is one product) ---------- */
const ASSETS = new Map();
CAT.TAS.forEach((t) => t.assets.forEach((a0) => { if (!ASSETS.has(a0.id)) { const a = CAT.asset(a0); ASSETS.set(a.id, { id: a.id, name: a.name, inns: a.labelRoute || a.sibling ? [] : innsOf(a), own: !!(a.labelRoute || a.sibling), brands: brandsOf(a), route: a.route, brand: a.brand || '' }); } }));
log(`${ASSETS.size} distinct assets`);

function readPrev() { try { const ctx = { window: {} }; vm.runInNewContext(fs.readFileSync(OUT, 'utf8'), ctx); const m = ctx.window.MIP_MARKETS || ctx.MIP_MARKETS; if (m) return m; } catch { /* first run */ } return {}; }
const prev = readPrev();
const out = { generated_utc: now.toISOString(), sources: Object.assign({}, prev.sources), assets: {} };
for (const id of ASSETS.keys()) out.assets[id] = Object.assign({}, (prev.assets || {})[id]);
const set = (id, cc, status, names, extra) => { const rec = out.assets[id] || (out.assets[id] = {}); rec[cc] = [status, names && names.length ? names.slice(0, 3) : 0, extra || 0, TODAY]; };
const stale = (id, cc) => FORCE || !((out.assets[id] || {})[cc]) || (Date.now() - Date.parse(out.assets[id][cc][3])) / 864e5 > REFRESH_DAYS;
const src = (k, o) => { out.sources[k] = Object.assign({ at: now.toISOString() }, o); };
const fail = (k, e) => { log(`FAILED ${k}: ${e.message}`); src(k, Object.assign({}, prev.sources && prev.sources[k], { ok: false, error: String(e.message).slice(0, 200), at: now.toISOString() })); };

/* ---------- FR: BDPM open files ---------- */
async function runFR() {
  const base = 'https://base-donnees-publique.medicaments.gouv.fr/download/file/';
  const dec = (b) => new TextDecoder('latin1').decode(b);
  const [cis, compo] = await Promise.all([http(base + 'CIS_bdpm.txt', { buffer: true, timeout: 120000 }), http(base + 'CIS_COMPO_bdpm.txt', { buffer: true, timeout: 120000 })]);
  const prod = new Map(); // cis -> { name, marketed, auth }
  for (const l of dec(cis.body).split('\n')) { const f = l.split('\t'); if (f.length < 8) continue; prod.set(f[0], { name: f[1], auth: /autoris/i.test(f[4]) && !/abrog|retir|archiv/i.test(f[4]), marketed: /commercialis/i.test(f[6]) && !/non commercialis/i.test(f[6]), ma: f[7] }); }
  const bySub = new Map(); // folded substance -> Set(cis)
  const subs = new Map(); // cis -> Set(substance)
  for (const l of dec(compo.body).split('\n')) { const f = l.split('\t'); if (f.length < 4 || f[6] !== 'SA') continue; const s = fold(f[3]); if (!s) continue; (bySub.get(s) || bySub.set(s, new Set()).get(s)).add(f[0]); (subs.get(f[0]) || subs.set(f[0], new Set()).get(f[0])).add(s); }
  const byBrand = new Map(); for (const [c, p] of prod) { const b = bfold(p.name.split(/\s+\d|,/)[0]); if (b.length > 3) (byBrand.get(b) || byBrand.set(b, []).get(b)).push(c); }
  let found = 0;
  for (const a of ASSETS.values()) {
    let hits = [];
    if (a.inns.length) { let sets = a.inns.map((s) => bySub.get(s)); if (sets.every(Boolean)) { hits = Array.from(sets[0]).filter((c) => sets.every((st) => st.has(c)) && subs.get(c).size === a.inns.length); } }
    for (const b of a.brands) for (const [k, list] of byBrand) if (k === bfold(b) || k.startsWith(bfold(b) + ' ')) hits = hits.concat(list);
    hits = Array.from(new Set(hits)).filter((c) => prod.get(c).auth);
    if (!hits.length) { set(a.id, 'FR', 'N'); continue; }
    found++;
    const m = hits.filter((c) => prod.get(c).marketed);
    set(a.id, 'FR', m.length ? 'M' : 'A', Array.from(new Set((m.length ? m : hits).map((c) => prod.get(c).name.split(/\s+\d|,/)[0].trim()))));
  }
  src('fr', { ok: true, source: 'ANSM BDPM', products: prod.size, assets: found });
  log(`ok  fr   ${found} assets in ${prod.size} French products`);
}

/* ---------- GB: BNF code information (NHS BSA open data) ---------- */
async function runGB() {
  const list = await http('https://opendata.nhsbsa.net/api/3/action/package_show?id=bnf-code-information-current-year', { json: true });
  const res = list.body.result.resources.filter((r) => /^BNF_CODE_CURRENT/.test(r.name)).sort((a, b) => a.name.localeCompare(b.name)).pop();
  const csv = await http(res.url, { timeout: 180000 });
  const chem = new Map(), brand = new Map(); // folded -> true
  const lines = csv.body.split('\n'); const rows = [];
  for (const l of lines.slice(1)) { // columns 9 chemical substance and 11 product are quoted when they hold commas
    const f = l.match(/("([^"]|"")*"|[^,]*)(,|$)/g); if (!f) continue;
    const c = f.map((x) => x.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"')); if (c.length < 15) continue;
    chem.set(fold(c[9]), true); brand.set(bfold(c[11]), c[11]);
  }
  let found = 0;
  for (const a of ASSETS.values()) {
    const bs = a.brands.map((b) => brand.get(bfold(b))).filter(Boolean);
    const sub = a.inns.length === 1 && chem.has(a.inns[0]);
    if (bs.length || sub) { found++; set(a.id, 'GB', 'A', bs); } else set(a.id, 'GB', '?');
  }
  src('gb', { ok: true, source: 'NHS BSA BNF code information ' + res.name, products: brand.size, assets: found });
  log(`ok  gb   ${found} assets in the BNF (${res.name})`);
}

/* ---------- JP: PMDA English review report list ---------- */
async function runJP() {
  const r = await http('https://www.pmda.go.jp/english/review-services/reviews/approved-information/drugs/0001.html', { timeout: 90000 });
  const rows = Array.from(r.body.matchAll(/<tr[\s\S]*?<\/tr>/g)).map((m) => Array.from(m[0].matchAll(/<t[dh][\s\S]*?<\/t[dh]>/g)).map((c) => c[0].replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim())).filter((c) => c.length >= 3 && /\b(19|20)\d\d\b/.test(c[2]));
  const bySub = new Map(), byBrand = new Map();
  for (const c of rows) { const b = c[0].replace(/\s+(Partial Change Approval|Approval)\b.*$/i, '').trim(); const subs = fold(c[1]).split(/\s+and\s+|\s*\/\s*|\s*,\s*/).map((x) => x.replace(/ genetical recombination$/, '').trim()).filter(Boolean); const rec = { brand: b, date: c[2] }; (byBrand.get(bfold(b)) || byBrand.set(bfold(b), []).get(bfold(b))).push(rec); if (subs.length === 1) (bySub.get(subs[0]) || bySub.set(subs[0], []).get(subs[0])).push(rec); else bySub.set(subs.slice().sort().join('+'), [rec]); }
  let found = 0;
  for (const a of ASSETS.values()) {
    let hits = [];
    if (a.inns.length === 1) hits = bySub.get(a.inns[0]) || []; else if (a.inns.length > 1) hits = bySub.get(a.inns.slice().sort().join('+')) || [];
    for (const b of a.brands) hits = hits.concat(byBrand.get(bfold(b)) || []);
    if (hits.length) { found++; set(a.id, 'JP', 'A', Array.from(new Set(hits.map((h) => h.brand))), hits.map((h) => h.date).sort().pop()); } else set(a.id, 'JP', '?');
  }
  src('jp', { ok: true, source: 'PMDA review reports (new drugs)', rows: rows.length, assets: found });
  log(`ok  jp   ${found} assets among ${rows.length} PMDA review-report rows`);
}

/* ---------- AU: PBS schedule ---------- */
async function runAU() {
  const H = { headers: { Accept: 'application/json', 'Subscription-Key': process.env.PBS_API_KEY || '2384af7c667342ceb5a736fe29f1dc6b' }, json: true, timeout: 120000 };
  const sch = (await http('https://data-api.health.gov.au/pbs/api/v3/schedules', H)).body.data.filter((s) => s.publication_status === 'PUBLISHED').sort((a, b) => (a.effective_date < b.effective_date ? 1 : -1))[0];
  const drugs = new Map(), brands = new Map();
  for (let page = 1; page < 40; page++) {
    await sleep(21000); // the public key allows one call every 20 seconds
    const j = (await http(`https://data-api.health.gov.au/pbs/api/v3/items?schedule_code=${sch.schedule_code}&limit=1000&page=${page}`, H)).body;
    for (const it of j.data || []) { drugs.set(fold(it.drug_name || it.li_drug_name), it.brand_name); if (it.brand_name) brands.set(bfold(it.brand_name), it.brand_name); }
    if (!j.data || j.data.length < 1000) break;
  }
  let found = 0;
  for (const a of ASSETS.values()) {
    const bs = a.brands.map((b) => brands.get(bfold(b))).filter(Boolean);
    const sub = a.inns.length === 1 && Array.from(drugs.keys()).some((d) => d === a.inns[0] || d.split(' and ').includes(a.inns[0]));
    if (bs.length || sub) { found++; set(a.id, 'AU', 'M', bs, sch.effective_date); } else set(a.id, 'AU', '?');
  }
  src('au', { ok: true, source: 'PBS schedule ' + sch.effective_date, drugs: drugs.size, assets: found });
  log(`ok  au   ${found} assets on the PBS schedule of ${sch.effective_date}`);
}

/* ---------- CA: Health Canada DPD API ---------- */
async function runCA() {
  const base = 'https://health-products.canada.ca/api/drug/', tick = pace(5);
  const J = (p) => tick().then(() => http(base + p + (p.includes('?') ? '&' : '?') + 'lang=en&type=json', { json: true }));
  const todo = Array.from(ASSETS.values()).filter((a) => stale(a.id, 'CA')).slice(0, LIMIT);
  let done = 0, found = 0, errs = 0;
  for (const a of todo) {
    try {
      let codes = new Map(); // drug_code -> brand name
      for (const b of a.brands.slice(0, 2)) { const r = (await J('drugproduct/?brandname=' + encodeURIComponent(b))).body; (Array.isArray(r) ? r : []).forEach((x) => { if (bfold(x.brand_name).startsWith(bfold(b))) codes.set(x.drug_code, x.brand_name); }); }
      if (!codes.size && a.inns.length === 1) { const r = (await J('activeingredient/?ingredientname=' + encodeURIComponent(a.inns[0]))).body; (Array.isArray(r) ? r : []).forEach((x) => { if (fold(x.ingredient_name) === a.inns[0]) codes.set(x.drug_code, ''); }); }
      if (!codes.size) { set(a.id, 'CA', 'N'); done++; continue; }
      found++;
      const newest = Array.from(codes.keys()).sort((x, y) => y - x).slice(0, 4); let st = 'A', names = new Set();
      for (const c of newest) { const s = (await J('status/?id=' + c)).body; const one = Array.isArray(s) ? s[0] : s; if (one && /marketed/i.test(one.status)) { st = 'M'; } if (codes.get(c)) names.add(codes.get(c)); }
      set(a.id, 'CA', st, Array.from(names));
      done++;
    } catch (e) { errs++; if (errs > 25) throw e; }
    if (done % 100 === 0) log(`    ca ${done}/${todo.length}`);
  }
  src('ca', { ok: true, source: 'Health Canada DPD', checked: done, assets: found });
  log(`ok  ca   ${done} assets checked, ${found} found in the DPD`);
}

/* ---------- ES: CIMA API ---------- */
async function runES() {
  const tick = pace(4);
  const todo = Array.from(ASSETS.values()).filter((a) => stale(a.id, 'ES')).slice(0, LIMIT);
  let done = 0, found = 0, errs = 0;
  for (const a of todo) {
    try {
      let items = [];
      if (a.inns.length >= 1 && a.inns.length <= 2) {
        await tick(); const q = 'practiv1=' + encodeURIComponent(a.inns[0]) + (a.inns[1] ? '&practiv2=' + encodeURIComponent(a.inns[1]) : '') + '&pagesize=100';
        const r = (await http('https://cima.aemps.es/cima/rest/medicamentos?' + q, { json: true })).body; items = r.resultados || [];
        if (a.inns.length === 1 && items.length) items = items.filter((m) => true);
      }
      for (const b of a.brands.slice(0, 2)) { await tick(); const r = (await http('https://cima.aemps.es/cima/rest/medicamentos?nombre=' + encodeURIComponent(b) + '&pagesize=50', { json: true })).body; items = items.concat((r.resultados || []).filter((m) => bfold(m.nombre).startsWith(bfold(b)))); }
      if (!items.length) { set(a.id, 'ES', 'N'); done++; continue; }
      found++;
      const m = items.filter((x) => x.comerc);
      set(a.id, 'ES', m.length ? 'M' : 'A', Array.from(new Set((m.length ? m : items).filter((x) => !x.generico).map((x) => x.nombre.split(/\s+\d/)[0].trim()))));
      done++;
    } catch (e) { errs++; if (errs > 25) throw e; }
    if (done % 100 === 0) log(`    es ${done}/${todo.length}`);
  }
  src('es', { ok: true, source: 'AEMPS CIMA', checked: done, assets: found });
  log(`ok  es   ${done} assets checked, ${found} authorised in Spain`);
}

/* ---------- EU, DE, IT: the EMA records of regulatory.js ---------- */
function runEU() {
  const ctx = { window: {} }; vm.runInNewContext(fs.readFileSync(REG, 'utf8'), ctx);
  const R = ctx.window.MIP_REGULATORY; if (!R || !R.ema) throw new Error('data/regulatory.js has no ema part');
  let found = 0;
  for (const a of ASSETS.values()) {
    const rec = (R.ema[a.id] || []).filter((e) => e.st === 'Authorised' && (!a.own || e.brand || (e.inds || []).length));
    for (const cc of ['EU', 'DE', 'IT']) { if (rec.length) set(a.id, cc, 'A', Array.from(new Set(rec.map((e) => e.n))).slice(0, 3)); else if (R.ema[a.id]) set(a.id, cc, 'N'); else set(a.id, cc, 'N'); }
    if (rec.length) found++;
  }
  src('eu', { ok: true, source: 'EMA medicines data (regulatory.js ' + R.generated_utc + ')', assets: found });
  log(`ok  eu   ${found} assets centrally authorised`);
}

for (const [k, fn] of [['fr', runFR], ['gb', runGB], ['jp', runJP], ['eu', runEU], ['es', runES], ['ca', runCA], ['au', runAU]]) {
  if (!part(k)) continue;
  try { await fn(); } catch (e) { fail(k, e); }
}
for (const a of ASSETS.values()) { for (const cc of ['CN', 'EG']) set(a.id, cc, '?'); }
out.note = 'M marketed, A authorised or listed, N searched and not found, ? not assessed. Each value: [status, local names, extra (date), checked day].';
fs.writeFileSync(OUT, `/* Markets by country for every catalog asset, generated by jobs/fetch-markets.mjs on ${out.generated_utc}. Do not edit by hand. */\n(function (root) { var U = ${JSON.stringify(out)}; if (typeof module === 'object' && module.exports) module.exports = U; else root.MIP_MARKETS = U; })(this);\n`);
log('written', OUT);
