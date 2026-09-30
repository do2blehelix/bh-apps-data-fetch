#!/usr/bin/env node
// MIP · regulatory data job: EU status from the European Medicines Agency, and US patents, exclusivity and generics from
// the FDA Orange Book, for every asset in js/catalog.js (all therapeutic areas), so any watchlist finds its assets.
//   node jobs/fetch-regulatory.mjs            reuse answers cached within each source's lifetime (EMA 12 h, Orange Book 7 days)
//   node jobs/fetch-regulatory.mjs --force    fetch again
//   node jobs/fetch-regulatory.mjs --only=ema,ob
// Writes data/regulatory.js (window.MIP_REGULATORY), which the app loads like data/snapshot.js.
//   ema       EMA "Medicines" data file (JSON, updated twice a day): each centrally authorised or evaluated human medicine
//             whose INN is a catalog asset's. Status, CHMP opinion, marketing authorisation, latest European Commission
//             decision, orphan, conditional and PRIME flags, generic and biosimilar flags, and the EPAR link. The EU
//             indication text is matched to the asset's catalog indications, and a medicine with the asset's US brand name
//             is marked, so the same molecule in another use (oral roflumilast in COPD, next to the topical product) stays
//             apart. Withdrawn, lapsed and refused applications are kept for three years.
//   ema_post  EMA "Post-authorisation procedures" data file: opinions on changes to authorised medicines (extensions of
//             indication among them) and withdrawn applications, for the same medicines.
//   ob        FDA Orange Book data files (zip, monthly): for each catalog US brand, its NDAs, the patents listed against them
//             (number, expiry, and whether it claims the drug substance, the product or a method of use), the regulatory
//             exclusivities (code and expiry), and the
//             approved generics (ANDAs) of the same ingredient, dosage form and route. Expired patents and exclusivities are
//             dropped a year after they lapse. Biologics are licensed under the PHS Act and are not in the Orange Book.
// No key or contact needed. A part that fails keeps its previous values and is marked in sources.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { upstream } from './upstream.mjs';

const require = createRequire(import.meta.url);
const CAT = require('../js/catalog.js');
const { match, SOURCES } = require('../js/sources.js');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '..', 'data', 'regulatory.js');
const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const ONLY = (args.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const part = (p) => !ONLY.length || ONLY.includes(p);
const now = new Date(), t0 = Date.now();
const TODAY = now.toISOString().slice(0, 10);
const daysAgo = (n) => new Date(now.getTime() - n * 864e5).toISOString().slice(0, 10);
const log = (...a) => console.log(...a);

const EMA_MEDICINES = 'https://www.ema.europa.eu/en/documents/report/medicines-output-medicines_json-report_en.json';
const EMA_POST = 'https://www.ema.europa.eu/en/documents/report/medicines-output-post_authorisation_json-report_en.json';
const ORANGE_BOOK = 'https://www.fda.gov/media/76860/download';
const EMA_PAGE = 'https://www.ema.europa.eu/en/medicines/human/'; // page links are kept below this prefix
const KEEP_GONE_DAYS = 3 * 365, KEEP_LAPSED_DAYS = 365;

async function get(url, opts = {}) {
  const m = match(url); if (!m) throw new Error('No source registered for ' + url);
  const r = await upstream(m.key, m.path, { maxAgeMs: FORCE ? 0 : SOURCES[m.key].ttlH * 3600000, ...opts });
  if (r.status < 200 || r.status >= 300) throw Object.assign(new Error(`HTTP ${r.status} from ${m.key}`), { status: r.status });
  return r.body;
}
function readPrev() {
  try { const ctx = { window: {} }; vm.runInNewContext(fs.readFileSync(OUT, 'utf8'), ctx); if (ctx.window.MIP_REGULATORY) return ctx.window.MIP_REGULATORY; } catch { /* first run */ }
  return {};
}
const prev = readPrev();

/* ---------- The catalog's assets, once each, with every indication they have in any area ---------- */
const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const ASSETS = {};
CAT.TAS.forEach((t) => t.assets.forEach((a0) => {
  const a = ASSETS[a0.id] || (ASSETS[a0.id] = { id: a0.id, generic: String(a0.generic || a0.name.replace(/\s*\([^)]*\)\s*$/, '')).toLowerCase(), brand: a0.brand || null, route: a0.labelRoute || null, inds: [] });
  (a0.inds || []).forEach((k) => { const i = t.inds.find((x) => x.id === k); if (i && !a.inds.some((x) => x.id === k)) a.inds.push({ id: k, re: i.label || i.re }); });
}));
const LIST = Object.values(ASSETS);
log(`Catalog: ${LIST.length} assets, ${LIST.filter((a) => a.brand).length} with a US brand`);

/* ---------- EMA ---------- */
function emaDate(s) { const m = String(s || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/); return m ? m[3] + '-' + m[2] + '-' + m[1] : null; }
const yes = (v) => /^yes$/i.test(String(v || ''));
/* The INNs an EMA entry names ("abacavir / lamivudine"), normalized. */
function inns(x) { return uniq(String(x.international_non_proprietary_name_common_name || '').split(/\s*(?:\/|,|;|\band\b)\s*/i).concat([x.active_substance || '']).map(norm).filter(Boolean)); }
function uniq(a) { return Array.from(new Set(a)); }
/* An asset's INN matches an entry's INN, or the start of its active substance (salts and hydrates). */
function innHit(a, x) { const g = norm(a.generic); if (!g) return false; return inns(x).some((n) => n === g || n.startsWith(g + ' ')); }
function emaEntry(a, x) {
  const text = String(x.therapeutic_indication || '');
  const gone = emaDate(x.withdrawal_expiry_revocation_lapse_of_marketing_authorisation_date) || emaDate(x.withdrawal_of_application_date);
  const flags = [['orphan_medicine', 'Orphan'], ['conditional_approval', 'Conditional'], ['exceptional_circumstances', 'Exceptional circumstances'], ['prime_priority_medicine', 'PRIME'], ['accelerated_assessment', 'Accelerated assessment'], ['additional_monitoring', 'Additional monitoring']].filter((f) => yes(x[f[0]])).map((f) => f[1]);
  const brand = a.brand && norm(x.name_of_medicine) === norm(a.brand) ? 1 : 0, inds = a.inds.filter((i) => i.re && i.re.test(text)).map((i) => i.id);
  // The indication text only for the asset's own medicine (same brand or indication), shortened; the page is linked.
  const own = (brand || inds.length) && !yes(x.generic) && !yes(x.biosimilar);
  return {
    n: x.name_of_medicine, p: x.ema_product_number, st: x.medicine_status, op: x.opinion_status || '', g: yes(x.generic) ? 1 : 0, b: yes(x.biosimilar) ? 1 : 0,
    h: x.marketing_authorisation_developer_applicant_holder || '', ev: emaDate(x.start_of_evaluation_date), co: emaDate(x.opinion_adopted_date), ma: emaDate(x.marketing_authorisation_date),
    ec: emaDate(x.european_commission_decision_date), rf: emaDate(x.refusal_of_marketing_authorisation_date), gone, fl: flags, brand, inds,
    ind: !own ? '' : text.length > 240 ? text.slice(0, 238).replace(/\s+\S*$/, '') + '…' : text, url: String(x.medicine_url || '').replace(EMA_PAGE, '')
  };
}
/* Current entries, and withdrawn, lapsed or refused ones for three years. */
function keepEma(e) {
  if (/^(Authorised|Opinion|Suspended)/i.test(e.st)) return true;
  const d = e.gone || e.rf || e.ec; return !!d && d >= daysAgo(KEEP_GONE_DAYS);
}
async function buildEma() {
  const j = JSON.parse(await get(EMA_MEDICINES));
  const rows = (j.data || []).filter((x) => x.category === 'Human');
  if (rows.length < 500) throw new Error('only ' + rows.length + ' human medicines in the EMA file');
  const out = {}, byProduct = {};
  LIST.forEach((a) => {
    const list = rows.filter((x) => innHit(a, x)).map((x) => emaEntry(a, x)).filter(keepEma).sort((p, q) => String(q.ma || q.co || q.ev || '').localeCompare(String(p.ma || p.co || p.ev || '')));
    if (list.length) { out[a.id] = list; list.forEach((e) => { (byProduct[e.p] = byProduct[e.p] || []).push(a.id); }); }
  });
  return { ema: out, byProduct, meta: { ok: true, at: new Date().toISOString(), file_time: (j.meta && j.meta.timestamp) || null, records: rows.length, assets: Object.keys(out).length } };
}
async function buildEmaPost(byProduct) {
  const j = JSON.parse(await get(EMA_POST));
  const out = {}; let n = 0;
  (j.data || []).filter((x) => x.category === 'Human' && byProduct[x.ema_product_number]).forEach((x) => {
    const e = { n: x.name_of_medicine, p: x.ema_product_number, st: x.post_authorisation_procedure_status || '', op: x.post_authorisation_opinion_status || '', od: emaDate(x.post_authorisation_opinion_date), wd: emaDate(x.withdrawal_of_application_date), pub: emaDate(x.first_published_date), url: String(x.medicine_url || '').replace(EMA_PAGE, '') };
    byProduct[x.ema_product_number].forEach((id) => { (out[id] = out[id] || []).push(e); n++; });
  });
  Object.values(out).forEach((l) => l.sort((p, q) => String(q.od || q.wd || q.pub || '').localeCompare(String(p.od || p.wd || p.pub || ''))));
  return { ema_post: out, meta: { ok: true, at: new Date().toISOString(), file_time: (j.meta && j.meta.timestamp) || null, records: (j.data || []).length, matched: n } };
}

/* ---------- FDA Orange Book ---------- */
/* The zip's central directory: each entry's name, modification date and data (stored or deflated). */
function unzip(buf) {
  const sig = Buffer.from([0x50, 0x4b, 0x05, 0x06]); const eocd = buf.lastIndexOf(sig); if (eocd < 0) throw new Error('not a zip file');
  const n = buf.readUInt16LE(eocd + 10); let p = buf.readUInt32LE(eocd + 16); const out = {};
  for (let i = 0; i < n; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('bad zip directory');
    const method = buf.readUInt16LE(p + 10), dd = buf.readUInt16LE(p + 14), csize = buf.readUInt32LE(p + 20), nlen = buf.readUInt16LE(p + 28), xlen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32), loff = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nlen).toString('utf8');
    const start = loff + 30 + buf.readUInt16LE(loff + 26) + buf.readUInt16LE(loff + 28); const raw = buf.subarray(start, start + csize);
    out[name] = { date: ((dd >> 9) & 0x7f) + 1980 + '-' + String((dd >> 5) & 0xf).padStart(2, '0') + '-' + String(dd & 0x1f).padStart(2, '0'), data: method === 0 ? raw : zlib.inflateRawSync(raw) };
    p += 46 + nlen + xlen + clen;
  }
  return out;
}
function table(buf) {
  const lines = buf.toString('latin1').split(/\r?\n/).filter(Boolean); const head = lines.shift().split('~');
  return lines.map((l) => { const c = l.split('~'); const o = {}; head.forEach((h, i) => { o[h] = (c[i] || '').trim(); }); return o; });
}
const MON = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };
function obDate(s) { const m = String(s || '').match(/([A-Z][a-z]{2})\s+(\d{1,2}),\s*(\d{4})/); return m ? m[3] + '-' + MON[m[1]] + '-' + m[2].padStart(2, '0') : null; }
async function buildOb() {
  const files = unzip(await get(ORANGE_BOOK, { binary: true }));
  const need = ['products.txt', 'patent.txt', 'exclusivity.txt']; need.forEach((f) => { if (!files[f]) throw new Error('Orange Book zip has no ' + f); });
  const products = table(files['products.txt'].data), patents = table(files['patent.txt'].data), excl = table(files['exclusivity.txt'].data);
  if (products.length < 10000) throw new Error('only ' + products.length + ' Orange Book products');
  const lapse = daysAgo(KEEP_LAPSED_DAYS), out = {};
  LIST.filter((a) => a.brand).forEach((a) => {
    const B = a.brand.toUpperCase(), G = a.generic.toUpperCase().split(/\s+/)[0];
    const mine = products.filter((r) => r.Appl_Type === 'N' && (r.Trade_Name === B || r.Trade_Name.startsWith(B + ' ')) && r.Ingredient.includes(G) && (!a.route || r['DF;Route'].includes(a.route)));
    if (!mine.length) return;
    const appls = uniq(mine.map((r) => r.Appl_No)), forms = uniq(mine.map((r) => r['DF;Route'])), ingr = uniq(mine.map((r) => r.Ingredient));
    const nda = appls.map((no) => { const rows = mine.filter((r) => r.Appl_No === no); const first = rows.map((r) => obDate(r.Approval_Date)).filter(Boolean).sort()[0] || null; return { appl: 'N' + no, trade: rows[0].Trade_Name, forms: uniq(rows.map((r) => r['DF;Route'])), first, holder: rows[0].Applicant_Full_Name }; });
    const pat = {};
    patents.filter((r) => r.Appl_Type === 'N' && appls.includes(r.Appl_No)).forEach((r) => {
      const exp = obDate(r.Patent_Expire_Date_Text); if (!exp) return;
      const p = pat[r.Patent_No] || (pat[r.Patent_No] = { no: r.Patent_No, exp, ds: 0, dp: 0, use: 0 });
      if (exp > p.exp) p.exp = exp; if (r.Drug_Substance_Flag === 'Y') p.ds = 1; if (r.Drug_Product_Flag === 'Y') p.dp = 1; if (r.Patent_Use_Code) p.use = 1;
    });
    // Compact rows: [number, expiry, claims: S drug substance, P drug product, U a method of use]
    const pack = (p) => [p.no, p.exp, (p.ds ? 'S' : '') + (p.dp ? 'P' : '') + (p.use ? 'U' : '')];
    const ex = {};
    excl.filter((r) => r.Appl_Type === 'N' && appls.includes(r.Appl_No)).forEach((r) => { const d = obDate(r.Exclusivity_Date); if (!d) return; if (!ex[r.Exclusivity_Code] || ex[r.Exclusivity_Code].date < d) ex[r.Exclusivity_Code] = { code: r.Exclusivity_Code, date: d }; });
    // Generics: ANDAs of the same ingredient in a dosage form and route the brand has.
    const gen = products.filter((r) => r.Appl_Type === 'A' && ingr.includes(r.Ingredient) && forms.includes(r['DF;Route']));
    const gApps = uniq(gen.map((r) => r.Appl_No)); const marketed = gApps.filter((no) => gen.some((r) => r.Appl_No === no && r.Type !== 'DISCN'));
    out[a.id] = {
      nda, patents: Object.values(pat).filter((p) => p.exp >= lapse).sort((p, q) => p.exp.localeCompare(q.exp)).map(pack), expired: Object.values(pat).filter((p) => p.exp < lapse).length,
      excl: Object.values(ex).filter((x) => x.date >= lapse).sort((p, q) => p.date.localeCompare(q.date)),
      generics: { apps: gApps.length, marketed: marketed.length, first: gen.map((r) => obDate(r.Approval_Date)).filter(Boolean).sort()[0] || null, holders: uniq(gen.filter((r) => marketed.includes(r.Appl_No)).map((r) => r.Applicant)).slice(0, 8), te: uniq(gen.map((r) => r.TE_Code).filter(Boolean)) }
    };
  });
  return { ob: out, meta: { ok: true, at: new Date().toISOString(), file_date: files['products.txt'].date, products: products.length, assets: Object.keys(out).length } };
}

/* ---------- Run: each part on its own; a failed part keeps its earlier values ---------- */
const sources = Object.assign({}, prev.sources || {});
const payload = { generated_utc: now.toISOString(), sources, ema: prev.ema || {}, ema_post: prev.ema_post || {}, ob: prev.ob || {} };
const fail = (k, e) => { sources[k] = Object.assign({}, sources[k] || {}, { ok: false, at: new Date().toISOString(), error: String((e && e.message) || e).slice(0, 200) }); log(`FAILED ${k}: ${sources[k].error}${prev[k] ? ' (earlier values kept)' : ''}`); };
if (part('ema')) {
  let byProduct = null;
  try { const r = await buildEma(); payload.ema = r.ema; sources.ema = r.meta; byProduct = r.byProduct; log(`ok     ema       ${r.meta.assets} assets in ${r.meta.records} EU medicines`); } catch (e) { fail('ema', e); }
  if (byProduct) { try { const r = await buildEmaPost(byProduct); payload.ema_post = r.ema_post; sources.ema_post = r.meta; log(`ok     ema_post  ${r.meta.matched} procedures for the catalog's medicines`); } catch (e) { fail('ema_post', e); } }
}
if (part('ob')) { try { const r = await buildOb(); payload.ob = r.ob; sources.ob = r.meta; log(`ok     ob        ${r.meta.assets} brands, Orange Book of ${r.meta.file_date}`); } catch (e) { fail('ob', e); } }
payload.notes = [
  'EMA: the Medicines and Post-authorisation procedures data files, matched to catalog assets by INN (active substance for salts). inds lists the catalog indications the EU indication text names; brand marks a medicine with the asset\'s US brand name; url is the page below https://www.ema.europa.eu/en/medicines/human/.',
  'Orange Book: patents and exclusivities listed against the brand\'s NDAs; expired entries are dropped a year after they lapse. Listed patents may be challenged, settled or delisted, so the latest listed date is not a loss-of-exclusivity forecast. Generics are ANDAs of the same ingredient in a dosage form and route of the brand.'
];
const header = `/* MIP · EU regulatory status (EMA) and US patents, exclusivity and generics (FDA Orange Book) for the catalog assets, generated by jobs/fetch-regulatory.mjs on ${payload.generated_utc}.\n   Sources: EMA medicines data files, FDA Orange Book data files. Do not edit by hand: rerun the script. */\n`;
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT + '.tmp', header + 'window.MIP_REGULATORY = ' + JSON.stringify(payload) + ';\n');
fs.renameSync(OUT + '.tmp', OUT);
log(`Wrote data/regulatory.js · ${Object.keys(payload.ema).length} assets with EU entries, ${Object.keys(payload.ob).length} brands in the Orange Book · ${((Date.now() - t0) / 1000).toFixed(0)}s`);
