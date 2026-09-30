#!/usr/bin/env node
// bh-apps-data-fetch · JSON twins of the data files, for apps that read them with fetch() rather than <script src>.
//   node jobs/to-json.mjs
// Each data/<name>.js (window.MIP_* or the catalog-updates wrapper) is written again as data/<name>.json, without the
// jobs' own bookkeeping (document ledgers, queues, per-asset run times), which the apps never show. A file whose
// content has not changed is left alone, so an unchanged run commits nothing.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const DATA = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const FILES = [
  { name: 'intel', global: 'MIP_INTEL', drop: ['docs', 'pending', 'runs'] },
  { name: 'regulatory', global: 'MIP_REGULATORY', drop: [] },
  { name: 'revenue', global: 'MIP_REVENUE', drop: ['ledger'] },
  { name: 'catalog-updates', global: 'MIP_CATALOG_UPDATES', drop: [] }
];

for (const f of FILES) {
  const src = path.join(DATA, f.name + '.js'), out = path.join(DATA, f.name + '.json');
  if (!fs.existsSync(src)) { console.log(`${f.name}.js    not there yet, skipped`); continue; }
  const ctx = { window: {} };
  try { vm.runInNewContext(fs.readFileSync(src, 'utf8'), ctx); } catch (e) { console.log(`${f.name}.js    could not be read: ${e.message}`); process.exitCode = 1; continue; }
  const obj = ctx.window[f.global] || ctx[f.global];
  if (!obj) { console.log(`${f.name}.js    defines no ${f.global}, skipped`); process.exitCode = 1; continue; }
  const slim = Object.fromEntries(Object.entries(obj).filter(([k]) => !f.drop.includes(k)));
  const body = JSON.stringify(slim);
  if (fs.existsSync(out) && fs.readFileSync(out, 'utf8') === body) { console.log(`${f.name}.json  unchanged`); continue; }
  fs.writeFileSync(out + '.tmp', body); fs.renameSync(out + '.tmp', out);
  console.log(`${f.name}.json  written, ${Math.round(body.length / 1024)} KB`);
}
