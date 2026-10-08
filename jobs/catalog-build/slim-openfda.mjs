#!/usr/bin/env node
// Catalog build tool (maintainer script, not run by the scheduled jobs).
// Reads the openFDA bulk files (https://download.open.fda.gov/, unzipped) and writes two slim files that the harvest
// scripts query without the API's limits (1,000 calls a day per IP without a key):
//   labels.jsonl  one line per drug label: set id, effective date, openfda brand/generic/application/route/class,
//                 whether the openfda block is empty, the first product element, whether it looks like a prescription label (an indications section, no OTC Drug Facts sections), and the indications text
//   daf.json      Drugs@FDA applications: NDA and BLA only, with sponsor, products, first approval and class
//   node jobs/catalog-build/slim-openfda.mjs <dir with drug-label-*.json and drug-drugsfda-*.json> <out dir>
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

const [, , SRC, OUT] = process.argv;
if (!SRC || !OUT) { console.error('usage: slim-openfda.mjs <bulk dir> <out dir>'); process.exit(1); }
fs.mkdirSync(OUT, { recursive: true });
const txt = (a) => (Array.isArray(a) ? a.join(' ') : a || '');
const squash = (s) => String(s || '').replace(/\s+/g, ' ').trim();

/* The files are pretty-printed: a record of "results" starts at a line of four spaces and a brace and ends at four spaces and a brace. */
async function* records(file) {
  const rl = readline.createInterface({ input: fs.createReadStream(file, { encoding: 'utf8', highWaterMark: 1 << 20 }), crlfDelay: Infinity });
  let buf = null;
  for await (const line of rl) {
    if (buf === null) { if (line === '    {') buf = ['{']; continue; }
    if (line === '    }' || line === '    },') { buf.push('}'); yield JSON.parse(buf.join('\n')); buf = null; continue; }
    buf.push(line);
  }
}

const labelFiles = fs.readdirSync(SRC).filter((f) => /^drug-label-.*\.json$/.test(f)).sort();
const out = fs.createWriteStream(path.join(OUT, 'labels.jsonl'));
let n = 0, nRx = 0; const names = new Set();
for (const f of labelFiles) {
  for await (const r of records(path.join(SRC, f))) {
    n++;
    const o = r.openfda || {};
    for (const k of ["generic_name", "substance_name", "brand_name"]) for (const x of o[k] || []) names.add(String(x).toLowerCase());
    const ind = squash(txt(r.indications_and_usage));
    if (!ind && !Object.keys(o).length) continue;
    const rec = {
      id: r.set_id, eff: r.effective_time, ver: r.version,
      brand: o.brand_name || [], gen: o.generic_name || [], sub: o.substance_name || [], app: o.application_number || [], route: o.route || [], mfr: o.manufacturer_name || [],
      pt: (o.product_type || [])[0] || '', epc: (o.pharm_class_epc || []).map((x) => x.replace(/\s*\[EPC\]$/, '')), moa: (o.pharm_class_moa || []).map((x) => x.replace(/\s*\[MoA\]$/, '')),
      empty: !Object.keys(o).length, first: squash(txt(r.spl_product_data_elements)).slice(0, 160), rx: !!ind && !r.purpose && !r.active_ingredient,
      form: squash(txt(r.dosage_forms_and_strengths) + ' ' + txt(r.how_supplied) + ' ' + txt(r.description)).slice(0, 700),
      indLen: ind.length, ind: ind.slice(0, 4000)
    };
    if (rec.app.some((a) => /^(NDA|BLA)/.test(a)) || rec.empty) { nRx++; out.write(JSON.stringify(rec) + '\n'); }
  }
  console.log('label file', f, 'records so far', n, 'kept', nRx);
}
out.end();
fs.writeFileSync(path.join(OUT, "names.txt"), Array.from(names).sort().join(String.fromCharCode(10)));

const dafFiles = fs.readdirSync(SRC).filter((f) => /^drug-drugsfda-.*\.json$/.test(f));
const daf = [];
for (const f of dafFiles) {
  for await (const r of records(path.join(SRC, f))) {
    if (!/^(NDA|BLA)/.test(r.application_number)) continue;
    const subs = (r.submissions || []).filter((s) => s.submission_status === 'AP' && s.submission_status_date);
    const orig = subs.filter((s) => s.submission_type === 'ORIG').map((s) => s.submission_status_date).sort()[0] || subs.map((s) => s.submission_status_date).sort()[0] || '';
    const o1 = (r.submissions || []).find((s) => s.submission_type === 'ORIG');
    daf.push({
      app: r.application_number, sponsor: r.sponsor_name, first: orig, cls: o1 ? (o1.submission_class_code || '') + ' ' + (o1.submission_class_code_description || '') : '', prio: o1 ? o1.review_priority || '' : '',
      products: (r.products || []).map((p) => ({ brand: p.brand_name, form: p.dosage_form, route: p.route, status: p.marketing_status, ai: (p.active_ingredients || []).map((x) => x.name + ' ' + x.strength) })),
      gen: (r.openfda || {}).generic_name || [], epc: ((r.openfda || {}).pharm_class_epc || []).map((x) => x.replace(/\s*\[EPC\]$/, ''))
    });
  }
}
fs.writeFileSync(path.join(OUT, 'daf.json'), JSON.stringify(daf));
console.log('drugs@fda NDA/BLA applications', daf.length);
