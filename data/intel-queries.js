/* =========================================================
   Intel job configuration, read by jobs/fetch-intel.mjs
   The assets and indications the job watches are not listed here: it takes every asset and indication of every
   therapeutic area in js/catalog.js (with the reviewed updates applied), and the app shows each user the records about
   their own watchlist. Names searched and matched come from each catalog entry: US brand, other brand names, INN, development codes.

   INTEL_FEEDS  regulator newsrooms (RSS or Atom). Every item whose title or summary names a catalog asset, or whose
                title names a catalog indication, is kept with its title, date, link and the feed's own summary.
                Items naming an asset are also read for milestones. Reuse terms: FDA pages are US government works
                (public domain); EMA allows reuse with the source acknowledged; GOV.UK is under the Open Government
                Licence v3.0. The app names the agency and links every item to its page.
       id       stable key, stored with each item
       agency   the regulator, as shown
       region   US, EU or GB: which profile countries see it (COUNTRIES[].regions in js/app/core.js)
       kind     news or safety (safety items also show on Safety Signals)
       strip    optional pattern removed from the start of titles (feed boilerplate)
   INTEL_TRADE_FEEDS  pharma trade-press feeds (RSS). An item whose headline or summary names a catalog asset joins the
                news headlines with its publication named; the headline and link are kept, the summary only until the
                item is labelled. Most of these feeds hold one to three days of items, so they are read every hour.
       id       stable key       name  the publication, as shown with each item
       tier     strong (the drug is usually named in the headline) or supporting (the company leads the headline and
                the drug is in the summary)
   INTEL_HTA_AGENCIES  HTA bodies the extraction may name, with the country each one belongs to (COUNTRIES in
                js/app/core.js).
   Edit here; the job picks the change up on its next run.
   ========================================================= */
(function (root) {
  'use strict';
  var INTEL_FEEDS = [
    { id: 'fda-press', agency: 'FDA', region: 'US', kind: 'news', name: 'FDA press announcements', url: 'https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/press-releases/rss.xml' },
    { id: 'fda-medwatch', agency: 'FDA', region: 'US', kind: 'safety', name: 'FDA MedWatch safety alerts', url: 'https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/medwatch/rss.xml' },
    { id: 'ema-news', agency: 'EMA', region: 'EU', kind: 'news', name: 'EMA news and press releases', url: 'https://www.ema.europa.eu/en/news.xml' },
    { id: 'ema-opinions', agency: 'EMA', region: 'EU', kind: 'news', name: 'EMA new medicines (CHMP opinions)', url: 'https://www.ema.europa.eu/en/new-human-medicine-new.xml', strip: '^Human medicines European public assessment report \\(EPAR\\):\\s*' },
    { id: 'ema-withdrawn', agency: 'EMA', region: 'EU', kind: 'news', name: 'EMA withdrawn applications', url: 'https://www.ema.europa.eu/en/withdrawn-applications.xml', strip: '^Human medicines European public assessment report \\(EPAR\\):\\s*' },
    { id: 'mhra-news', agency: 'MHRA', region: 'GB', kind: 'news', name: 'MHRA news and communications (GOV.UK)', url: 'https://www.gov.uk/search/news-and-communications.atom?organisations%5B%5D=medicines-and-healthcare-products-regulatory-agency' },
    { id: 'mhra-dsu', agency: 'MHRA', region: 'GB', kind: 'safety', name: 'MHRA Drug Safety Update (GOV.UK)', url: 'https://www.gov.uk/drug-safety-update.atom' }
  ];
  var INTEL_TRADE_FEEDS = [
    { id: 'hcplive', tier: 'strong', name: 'HCPLive', url: 'https://www.hcplive.com/rss' },
    { id: 'onclive', tier: 'strong', name: 'OncLive', url: 'https://www.onclive.com/rss' },
    { id: 'targetedonc', tier: 'strong', name: 'Targeted Oncology', url: 'https://www.targetedonc.com/rss' },
    { id: 'ajmc', tier: 'strong', name: 'AJMC', url: 'https://www.ajmc.com/rss' },
    { id: 'pharmtech', tier: 'strong', name: 'Pharmaceutical Technology', url: 'https://www.pharmaceutical-technology.com/feed/' },
    { id: 'ctarena', tier: 'strong', name: 'Clinical Trials Arena', url: 'https://www.clinicaltrialsarena.com/feed/' },
    { id: 'pharmaphorum', tier: 'strong', name: 'pharmaphorum', url: 'https://pharmaphorum.com/rssfeed/news-and-features' },
    { id: 'pmlive', tier: 'strong', name: 'PMLive', url: 'https://pmlive.com/feed/' },
    { id: 'endpoints', tier: 'supporting', name: 'Endpoints News', url: 'https://endpoints.news/feed/' },
    { id: 'biopharmadive', tier: 'supporting', name: 'BioPharma Dive', url: 'https://www.biopharmadive.com/feeds/news/' },
    { id: 'pharmavoice', tier: 'supporting', name: 'PharmaVoice', url: 'https://www.pharmavoice.com/feeds/news/' },
    { id: 'pharmexec', tier: 'supporting', name: 'Pharmaceutical Executive', url: 'https://www.pharmexec.com/rss' },
    { id: 'mhe', tier: 'supporting', name: 'Managed Healthcare Executive', url: 'https://www.managedhealthcareexecutive.com/rss' },
    { id: 'pharmatimes', tier: 'supporting', name: 'PharmaTimes', url: 'https://pharmatimes.com/feed/' }
  ];
  var INTEL_HTA_AGENCIES = { NICE: 'GB', SMC: 'GB', AWTTC: 'GB', 'CDA-AMC': 'CA', INESSS: 'CA', 'G-BA': 'DE', IQWiG: 'DE', HAS: 'FR', AIFA: 'IT', AEMPS: 'ES', PBAC: 'AU', ICER: 'US', CMS: 'US', C2H: 'JP' };
  var api = { INTEL_FEEDS: INTEL_FEEDS, INTEL_TRADE_FEEDS: INTEL_TRADE_FEEDS, INTEL_HTA_AGENCIES: INTEL_HTA_AGENCIES };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.MIP_INTEL_QUERIES = api;
})(this);
