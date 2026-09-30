# bh-apps-fetch

Scheduled jobs that collect public pharma data once, for two apps:

- **MIP** (Medical Intelligence Platform, `bh-app-medintel`)
- **CPP** (Pharma Landscape 360, `bh-app-pharmlands.360`)

The jobs run in GitHub Actions on this public repo, so they cost no Actions minutes. They commit what they collect to `data/`, and GitHub Pages serves it. Both apps read the same files, so each source is called once rather than once per app or once per user.

Everything here comes from public sources: news headlines (GDELT), regulator newsrooms (FDA, EMA, MHRA), SEC filings, EMA data files, the FDA Orange Book, openFDA, ClinicalTrials.gov and Europe PMC. Nothing about a client, a user or a watchlist belongs in this repo. Watchlists live in each user's browser, and team-specific alert queries stay in MIP's private repo.

## What it publishes

| File | Written by | Refreshed | Read by |
|---|---|---|---|
| `data/intel.js` / `.json` | `jobs/fetch-intel.mjs` | Headlines and regulator items hourly; SEC filings and Gemini tagging and reading every 6 hours | MIP (`.js`), CPP activity feed (`.json`) |
| `data/regulatory.js` / `.json` | `jobs/fetch-regulatory.mjs` | Daily, 05:30 UTC | MIP; CPP (planned) |
| `data/revenue.js` / `.json` | `jobs/fetch-revenue.mjs` | Daily, 05:30 UTC | MIP; CPP (planned) |
| `data/catalog-updates.js` / `.json`, `data/catalog-review.js` | `jobs/review-catalog.mjs` | Every other day, 06:20 UTC | MIP |

Base URL: `https://do2blehelix.github.io/bh-apps-fetch/`. For example, `https://do2blehelix.github.io/bh-apps-fetch/data/intel.json`.

- **`.js` files** set a global (`window.MIP_INTEL` and so on), so a page can load them with `<script src>` from any site, and from a page opened as a local file.
- **`.json` files** hold the same data without the jobs' bookkeeping (document ledgers, queues, per-asset run times), for `fetch()`. GitHub Pages sends `Access-Control-Allow-Origin: *` and caches for 10 minutes.

## Shared configuration: edit it here

| File | What it is | Copies |
|---|---|---|
| `js/catalog.js` | Therapeutic areas, indications and assets (INN, brand, company, codes). Every job watches every asset in it. | MIP `js/catalog.js`, refreshed by MIP's `site.yml`; CPP `index.html` block 3, copied by hand |
| `js/intel-match.js` | How an asset or indication is recognised in a headline or feed item | MIP `js/intel-match.js` (browser and relay) |
| `data/intel-queries.js` | The regulator feeds and HTA agencies | MIP `data/intel-queries.js` (relay and dev proxy) |
| `js/sources.js` | Rate limits and cache lifetimes the jobs pace their calls with | This repo's own copy of MIP's registry |

Apps match records by asset id, so an asset id must never change. Add or correct entries; don't rename them. `data/catalog-updates.js` holds the changes the catalog review accepted, and `js/catalog.js` applies them when it loads, in the jobs and in the browser.

## Schedule

`.github/workflows/fetch.yml`, in UTC:

| When | What |
|---|---|
| Hourly at :05 | News headlines (GDELT) and regulator newsrooms, without the LLM. Each asset is searched again after `MIP_INTEL_NEWS_DUE_H` (12) hours. |
| 01:35, 07:35, 13:35, 19:35 | The full intel job: the above plus SEC filings, web search, and Gemini tagging and reading |
| 05:30 daily | Regulatory data and revenue. The same run also keeps the schedule enabled (see below). |
| 06:20 every other day | Catalog review, late in the Pacific day, on the Gemini quota the day has left |

**Running it by hand:** Actions > "Fetch — refresh the shared data" > Run workflow, then choose `news`, `intel`, `regulatory`, `revenue`, `catalog`, `all` or `json`.

**How each run works:**
- The runs share `~/.mip` (the disk cache, usage counters and Gemini model state) through the Actions cache.
- A run commits only when a file changed.
- A part that fails keeps its earlier data and says so in the file's `sources` entry.

**Keeping the schedule on:** GitHub switches off scheduled workflows in a public repo after 60 days without activity. The daily run re-enables the workflow to prevent that. If the schedule ever stops anyway, re-enable it on the Actions tab.

**Limits that remain.** Actions minutes are free here; the sources' limits are not:
- **GDELT:** one call every 5 seconds per IP address. Runners share IP addresses with other GitHub users, so some calls are refused (HTTP 429), and the assets not reached go first on the next run.
- **Gemini:** the free tier has a daily quota per model. The model ladder in `jobs/gemini.mjs` moves to the next model when one is used up.

## Setup

1. Settings > Pages > Build and deployment: Source "Deploy from a branch", branch `main`, folder `/ (root)`.
2. Settings > Secrets and variables > Actions, add:

   | Secret | Needed for |
   |---|---|
   | `LLM_API_KEY` | Headline tagging, document reading and the catalog review (a Gemini key; the free tier is enough) |
   | `MIP_CONTACT_EMAIL` | SEC filings and revenue. The SEC refuses calls without a declared contact. |
   | `OPENFDA_API_KEY`, `NCBI_API_KEY`, `OPENALEX_API_KEY` | Optional; they only raise rate limits |

   Without the secrets, the jobs still collect headlines, regulator items, EMA and Orange Book data.
3. Actions > run the workflow once with `all`.

Keep the workflow on `schedule` and `workflow_dispatch` triggers only. A `pull_request` trigger on a public repo is the usual way secrets leak.

## Running a job on your own machine

Node 18 or later. There are no dependencies to install.

```
node jobs/fetch-intel.mjs --only=feeds      # a quick check: regulator feeds only
node jobs/to-json.mjs                       # the .json twins
```

Settings go in `%USERPROFILE%\.mip\.env` (template: `jobs/env.example`). If MIP's dev proxy is running (`node proxy/server.mjs` in MIP), the jobs send their calls through it, so there is one rate limiter and one set of daily counts.

## The jobs

Moved from MIP's `proxy/` folder on 29 Sep 2026. MIP keeps its snapshot job, alerts job, dev proxy and relay. What the jobs write is described below, with the app pages that show it in MIP.

### Intel job

```
node jobs/fetch-intel.mjs                  run if the last run is older than 6 hours (MIP_INTEL_INTERVAL_MIN)
node jobs/fetch-intel.mjs --force         run now
node jobs/fetch-intel.mjs --only=news,sec run some parts: news, feeds, sec, tag, web, hta, extract
```

It writes `data/intel.js` (`window.MIP_INTEL`), loaded by the app like the snapshot. The job has no user watchlists (those live in each browser), so it watches every asset and indication of every therapeutic area in `js/catalog.js`, and the app shows each watchlist the records about its own watched assets (and, for regulator items, its indications in scope). The names it searches come from each catalog entry: US brand, INN, development codes. Indications are labelled with the ids of all areas merged, and `CAT.indsFromAll()` maps them to a watchlist's. The regulator feeds and HTA agencies are in `data/intel-queries.js`. It feeds the Milestones and regulatory dates panel and the news in Competitive Intel, Regulator news on Regulatory & Labels, regulator safety communications on Safety Signals, the Regulatory dates row of the Medical Strategy catalyst timeline, Coming up on the Command Center, HTA decisions on HEOR & Access and Guidelines & HTA, and the asset profiles. Its US filings and program stops also feed the pipeline landscape through the snapshot job.

**Where documents come from.** No LLM is involved in finding them.

- **GDELT DOC 2.0**: English headlines from the last 60 days that name a catalog asset, at most 20 per asset. GDELT is free for any use, commercial included, provided it is cited (the app links to it). The free plans of NewsAPI, GNews, NewsData.io and Currents, and the Google News RSS feed, all exclude commercial use, so they are not used. GDELT allows one call every 5 seconds, too slow for every asset in one run, so each run asks for the assets not covered in the last 20 hours, longest waiting first, several per query (up to 10 search words), each window starting where the asset's last answered query ended, so nothing is skipped when an asset waits a few days (the hourly runs here search each asset again after `MIP_INTEL_NEWS_DUE_H` hours, 12 in the workflow, as far as GDELT answers; MIP's relay also brings the open watchlist's newest headlines live). A call that fails or hangs (60-second timeout) is tried again after 10 and 30 seconds; HTTP 429 waits a minute once, and a second one ends the part, leaving the rest first in line for the next run. An asset whose headlines fill a whole answer (a big brand) is asked alone for the next month, so it cannot crowd out the others. `MIP_INTEL_NEWS_QUERIES` (24) caps the queries per run.
- **Regulator newsrooms** (`INTEL_FEEDS` in `data/intel-queries.js`): FDA press announcements and MedWatch safety alerts, EMA news, new-medicine opinions (CHMP) and withdrawn applications, MHRA news and Drug Safety Update (GOV.UK). Items whose title or summary names a catalog asset, or whose title names a catalog indication, are kept 180 days with their title, date, link and the feed's own summary; those naming an asset are also read for milestones. FDA pages are US government works, EMA allows reuse with the source acknowledged, and GOV.UK is under the Open Government Licence; the app names the agency and links each item. Add a feed by adding a line there.
- **SEC EDGAR full-text search**: 8-K and 6-K press-release exhibits filed by each asset's own sponsor (the catalog's sponsor pattern on the filer name), each asset once a day, oldest first, up to `MIP_INTEL_SEC_ASSETS` (80) assets a run: a year back the first time, then from its last search. The SEC refuses calls without a declared contact, so this part runs only when `MIP_CONTACT_EMAIL` is set. Sponsors that do not file with the SEC (LEO Pharma, Galderma, UCB and others) are covered by news, regulator feeds and web search only.
- **Google Search grounding**, when the key has it: once a week per asset, and every two weeks per marketed asset for HTA decisions, oldest first, the model searches the web and the job fetches the pages it cites. The model's own answer is not used. On the free tier only `gemini-2.5-flash` and `gemini-2.5-flash-lite` offer grounding (500 requests a day, shared), and Google limits 2.5 models to keys that used them before, so a new key usually cannot search. The Data sources page says so.

**What the LLM does.** It labels each new headline (which asset, which kind of news, which indication; an asset label stands only if the headline names the asset), and it reads each filing, article and page once, listing the milestones or HTA decisions it reports. Each item must carry a sentence copied from the document. The job drops an item when that sentence is not in the fetched text, the asset is not named, the indication is not in the document, a past event postdates its document or is more than 13 months older, or an expected date had already lapsed. Expected dates drop off once the matching event is reported, or 60 days after they pass. Each document is read once (the ledger in `data/intel.js`), so daily use is the new documents only.

**Free-tier quotas and the model ladder** (`jobs/gemini.mjs`). Gemini's free tier limits requests per minute and per day per model, and daily counts reset at midnight Pacific time. The job builds a ladder from the models the key can see (ListModels), newest Flash models first for reading, Flash-Lite first for labelling, then Pro, previews and Gemma. A model that hits its per-minute limit cools down for the delay the API gives and the call moves to the next model. A model that has used its day, has no free quota or is not available to the key is skipped until the next Pacific day. `~/.mip/llm-state.json` (kept in the Actions cache) remembers this between runs. When every model is spent, the rest of the queue waits for the next run. `LLM_MODELS=a,b,c` replaces the ladder.

Settings (all optional except the key): `LLM_API_KEY` (or `GEMINI_API_KEY`), `LLM_MODELS`, `LLM_SEARCH_MODELS`, `LLM_MIN_GAP_MS` (pause between calls to one model, default 4500), `MIP_INTEL_INTERVAL_MIN` (360), `MIP_INTEL_MAX_MIN` (LLM minutes per run, 12), `MIP_INTEL_MAX_DOCS` (documents read per run, 30), `MIP_INTEL_SEC_BACKFILL_DAYS` (365), `MIP_INTEL_NEWS_QUERIES` (GDELT queries per run, 24), `MIP_INTEL_SEC_ASSETS` (assets searched on EDGAR per run, 80). Without a key the job still collects headlines, regulator items and filings; the documents wait in the queue.

### Catalog review

```
node jobs/review-catalog.mjs                 run if the last run is older than 36 hours (MIP_CATALOG_INTERVAL_H)
node jobs/review-catalog.mjs --force         run now
node jobs/review-catalog.mjs --ta=IDERM      limit the audit and discovery to some therapeutic areas
node jobs/review-catalog.mjs --only=review   run some parts: review, audit, discover, inds
node jobs/review-catalog.mjs --dry           print what it would do, write nothing
```

It keeps the catalog's product, indication and therapeutic-area mappings (`js/catalog.js`) correct and current. It adds and corrects; it never deletes.

**What it may change.** An asset's US brand, company, mechanism or route; a missing development code; an asset's indications within an area; a new asset in an area (a drug found in the area's recent industry trials of any phase: named in a trial title and listed in two trials, or in one trial of a company the area already tracks; or an asset of another area that is also studied here; discovery stops in an area that lists `MIP_CATALOG_AREA_CAP` assets, 60); a new indication in an area (a condition that several of the area's drugs are in trials for and that no indication of any area covers). Ids, names and the query fields of existing entries are never changed. A link that looks wrong is not removed: once confirmed it is listed under "Needs a person" on the Data sources page.

**Evidence.** Current US labels (openFDA, NDA and BLA only), the industry trials on ClinicalTrials.gov (the newest Phase 2 and 3, then the newest Phase 1) and, for assets without a label, two Europe PMC abstracts. No LLM is involved in finding it, and it is fetched again for every review.

**Three reviews before anything changes.** A proposal comes from a rule (a label or the company's own current trial names an indication the asset lacks; every label of the product gives a different route; an asset without a brand has exactly one) or from an LLM audit of each asset against its evidence, which must quote the evidence; the job checks the quote is there and names the proposed value. Each proposal is then reviewed three times, at most once per run, so a change takes at least three runs: **verify** (does the evidence state it?), **challenge** (look for a reason it is wrong: another formulation or company, a comparator arm, an old trial, a rewording) and **blind** (the question asked without the proposal; the answer must match it). Every accept must quote the evidence, and the quote is checked. One reject ends a proposal and holds it back for 180 days; two "unsure" answers end it too. The three accepts must come from at least two different models. Then the change is appended to `data/catalog-updates.js`, which `js/catalog.js` applies when it loads, in the browser and in the snapshot job. A change is skipped when a person has since edited the value it corrects, so hand edits to `js/catalog.js` always win.

**What users see.** Saved watchlists are not touched: a new asset or indication appears in Watchlist but is not watched until the user picks it. The asset profile lists what the review changed, and Data sources shows the changes applied, the proposals under review and the links for a person (`data/catalog-review.js`). `data/catalog-review-ledger.json` holds the job's own state: when each asset was last audited, the rejections on hold and condition counts.

**Budget.** It shares the Gemini key and its free quota with the intel job. Its reviews and audits go through the same ladder, asking a different model for each review where one is available. It runs every other day at 06:20 UTC, late in the Pacific day, on what the day's quota has left, and stops if the Pacific day ends mid-run, so the new day's quota stays with the intel job. Each run is capped at `MIP_CATALOG_MAX_CALLS` LLM calls (36) and `MIP_CATALOG_MAX_MIN` minutes (15): reviews first, then audits (each asset every `MIP_CATALOG_RECHECK_DAYS`, 90), then discovery (one area per run, each area every 30 days), then new indications. Audits and discovery pause while 60 proposals are waiting. The first pass over all 435 assets takes a few weeks; after that most runs only review.

### Regulatory data job

```
node jobs/fetch-regulatory.mjs              reuse answers cached within each source's lifetime (EMA 12 h, Orange Book 7 days)
node jobs/fetch-regulatory.mjs --force      fetch again
node jobs/fetch-regulatory.mjs --only=ema   one part: ema (with ema_post) or ob
```

Writes `data/regulatory.js` for every asset in the catalog, whatever the watchlist; the app loads it when a panel needs it. No key needed.

- **EMA** (`ema`, `ema_post`): the EMA's Medicines and Post-authorisation procedures data files (JSON, updated twice a day), matched to catalog assets by INN. Each entry keeps its status, CHMP opinion, authorisation and latest Commission decision dates, flags, generic and biosimilar flags, and the catalog indications its EU indication text names. An EU medicine with the asset's US brand name, or naming one of its indications, is the asset's own; the others are copies or the same molecule in another use.
- **Orange Book** (`ob`): the FDA data files (zip, monthly). For each catalog US brand: its NDAs, the patents listed against them (expiry and whether they claim the substance, the product or a use), the exclusivities, and the ANDAs of the same ingredient, dosage form and route. Expired entries are dropped a year after they lapse.

A part that fails keeps its earlier values and is marked in `sources`, which the Data sources page and its error log show.

### Revenue job

```
node jobs/fetch-revenue.mjs                 companies checked in the last 20 hours are skipped
node jobs/fetch-revenue.mjs --force         check every company again
MIP_REVENUE_TA=IDERM node jobs/fetch-revenue.mjs   only one area's companies (testing; those filings are read again in a full run)
```

Writes `data/revenue.js`: net revenue by brand as the companies tag it in the inline XBRL of their 10-K, 10-Q or 20-F. The catalog's companies are matched to SEC registrants by name (`company_tickers.json`); for each, the latest annual report, the 10-Qs after it and the one before it are read, which hold eight quarters and three fiscal years. Revenue facts broken down by a product member that names a catalog brand are kept (a portfolio or segment grouping next to the product is allowed; a split by region or customer is not). A missing quarter is derived from the year-to-date facts and marked. Each filing is read once (the ledger in the file) and is not cached on disk; `MIP_REVENUE_MAX_FILINGS` (default 60) and `MIP_REVENUE_MAX_MIN` (default 12) cap a run. It needs `MIP_CONTACT_EMAIL`; without it, it writes nothing new and says so.
