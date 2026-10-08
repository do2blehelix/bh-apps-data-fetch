// Catalog build tool: reads and checks a draft file for one therapeutic area, and writes catalog entries.
// A draft is a CommonJS module:
//   module.exports = {
//     ta: 'IDERM',
//     addInds:    [{ id, name, short, abbr: [], syn: [], epmc, ct, re, not?, label }],      new indications (re, not, label are regex sources, no slashes)
//     addAssets:  [{ id, name, short?, brand?, brands?, generic?, company, moa, grp, route, codes?, inds: [], epmc?, intr?, sponsor?, only?, labelRoute?, sibling?, inn? }],
//     editAssets: [{ id, set?: { brand, brands, company, moa, grp, route, generic, labelRoute, sponsor }, addInds?: [], addCodes?: [], addBrands?: [], addSponsor?: 'regex source to OR onto the sponsor pattern' }],
//     notes: 'free text: what was left out and why'
//   };
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
export const CAT = require('../../js/catalog.js');

const ROUTES = CAT.ROUTES;
const KEYS = ['id', 'name', 'short', 'brand', 'brands', 'generic', 'company', 'moa', 'grp', 'route', 'codes', 'inds', 'epmc', 'intr', 'sponsor', 'only', 'labelRoute', 'sibling', 'inn', 'ext'];
const IND_KEYS = ['id', 'name', 'short', 'abbr', 'syn', 'epmc', 'ct', 're', 'not', 'label', 'core'];
const REGEX_KEYS = ['only'], IND_REGEX_KEYS = ['re', 'not', 'label'];

export function loadDraft(file) {
  const m = require(file);
  return Object.assign({ addInds: [], addAssets: [], editAssets: [], notes: '' }, m);
}

/* Returns { errors, warnings } for a draft against the current catalog. */
export function check(d) {
  const errors = [], warnings = [];
  const err = (m) => errors.push(m), warn = (m) => warnings.push(m);
  const t = CAT.TAS.find((x) => x.id === d.ta);
  if (!t) { err('unknown ta ' + d.ta); return { errors, warnings }; }
  const indIds = new Set(t.inds.map((i) => i.id));
  for (const i of d.addInds) {
    for (const k of Object.keys(i)) if (!IND_KEYS.includes(k)) err(`indication ${i.id}: unknown key ${k}`);
    if (!/^[A-Za-z][A-Za-z0-9]{1,9}$/.test(i.id || '')) err(`indication id ${i.id}: 2 to 10 letters and digits`);
    if (indIds.has(i.id)) err(`indication ${i.id} already exists in ${t.id}`);
    for (const k of ['name', 'short', 'epmc', 'ct', 're', 'label']) if (!i[k]) err(`indication ${i.id}: ${k} missing`);
    for (const k of IND_REGEX_KEYS) if (i[k]) { try { new RegExp(i[k], 'i'); } catch (e) { err(`indication ${i.id}: ${k} is not a regex: ${e.message}`); } }
    if (i.re && i.label && !new RegExp(i.re, 'i').test(i.name)) warn(`indication ${i.id}: re does not match its own name`);
    indIds.add(i.id);
  }
  const anyById = new Map(); CAT.TAS.forEach((x) => x.assets.forEach((a) => { if (!anyById.has(a.id)) anyById.set(a.id, { a, tas: [] }); anyById.get(a.id).tas.push(x.id); }));
  const brandOwner = new Map(); CAT.TAS.forEach((x) => x.assets.forEach((a) => { [a.brand].concat(a.brands || []).filter(Boolean).forEach((b) => { const k = b.toUpperCase(); if (!brandOwner.has(k)) brandOwner.set(k, a.id); }); }));
  const seen = new Set();
  for (const a of d.addAssets) {
    for (const k of Object.keys(a)) if (!KEYS.includes(k)) err(`asset ${a.id}: unknown key ${k}`);
    if (!/^[a-z0-9]{2,40}$/.test(a.id || '')) { err(`asset id ${a.id}: 2 to 40 characters, lowercase letters and digits only`); continue; }
    if (seen.has(a.id)) err(`asset ${a.id} twice in the draft`); seen.add(a.id);
    if (t.assets.some((x) => x.id === a.id)) err(`asset ${a.id} already in ${t.id}: use editAssets`);
    for (const k of ['name', 'company', 'moa', 'grp', 'route']) if (!a[k]) err(`asset ${a.id}: ${k} missing`);
    if (a.route && !ROUTES.includes(a.route)) err(`asset ${a.id}: route ${a.route} is not one of ${ROUTES.join(', ')}`);
    if (!Array.isArray(a.inds) || !a.inds.length) err(`asset ${a.id}: inds missing`);
    else for (const x of a.inds) if (!indIds.has(x)) err(`asset ${a.id}: indication ${x} is not in ${t.id}`);
    if (a.brand && a.brand !== a.brand.toUpperCase()) err(`asset ${a.id}: brand ${a.brand} is written in capitals (as openFDA has it)`);
    if (!a.brand && !a.sponsor) err(`asset ${a.id}: a product without a US brand needs a sponsor pattern (the lead sponsor on ClinicalTrials.gov)`);
    if (!a.brand && !(a.codes || []).length && !a.intr) warn(`asset ${a.id}: no brand, no codes and no intr`);
    for (const k of REGEX_KEYS) if (a[k]) { try { new RegExp(a[k], 'i'); } catch (e) { err(`asset ${a.id}: ${k} is not a regex: ${e.message}`); } }
    if (a.sponsor) { try { new RegExp(a.sponsor, 'i'); } catch (e) { err(`asset ${a.id}: sponsor is not a regex: ${e.message}`); } if (/[A-Z]/.test(a.sponsor)) warn(`asset ${a.id}: sponsor pattern is lowercase`); }
    for (const b of [a.brand].concat(a.brands || []).filter(Boolean)) { const o = brandOwner.get(b.toUpperCase()); if (o && o !== a.id) err(`asset ${a.id}: brand ${b} already belongs to ${o}`); }
    const other = anyById.get(a.id);
    if (other) for (const k of ['brand', 'company', 'route']) if ((other.a[k] || '') !== (a[k] || '')) warn(`asset ${a.id} is in ${other.tas.join(',')} with ${k} "${other.a[k] || ''}"; this draft says "${a[k] || ''}"`);
    if (!other) { const g = String(a.generic || a.name).toLowerCase(); const dupe = CAT.TAS.flatMap((x) => x.assets).find((x) => x.id !== a.id && String(x.generic || x.name).toLowerCase() === g && (x.route || '') === (a.route || '')); if (dupe) warn(`asset ${a.id}: same generic and route as existing ${dupe.id}`); }
  }
  for (const e of d.editAssets) {
    const x = t.assets.find((y) => y.id === e.id);
    if (!x) { err(`edit ${e.id}: not in ${t.id}`); continue; }
    for (const k of Object.keys(e.set || {})) if (!['brand', 'brands', 'company', 'moa', 'grp', 'route', 'generic', 'labelRoute', 'sibling', 'short', 'name', 'sponsor'].includes(k)) err(`edit ${e.id}: cannot set ${k}`);
    if (e.set && e.set.route && !ROUTES.includes(e.set.route)) err(`edit ${e.id}: route ${e.set.route}`);
    for (const i of e.addInds || []) if (!indIds.has(i)) err(`edit ${e.id}: indication ${i} is not in ${t.id}`);
  }
  return { errors, warnings };
}

const q = (s) => "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
const arr = (a) => '[' + a.map(q).join(', ') + ']';
const rx = (src) => '/' + String(src).replace(/\//g, '\\/') + '/i';
export function assetLine(a) {
  const parts = [];
  for (const k of KEYS) {
    if (a[k] == null || a[k] === '' || (Array.isArray(a[k]) && !a[k].length)) continue;
    if (k === 'ext') { parts.push('ext: 1'); continue; }
    if (k === 'only') parts.push('only: ' + rx(a[k]));
    else if (k === 'inn') parts.push('inn: ' + (a[k] === false ? 'false' : 'true'));
    else if (Array.isArray(a[k])) parts.push(k + ': ' + arr(a[k]));
    else parts.push(k + ': ' + q(a[k]));
  }
  return '        { ' + parts.join(', ') + ' }';
}
export function indLine(i) {
  const parts = [];
  for (const k of IND_KEYS) {
    if (i[k] == null || i[k] === '' || (Array.isArray(i[k]) && !i[k].length && k !== 'abbr' && k !== 'syn')) continue;
    if (k === 'core') { if (i.core) parts.push('core: true'); continue; }
    if (['re', 'not', 'label'].includes(k)) parts.push(k + ': ' + rx(i[k]));
    else if (Array.isArray(i[k])) parts.push(k + ': ' + arr(i[k]));
    else parts.push(k + ': ' + q(i[k]));
  }
  return '        { ' + parts.join(', ') + ' }';
}
