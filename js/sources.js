/* =========================================================
   Public API source registry
   One list shared by the browser (js/api.js) and the dev proxy (proxy/upstream.mjs), so both apply the same
   limits and cache lifetimes. Limits sit below each source's published limit.
     rpm    requests per minute         burst  requests allowed back to back     conc  parallel requests
     day    daily cap without a key     *Keyed the same with an API key          ttlH  cache lifetime, hours
     cors   callable straight from a browser (probed 25 Sep 2026); false = dev proxy only
     key    API key the proxy adds (env variable, as a query parameter or a header)
     contact  the proxy adds CONTACT_EMAIL for polite-pool access
     accept   Accept header for sources that answer with HTML rather than JSON (default application/json)
     timeoutS give up on a call after this many seconds (default: no limit), for sources that sometimes hang
     post     the source searches by POST only: the browser asks for a GET URL whose query parameter of this name holds the
              JSON body, and the dev proxy sends that body as a POST (so answers cache by URL like any other)
   Cache lifetimes follow the refresh cadence in requirements.md, section 7.
   ========================================================= */
(function (root) {
  'use strict';
  var SOURCES = {
    europepmc: { name: 'Europe PMC', base: 'https://www.ebi.ac.uk/europepmc/webservices/rest', cors: true, rpm: 300, burst: 5, conc: 3, ttlH: 12, limit: 'No published limit, kept to 5 per second' },
    ctgov: { name: 'ClinicalTrials.gov', base: 'https://clinicaltrials.gov/api/v2', cors: true, rpm: 40, burst: 3, conc: 2, ttlH: 12, limit: 'About 50 per minute per IP address' },
    openfda: { name: 'openFDA', base: 'https://api.fda.gov', cors: true, rpm: 180, rpmKeyed: 220, burst: 10, conc: 4, day: 900, dayKeyed: 100000, ttlH: 24, key: { env: 'OPENFDA_API_KEY', param: 'api_key' }, limit: '240 per minute; 1,000 per day per IP address without a key, 120,000 with one' },
    eutils: { name: 'PubMed (NCBI E-utilities)', base: 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils', cors: true, rpm: 150, rpmKeyed: 500, burst: 2, conc: 2, ttlH: 12, key: { env: 'NCBI_API_KEY', param: 'api_key' }, contact: { param: 'email', tool: true }, limit: '3 per second, 10 with a key' },
    crossref: { name: 'Crossref', base: 'https://api.crossref.org', cors: true, rpm: 180, burst: 3, conc: 1, ttlH: 24, contact: { param: 'mailto' }, limit: 'Public pool 5 per second, one request at a time' },
    openalex: { name: 'OpenAlex', base: 'https://api.openalex.org', cors: true, rpm: 300, burst: 5, conc: 2, day: 90, dayKeyed: 90000, ttlH: 72, key: { env: 'OPENALEX_API_KEY', param: 'api_key' }, contact: { param: 'mailto' }, limit: 'Metered, about 100 searches a day without a key' },
    icite: { name: 'NIH iCite', base: 'https://icite.od.nih.gov/api', cors: true, rpm: 60, ttlH: 168 },
    unpaywall: { name: 'Unpaywall', base: 'https://api.unpaywall.org/v2', cors: true, rpm: 120, day: 90000, ttlH: 168, contact: { param: 'email' }, limit: '100,000 per day, email required' },
    biorxiv: { name: 'bioRxiv and medRxiv', base: 'https://api.biorxiv.org', cors: true, rpm: 60, ttlH: 12 },
    doaj: { name: 'DOAJ', base: 'https://doaj.org/api', cors: true, rpm: 60, ttlH: 168 },
    zenodo: { name: 'Zenodo', base: 'https://zenodo.org/api', cors: true, rpm: 30, ttlH: 72, limit: '60 searches per minute' },
    rxnav: { name: 'RxNorm (RxNav)', base: 'https://rxnav.nlm.nih.gov/REST', cors: true, rpm: 300, burst: 5, ttlH: 168, limit: '20 per second' },
    fedreg: { name: 'Federal Register', base: 'https://www.federalregister.gov/api/v1', cors: true, rpm: 60, ttlH: 12 },
    gdelt: { name: 'GDELT news', base: 'https://api.gdeltproject.org/api/v2', cors: false, rpm: 8, burst: 1, conc: 1, ttlH: 6, timeoutS: 60, limit: 'One request every 5 seconds; heavily throttled, so proxy only' },
    cmsdata: { name: 'CMS data.cms.gov', base: 'https://data.cms.gov/data-api/v1', cors: true, rpm: 60, burst: 4, conc: 2, ttlH: 168 },
    openpayments: { name: 'CMS Open Payments', base: 'https://openpaymentsdata.cms.gov/api/1', cors: true, rpm: 60, ttlH: 168 },
    ror: { name: 'ROR', base: 'https://api.ror.org/v2', cors: true, rpm: 60, ttlH: 720 },
    orcid: { name: 'ORCID', base: 'https://pub.orcid.org/v3.0', cors: true, rpm: 60, ttlH: 168 },
    isrctn: { name: 'ISRCTN', base: 'https://www.isrctn.com/api', cors: true, rpm: 30, ttlH: 72 },
    secdata: { name: 'SEC EDGAR data', base: 'https://data.sec.gov', cors: false, rpm: 300, burst: 5, ttlH: 12, limit: '10 per second, declared User-Agent required' },
    secfts: { name: 'SEC EDGAR full-text search', base: 'https://efts.sec.gov/LATEST', cors: false, rpm: 120, ttlH: 12, limit: '10 per second, declared User-Agent required' },
    secarchives: { name: 'SEC EDGAR filings', base: 'https://www.sec.gov/Archives/edgar', cors: false, rpm: 120, burst: 3, conc: 2, ttlH: 720, accept: 'text/html', limit: '10 per second, declared User-Agent required' },
    secfiles: { name: 'SEC company list', base: 'https://www.sec.gov/files', cors: false, rpm: 60, ttlH: 168, limit: '10 per second, declared User-Agent required' },
    ema: { name: 'EMA medicines data', base: 'https://www.ema.europa.eu/en/documents/report', cors: false, rpm: 6, burst: 1, conc: 1, ttlH: 12, limit: 'Data files updated twice a day; paced to one file every 10 seconds' },
    fdamedia: { name: 'FDA data files (Orange Book)', base: 'https://www.fda.gov/media', cors: false, rpm: 6, burst: 1, conc: 1, ttlH: 168, accept: 'application/zip', limit: 'Monthly data files' },
    dailymed: { name: 'DailyMed', base: 'https://dailymed.nlm.nih.gov/dailymed/services/v2', cors: false, rpm: 60, ttlH: 12 },
    npi: { name: 'NPPES NPI Registry', base: 'https://npiregistry.cms.hhs.gov/api', cors: false, rpm: 60, ttlH: 168 },
    cmsprovider: { name: 'CMS Care Compare (clinicians)', base: 'https://data.cms.gov/provider-data/api/1', cors: false, rpm: 60, burst: 2, ttlH: 168, limit: 'Doctors and Clinicians national file, refreshed monthly; no CORS header, so relayed' },
    reporter: { name: 'NIH RePORTER', base: 'https://api.reporter.nih.gov/v2', cors: false, rpm: 50, burst: 1, conc: 1, ttlH: 168, post: 'body', limit: 'About one request per second; searches are POST only and send no CORS header, so relayed' },
    cmscoverage: { name: 'CMS Coverage (MCD)', base: 'https://api.coverage.cms.gov/v1', cors: false, rpm: 60, ttlH: 168 },
    pubtator: { name: 'PubTator3', base: 'https://www.ncbi.nlm.nih.gov/research/pubtator3-api', cors: false, rpm: 120, ttlH: 168, limit: '3 per second' },
    s2: { name: 'Semantic Scholar', base: 'https://api.semanticscholar.org/graph/v1', cors: false, rpm: 30, rpmKeyed: 60, ttlH: 168, key: { env: 'S2_API_KEY', header: 'x-api-key' }, limit: 'Shared anonymous pool; 1 per second with a key' }
  };
  /* Which source a public URL belongs to, and the path below that source's base. Longest base wins. */
  var ORDER = Object.keys(SOURCES).sort(function (a, b) { return SOURCES[b].base.length - SOURCES[a].base.length; });
  function match(url) {
    for (var i = 0; i < ORDER.length; i++) {
      var k = ORDER[i], base = SOURCES[k].base, next = url.charAt(base.length);
      if (url.indexOf(base) === 0 && (next === '' || next === '/' || next === '?')) return { key: k, path: url.slice(base.length) || '/' };
    }
    return null;
  }
  var api = { SOURCES: SOURCES, match: match };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.MIP_SOURCES = api;
})(this);
