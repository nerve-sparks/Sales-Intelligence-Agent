# Signal-sourcing test cases (ZoomInfo scoop/news replacement)

ZoomInfo exports stopped carrying scoop/intent/news fields, so `signal_extractor.py`'s
existing classification pipeline (`_extract_news_signals`, `_extract_scoop_signals`) has
nothing to read. These are every test run against candidate replacement sources, in order,
with real companies from the live database and real API responses - no mocked data. Kept as
a reference so the reasoning behind the final design (`app/services/serper_client.py`,
Serper.dev with a two-query pattern) doesn't have to be re-derived later.

## 1. Nexus Scraper - own homepage scrape + LLM extraction

**Source:** `app/services/nexus_scraper.py` (`SCRAPER_SERVICE_URL`/`SCRAPER_API_KEY`)
**Method:** Scrape each company's own `company_domain` homepage (markdown), then ask the LLM
to extract funding / AI-intent / leadership mentions.
**Companies:** 10 real companies with `company_domain` set (AvidXchange, Rover, QGenda,
Provenir, Judi, Strive Health, Ensora Health, Sharecare, Neptune Technology Group, BetterCloud)
**Result:** All 10 scraped successfully (status "done"). Signal hit rate was thin: AI-intent
found on 4/10, funding on 1/10 (and that one was suspect - Judi's homepage quoted a *different*
brand's funding announcement), leadership on 1/10.
**Verdict:** Rejected as the primary source. A homepage only shows what a company chooses to
advertise about itself *right now* - no dates, and most companies don't put funding/leadership
news on their homepage at all.

## 2. Nexus Scraper - Google search-results URL scrape

**Method:** Build a Google search URL per query (`google.com/search?q=...`) and scrape it.
**Company:** 21stcenturyvitamins.com, 3 queries (funding/investment/acquisition,
AI/ML/product launch, CEO/CTO/CFO leadership)
**Result:** All 3 failed. Raw error: `Page.goto: net::ERR_TIMED_OUT at
https://www.google.com/search?q=...` - the scraper's proxy (`103.48.71.170:83`) couldn't
reach Google at the network level.
**Verdict:** Rejected - not a query-design problem, a network/proxy-level failure against Google
specifically.

## 3. Nexus Scraper - Bing search-results URL scrape

**Method:** Same 3 queries, scraped via `bing.com/search?q=...` instead.
**Result:** Scraped successfully (status "done") but 100% irrelevant. A bare domain string with
no quotes or `site:` operator got tokenized as generic keywords - results were Wish.com,
Microsoft support pages, "on this day in history" sites. Zero results mentioned the actual
company.
**Verdict:** Rejected - confirms scraping a raw search-engine URL is brittle without careful
query engineering; Bing's snippet-only HTML dump gives no structured relevance signal to filter
on.

## 4. Google Custom Search JSON API (Programmable Search Engine)

**Method:** Investigated as the natural "real Google Search API" option.
**Result:** Dead end, confirmed via Google's own current policy (not assumption):
- New Programmable Search Engines (created 2026+) can no longer enable "search the entire
  web" - capped at a fixed list of up to 50 pre-configured domains, set once in the control
  panel, not adjustable per-query.
- The `siteSearch` parameter cannot be used to escape that cap for a restricted engine - it
  filters within the configured scope, not outside it.
- The entire Custom Search JSON API is being shut down January 1, 2027; some sources indicate
  it's no longer even open to new user signups.
**Verdict:** Rejected outright - doesn't scale to 500+ dynamically-varying company domains per
upload, and is on a countdown to full shutdown regardless.
**Sources:** [Programmable Search Engine Blog, Jan 2026](https://programmablesearchengine.googleblog.com/2026/01/updates-to-our-web-search-products.html),
[Google Kills Custom Search API on Jan 1, 2027](https://dev.to/nexgendata/google-kills-custom-search-api-on-jan-1-2027-you-have-9-months-1jg1)

## 5. SearchApi.io - combined engineered query

**Method:** `"{domain}" (funding OR acquisition OR merger OR raised OR "product launch" OR
"platform launch" OR appointed OR "named CEO" OR "named CFO" OR "named CTO" OR partnership OR
expansion OR investment) -site:{domain} -site:youtube.com -site:instagram.com
-site:facebook.com -site:amazon.com after:2024-01-01`
**Company:** 21stcenturyvitamins.com
**Result:** 7 results, 5 genuinely real and dated:
- Grant Avenue Capital Acquires 21st Century Healthcare (Business Wire, Jan 21 2026) - acquisition
- 21st Century Healthcare Appoints Katie Doyle to Board of Directors (Morningstar + Yahoo
  Finance, corroborated, "3 days ago") - leadership
- Direct-to-consumer e-commerce store launch (Knoxville News Sentinel, Jan 22 2026) - product
- "Full Fuel 365" sports-nutrition line launch (Newswire.com, Oct 8 2025) - product
2 results were noise: a ransomware leak-site listing (loosely matched "Investment") and a
generic "Best Supplement Brands in Malaysia" listicle.
**Verdict:** Strong result - quoting + OR-grouping + site exclusions + date filter works well
when the domain string is unique enough not to collide with anything else.

## 6. SearchApi.io - same query design, different company (collision case)

**Company:** provenir.com
**Result:** 6 of 10 results were an unrelated Australian meat/farm brand
(`provenir.com.au` - Austral Meat, Frontier Pets, Organic Feast, Mondo Doro, all Instagram/
Facebook posts). Quoting `"provenir.com"` did not stop Google from surfacing `.com.au` pages
that loosely reference the string. The remaining 4 results were thin (Tracxn company profiles,
LinkedIn bios) - no real funding/acquisition/leadership news actually surfaced.
**Verdict:** Real limitation exposed - a quoted domain string is not a guaranteed-unique
anchor when a shorter/more generic name collides with an unrelated business on a different
TLD.

## 7. Serper.dev free tier - same two-query design, quotes included

**Queries tested (against provenir.com):**
- Query 1 (news): `"provenir.com" funding acquisition appointed launched partnership
  -site:provenir.com after:2024-01-01`
- Query 2 (own site): `site:provenir.com (leadership OR careers OR platform OR partners OR
  announces)`
**Result:** Query 1 -> `400 {"message":"Query pattern not allowed for free accounts."}`.
Query 2 -> 200, 10 clean results (Careers, Platform, Leadership Team, Partners, Lewis Group
partnership announcement dated Jan 21 2026).
**Isolation test** (to find exactly what's blocked): plain keywords alone = 200; quoted phrase
alone = 400; `site:` alone = 200; `-site:` alone = 200; `after:` alone = 200. Confirmed the
`"..."` exact-phrase operator specifically is what free accounts can't use - nothing else.
**Verdict:** Query 2 (no quotes needed) works as-is. Query 1 needs a quotes-free rewrite for
the free tier, or a paid upgrade to restore quoting.

## 8. Serper.dev - no-quotes rewrite of Query 1

**Query:** `{domain} funding acquisition appointed launched partnership -site:{domain}
after:2024-01-01`
**Companies:**
- provenir.com -> 0 results (consistently, across repeat attempts). Safer failure mode than
  test #6's collision noise, but zero coverage for this company without quotes.
- 21stcenturyvitamins.com -> 10 results, actually richer than SearchApi.io's version - found
  an *additional* real signal not seen before: "Alantra advises 21st Century Healthcare on its
  sale to..." (Jan 23 2026, M&A advisory).
- sharecare.com -> 10 results, 8 genuinely about Sharecare's real $518M Altaris acquisition,
  corroborated across 6+ independent sources (FierceHealthcare, MobiHealthNews, Wikipedia,
  Altaris itself, Houlihan Lokey, Kirkland law firm).
**Verdict:** Core design is sound for companies with a reasonably unique name; generic-name
companies (Provenir) get silently zero-signal rather than wrong signal, which is an acceptable
degraded mode until paid-tier quoting is available.

## 9. Serper.dev - repeat-call consistency check

**Method:** Ran the *identical* Query 1 (21stcenturyvitamins.com, no quotes) 4 times
back-to-back, 2s apart.
**Result:** 10, 10, 0, 10 results. Same exact query, same params, status 200 every time - one
attempt in four came back spuriously empty.
**Cross-check:** Ran Query 2 (site-scoped) 4 times back-to-back on the same company -
10, 10, 10, 10. Zero flakiness.
**Verdict:** The flakiness is specific to Query 1's more complex query shape (multi-keyword +
exclusion + date filter), not a general Serper.dev reliability problem. Query 1 needs a
retry-on-empty before trusting a zero-result response.

## 10. `serper_client.py` - full module verification (final build)

Built with: `build_news_query()` / `build_site_query()` (query builders matching tests #8-9),
`search_news()` (auto-retries up to 2x on empty, per test #9's ~25% flake rate),
`is_relevant()` (domain-label/company-name match filter, guards against collision noise from
test #6 and generic drift), `quote_domain()` (built but inert until paid tier - see test #7).

**Live re-verification, 3 companies:**
| Company | News (raw -> relevant) | Site (raw -> relevant) |
|---|---|---|
| Provenir | 0 -> 0 (expected - free-tier quote gap) | 10 -> 10 |
| 21st Century Healthcare | 10 -> 10 (all real: acquisition, 2x leadership, M&A advisory) | 10 -> 10 |
| Sharecare | 10 -> 7 (filter correctly dropped 3 off-topic hits, e.g. a generic "Investors are looking for opportunities in healthcare" piece that never mentions Sharecare) | 10 -> 10 |

**Verdict:** Relevance filter is doing real, verified work (not a no-op) - it dropped genuine
noise on Sharecare without removing any real hits. Site query stayed perfect (10/10 relevant)
across every company tested. Module is ready to wire into the real pipeline.

---

## Design decision: LLM for signal classification

**Decided: no change needed from the existing pattern.** `llm_client.complete()` already tries
BridgeLLM first and only falls back to Ollama `qwen3:14b` on failure - that's exactly the
desired behavior, so the new Serper-sourced signal classification reuses `signal_llm.
classify_batch` / `signal_extractor.extract_signals` completely unchanged, with no Ollama-only
bypass. Clarification on the thinking-mode findings above, for the record: the hung/
unrecoverable "disable thinking" attempts (`chat_template_kwargs.enable_thinking:false`,
native `think:false`) were reproduced on *both* `qwen3.6:27b` and `qwen3:14b` - disabling
thinking isn't reliable on either - but that's now moot day-to-day since BridgeLLM is the
primary path and Ollama only gets hit when BridgeLLM itself fails.
