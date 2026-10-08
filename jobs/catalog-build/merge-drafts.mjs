#!/usr/bin/env node
// Catalog build tool: checks the draft files of the therapeutic areas and writes them into js/catalog.js.
//   node jobs/catalog-build/merge-drafts.mjs <drafts dir> [--check] [--out=<catalog file>]
// --check only reports. Without --out the catalog file js/catalog.js is rewritten in place.
// Entries are added at the end of their area's indications and assets lists, one line each, with ext: 1 on every new
// asset (a listed product: in Watchlist, and watched by default only where it competes in a core indication).
// A new asset whose id is already used in another area copies that entry's product facts, so one product is one
// product in every area. editAssets change the entry in this area; facts shared by a product (brand, company, mechanism,
// route, generic) change in every area that lists it.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CAT, loadDraft, check, assetLine, indLine } from './draft-lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const DIR = argv.find((a) => !a.startsWith('--')), CHECK = argv.includes('--check');
const OUT = (argv.find((a) => a.startsWith('--out=')) || '').slice(6) || path.join(HERE, '..', '..', 'js', 'catalog.js');
if (!DIR) { console.error('usage: merge-drafts.mjs <drafts dir> [--check] [--out=file]'); process.exit(1); }

const files = fs.readdirSync(DIR).filter((f) => /\.(c?js)$/.test(f)).sort();
const drafts = files.map((f) => loadDraft(path.resolve(DIR, f)));
// A new asset used by several drafts is one product when the id and the brand agree (a draft without a brand is the same
// product as one with it: the pipeline entry of a molecule that another area lists as approved). The branded facts are used,
// else the first draft's; each area keeps its own indications and group. The same brand under two ids is one product too
// (the first id is kept). When the brand differs under one id it is another product that happens to share the id (Droxia
// and Hydrea, Neoral and Restasis): it gets its own id.
const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const usedIds = new Set(CAT.TAS.flatMap((t) => t.assets.map((a) => a.id)));
const same = (x, y) => !x.brand || !y.brand || x.brand.toUpperCase() === y.brand.toUpperCase();
const prods = []; // { id, a (canonical facts) }
const prodOf = new Map(); // draft asset object -> product
let bad = 0, renamed = 0;
for (const d of drafts) {
  const { errors, warnings } = check(d);
  console.log(`${d.ta}: +${d.addInds.length} indications, +${d.addAssets.length} assets, ${d.editAssets.length} edits, ${errors.length} errors, ${warnings.length} warnings`);
  errors.forEach((e) => console.log('  ERROR  ' + e)); warnings.forEach((w) => console.log('  warn   ' + w));
  bad += errors.length;
  for (const a of d.addAssets) {
    let p = prods.find((x) => x.id === a.id && same(x.a, a)) || (a.brand ? prods.find((x) => x.a.brand && x.a.brand.toUpperCase() === a.brand.toUpperCase()) : null);
    if (p) {
      if (p.ta !== d.ta) for (const k of ['company', 'name', 'route']) if ((p.a[k] || '') !== (a[k] || '')) console.log(`  note   ${p.id}: ${p.ta} says ${k} "${p.a[k] || ''}", ${d.ta} says "${a[k] || ''}"`);
      if (a.brand && !p.a.brand) p.a = a; // the branded entry's facts win
      if (p.id !== a.id && p.a.brand) console.log(`  merge  ${a.id} (${d.ta}) is ${p.id}: same brand ${a.brand}`);
    } else {
      let id = a.id;
      if (prods.some((x) => x.id === id)) { id = a.id + slug(a.brand || a.route); let n = 2; while (usedIds.has(id) || prods.some((x) => x.id === id)) id = a.id + slug(a.brand || a.route) + n++; console.log(`  split  ${a.id} (${d.ta}, ${a.brand || a.route}) is another product than ${prods.find((x) => x.id === a.id).a.brand}: new id ${id}`); renamed++; }
      p = { id, ta: d.ta, a }; prods.push(p);
    }
    prodOf.set(a, p);
  }
}
for (const d of drafts) d.addAssets = d.addAssets.map((a) => { const p = prodOf.get(a); return Object.assign({}, p.a, { id: p.id, inds: a.inds, grp: a.grp }); });
const base = new Map(prods.map((p) => [p.id, 1]));
const total = drafts.reduce((n, d) => n + d.addAssets.length, 0);
console.log(`\n${drafts.length} drafts, ${total} asset lines (${base.size} distinct new products), ${bad} errors`);
if (bad) { console.log('Fix the errors first.'); process.exit(2); }
if (CHECK) process.exit(0);

let lines = fs.readFileSync(OUT, 'utf8').split('\n');
const find = (from, re) => { for (let i = from; i < lines.length; i++) if (re.test(lines[i])) return i; return -1; };
const addLines = (taId, listStart, news) => {
  if (!news.length) return;
  const ta = find(0, new RegExp("^\\s+id: '" + taId + "',"));
  const start = find(ta, new RegExp('^\\s{6}' + listStart + ': \\['));
  const end = find(start + 1, /^\s{6}\],?\s*$/);
  if (ta < 0 || start < 0 || end < 0) throw new Error('cannot find ' + listStart + ' of ' + taId);
  if (!/,\s*$/.test(lines[end - 1])) lines[end - 1] += ',';
  const out = news.map((l, i) => l + (i < news.length - 1 ? ',' : ''));
  lines.splice(end, 0, ...out);
};
/* Entry edits: textual, on the one line of the entry. */
const entryIdx = (taId, id) => { const ta = find(0, new RegExp("^\\s+id: '" + taId + "',")); const s = find(ta, /^\s{6}assets: \[/); for (let i = s + 1; i < lines.length && !/^\s{6}\],?\s*$/.test(lines[i]); i++) if (lines[i].includes("{ id: '" + id + "',")) return i; return -1; };
const q = (s) => "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
function setField(i, k, v) {
  const val = Array.isArray(v) ? '[' + v.map(q).join(', ') + ']' : q(v);
  const re = new RegExp("\\b" + k + ": (\\[[^\\]]*\\]|'(?:[^'\\\\]|\\\\.)*')");
  if (re.test(lines[i])) lines[i] = lines[i].replace(re, () => k + ': ' + val); else lines[i] = lines[i].replace(/\s*\}(,?)\s*$/, (m, c) => ', ' + k + ': ' + val + ' }' + c);
}
function addTo(i, k, vals) {
  const re = new RegExp("\\b" + k + ": \\[([^\\]]*)\\]"), m = lines[i].match(re);
  const cur = m ? Array.from(m[1].matchAll(/'((?:[^'\\]|\\.)*)'/g)).map((x) => x[1].replace(/\\'/g, "'")) : [];
  const next = cur.concat(vals.filter((v) => !cur.some((c) => c.toLowerCase() === String(v).toLowerCase())));
  if (next.length !== cur.length) setField(i, k, next);
}
const SHARED = ['brand', 'brands', 'company', 'moa', 'generic', 'route', 'labelRoute', 'sibling', 'sponsor'];
for (const d of drafts) {
  for (const e of d.editAssets) {
    const mine = entryIdx(d.ta, e.id);
    for (const [k, v] of Object.entries(e.set || {})) {
      const targets = SHARED.includes(k) ? CAT.TAS.filter((t) => t.assets.some((a) => a.id === e.id)).map((t) => t.id) : [d.ta];
      for (const t of targets) { const i = entryIdx(t, e.id); if (i >= 0) setField(i, k, v); }
    }
    if (mine >= 0) { if (e.addInds && e.addInds.length) addTo(mine, 'inds', e.addInds); }
    for (const t of CAT.TAS.filter((t) => t.assets.some((a) => a.id === e.id)).map((t) => t.id)) { const i = entryIdx(t, e.id); if (i < 0) continue; if (e.addCodes && e.addCodes.length) addTo(i, 'codes', e.addCodes); if (e.addBrands && e.addBrands.length) addTo(i, 'brands', e.addBrands); if (e.addSponsor) { const m = lines[i].match(/sponsor: '((?:[^'\\]|\\.)*)'/); setField(i, 'sponsor', (m ? m[1] + '|' : '') + e.addSponsor); } }
  }
}
for (const d of drafts) {
  addLines(d.ta, 'inds', d.addInds.map(indLine));
  addLines(d.ta, 'assets', d.addAssets.map((a) => assetLine(Object.assign({}, a, { ext: 1 }))));
}
fs.writeFileSync(OUT, lines.join('\n'));
console.log('written', OUT);
