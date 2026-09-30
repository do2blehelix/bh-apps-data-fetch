/* =========================================================
   Shared name matching and feed parsing
   One file for jobs/fetch-intel.mjs (the scheduled job) and the browser (window.MIP_MATCH), so an asset is recognised
   the same way in a scheduled headline and in a live one.
     termsOf(a)      the names that identify a catalog asset in a text: US brand (and its first word when the brand has
                     several, as headlines drop the device name), INN (not for a formulation whose molecule has other
                     products, such as ruxolitinib cream), the catalog name and short name, development codes, and a code
                     or coined name given in the name's parentheses. Terms of under four characters without a digit, and
                     lists with commas, are left out.
     newsWordsOf(a)  the few words searched in GDELT: brand, INN (else the catalog name), one code of letters and digits
                     or a coined name (CagriSema). GDELT refuses short keywords and splits hyphenated ones.
     termRe(terms)   a whole-word, case-insensitive pattern for those names; hyphens and spaces in codes match either way
     parseFeed(xml)  RSS or Atom items: { title, link, date (YYYY-MM-DD or null), summary }
   a is a catalog asset with its defaults filled in (CAT.asset()).
   ========================================================= */
(function (root) {
  'use strict';
  var ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', ndash: '–', mdash: '—', hellip: '…', bull: '•', middot: '·', reg: '®', trade: '™', copy: '©', eacute: 'é', egrave: 'è', uuml: 'ü', ouml: 'ö', auml: 'ä', szlig: 'ß', deg: '°', plusmn: '±', le: '≤', ge: '≥', times: '×', alpha: 'α', beta: 'β', gamma: 'γ', kappa: 'κ' };
  function decode(s) {
    return String(s).replace(/&#x([0-9a-f]+);/gi, function (_, h) { return String.fromCodePoint(parseInt(h, 16)); }).replace(/&#(\d+);/g, function (_, d) { return String.fromCodePoint(+d); })
      .replace(/&([a-z]+);/gi, function (m, n) { var v = ENT[n.toLowerCase()]; return v != null ? v : m; });
  }
  function titleCase(s) { return String(s).toLowerCase().replace(/(^|[\s/-])([a-z])/g, function (m, p, c) { return p + c.toUpperCase(); }); }
  function uniqCI(a) { var seen = {}; return a.filter(function (x) { var k = String(x || '').toLowerCase(); if (!x || seen[k]) return false; seen[k] = 1; return true; }); }
  function escRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  var ROUTE_WORD = /^(topical|oral|injectable|intravenous|subcutaneous|intravitreal|inhaled|intranasal|PrEP)$/i;
  function parts(a) {
    var brand = a.brand ? titleCase(a.brand) : null, bw = brand ? brand.split(/\s+/) : [];
    return { brand: brand, first: bw.length > 1 && bw[0].length >= 5 ? bw[0] : null, base: a.name.replace(/\s*\([^)]*\)\s*$/, '').trim(), paren: ((a.name.match(/\(([^()]+)\)\s*$/) || [])[1] || '').trim() };
  }
  function termsOf(a) {
    var p = parts(a), t = [p.brand, p.first, a.only ? null : a.generic, p.base, a.short].concat(a.codes || []);
    if (p.paren && !/\s/.test(p.paren) && !ROUTE_WORD.test(p.paren) && (/\d/.test(p.paren) || /[a-z][A-Z]/.test(p.paren) || /^[A-Z][A-Z-]{3,}$/.test(p.paren))) t.push(p.paren);
    return uniqCI(t.filter(function (x) { return x && !/[,;]/.test(x) && (x.length >= 4 || /\d/.test(x)); }));
  }
  function newsWordsOf(a) {
    var p = parts(a), ok = function (x) { return x && x.length >= 4 && !/[-/,+&().]/.test(x); };
    var inn = [a.only ? p.base : a.generic, p.base, a.short].filter(ok)[0];
    var code = [a.short, p.paren].concat(a.codes || []).filter(function (c) { return c && /^[A-Za-z0-9]{5,}$/.test(c) && (/\d/.test(c) || /[a-z][A-Z]/.test(c)); })[0];
    return uniqCI([p.first || p.brand, inn, code].filter(ok)).slice(0, 3);
  }
  function termRe(terms) { return new RegExp('(?:^|[^a-z0-9])(?:' + terms.map(function (t) { return escRe(t).replace(/\\?[- ]/g, '[- ]?'); }).join('|') + ')(?![a-z0-9])', 'i'); }

  /* Feed text: CDATA unwrapped, entities decoded, the HTML some feeds carry stripped, decoded again. */
  function feedText(s) { var t = decode(String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')).replace(/<[^>]+>/g, ' '); return decode(t).replace(/\s+/g, ' ').trim(); }
  function parseFeed(xml) {
    var out = [], re = /<(item|entry)\b[\s\S]*?<\/\1>/g, m;
    while ((m = re.exec(String(xml)))) {
      var it = m[0], tag = function (n) { var x = it.match(new RegExp('<' + n + '\\b[^>]*>([\\s\\S]*?)</' + n + '>', 'i')); return x ? x[1] : ''; };
      var link = feedText(tag('link'));
      if (!link) { var l = it.match(/<link\b[^>]*rel="alternate"[^>]*href="([^"]+)"/i) || it.match(/<link\b[^>]*href="([^"]+)"/i); link = l ? decode(l[1]) : feedText(tag('guid')); }
      var when = Date.parse(feedText(tag('pubDate') || tag('published') || tag('updated') || tag('dc:date')));
      out.push({ title: feedText(tag('title')), link: link.replace(/^http:\/\//i, 'https://'), date: isNaN(when) ? null : new Date(when).toISOString().slice(0, 10), summary: feedText(tag('description') || tag('summary') || tag('content')) });
    }
    return out;
  }

  var api = { decode: decode, titleCase: titleCase, termsOf: termsOf, newsWordsOf: newsWordsOf, termRe: termRe, feedText: feedText, parseFeed: parseFeed };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.MIP_MATCH = api;
})(this);
