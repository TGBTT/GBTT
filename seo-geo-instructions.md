# Site SEO/GEO Instructions (2026)

Working spec for auditing and updating developer-hosted sites for AI search visibility (Gemini, ChatGPT, Perplexity, Claude) alongside traditional SEO. Use this as a checklist/prompt basis in Cursor — treat each section as a task to verify or implement.

---

## 0. Crawler Access (do this first — blocks everything else if wrong)

AI crawlers split into **search/citation** bots (feed answer engines and citations) and **training** bots (ingest for model weights). Blocking training does not automatically remove you from AI search — and blocking search bots is the real visibility foot-gun. Decide policy deliberately; never use a blanket `User-agent: * Disallow: /` that also hits citation bots.

### 0a. Search / citation bots — keep these allowed for AI visibility

- [ ] Check `robots.txt` at site root. Confirm these are **not** disallowed if you want AI citations / answer-engine visibility:
  - `OAI-SearchBot`, `ChatGPT-User` (OpenAI — ChatGPT search index and live user fetches)
  - `Claude-SearchBot`, `Claude-User` (Anthropic — Claude search indexing and live user fetches; distinct from `ClaudeBot`)
  - `PerplexityBot`, `Perplexity-User`
  - `Google-Extended` (Gemini Apps grounding / AI Mode control token — distinct from `Googlebot`; blocking does **not** affect classic Google Search rankings, but can affect Gemini grounding)

### 0b. Training bots — policy choice (allow for max AI surface area, or Disallow to opt out of training)

- [ ] Decide per site whether to allow or disallow training ingest. Document the choice. Common tokens:
  - `GPTBot` (OpenAI training)
  - `ClaudeBot` (Anthropic training — does **not** control Claude search; use `Claude-SearchBot` for that)
  - `Applebot-Extended` (Apple AI / Apple Intelligence training opt-out token)
  - `Bytespider` (ByteDance — often blocked at WAF if not targeting TikTok/Doubao surfaces; compliance with `robots.txt` has been historically uneven)

Max-visibility default: allow 0a + 0b. Visibility-without-training default: allow 0a, Disallow 0b (and still allow `Google-Extended` if Gemini grounding matters).

### 0c. Edge / logs / gated content

- [ ] If using Cloudflare or another CDN/WAF: check dashboard-level bot rules separately from `robots.txt` — Cloudflare's default config blocks AI bots at the edge even if `robots.txt` allows them.
- [ ] Check server/access logs for actual crawl activity from the above user agents. Prefer verifying source IPs against vendor-published ranges (OpenAI / Anthropic bot JSON) when available — User-Agent strings alone are spoofable.
- [ ] Confirm no important content is gated behind login, paywall, or interactive-only elements (modals, tabs that require JS click to reveal content).

## 1. Rendering & Indexing (GitHub Pages / static hosting)

- [ ] All pages are statically generated or pre-rendered (SSG) — no content that only appears after client-side JS execution. AI crawlers largely do not execute JS.
- [ ] Custom domain has HTTPS enforced.
- [ ] Explicit `<link rel="canonical">` on every page (avoid duplicate content across `.github.io` and custom domain).
- [ ] `sitemap.xml` present, current, and referenced in `robots.txt`.
- [ ] `robots.txt` and sitemap validated (no stale/broken URLs).

## 2. Icons & Link-Preview Images

Missing/incorrect icon tags are why some sites show a blank/generic square when shared or when found in Google's site listing. Cover both favicon (browser tab) and social/search preview images (link cards) — they're separate systems with separate requirements.

- [ ] `favicon.ico` (multi-size ICO, 16×16/32×32/48×48) at site root `/favicon.ico` — still the fallback browsers and some crawlers check by default even with no `<link>` tag.
- [ ] `<link rel="icon" href="/favicon.ico" sizes="any">` in `<head>`.
- [ ] PNG favicons for modern browsers/tab bars:
  - `<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">`
  - `<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">`
- [ ] `<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">` — used for iOS home-screen bookmarks and some link previews.
- [ ] `site.webmanifest` (or `manifest.json`) with `icons` array (192×192 and 512×512 minimum) — required for Android/Chrome "add to home screen" and PWA install icon. Reference it: `<link rel="manifest" href="/site.webmanifest">`.
- [ ] `theme-color` meta tag matching brand color: `<meta name="theme-color" content="#xxxxxx">`.

### 2a. og:image — this is the one most likely to be missing on your sites

This tag drives link-preview cards on iMessage, Slack, LinkedIn, Facebook, and WhatsApp. Google also uses `og:image` (alongside schema.org image markup) when choosing **Search / Discover thumbnails** — not Knowledge Panels. A missing or broken `og:image` is the most common cause of a blank/generic box on link share — separate issue from the favicon, and easy to have fixed one without the other.

Required tags, every page, in `<head>`:
```html
<meta property="og:title" content="Exact page title">
<meta property="og:description" content="1-2 sentence page summary">
<meta property="og:image" content="https://yourdomain.com/images/og/page-slug.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:url" content="https://yourdomain.com/page-slug">
<meta property="og:type" content="website">

<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="https://yourdomain.com/images/og/page-slug.png">

<meta name="robots" content="max-image-preview:large">
```

Checklist:
- [ ] `og:image` URL is **absolute** (`https://yourdomain.com/...`), never relative (`/images/og.png`) — relative paths silently fail on most crawlers.
- [ ] Image is a real JPG/PNG file, not SVG — most link-preview crawlers won't render SVG.
- [ ] Image is 1200×630px (standard OG / social ratio ~1.91:1) and under ~1MB. If Google Discover large thumbnails matter, prefer ≥1200px wide, ~16:9, and high enough resolution (Google guidance: >300,000 total pixels), plus `max-image-preview:large` as above.
- [ ] Also set `og:image:width` and `og:image:height` explicitly — some crawlers (notably older Facebook/LinkedIn scrapers) skip the image entirely without these.
- [ ] Every page/demo/app on the site gets **its own** `og:image` — not one sitewide default. For your demo showcase specifically, each vertical (venue booking, beekeeping, home-care, etc.) should have a distinct preview image showing that app, not a generic homepage graphic reused everywhere.
- [ ] Confirm the image file is actually present in the deployed build output — on GitHub Pages/static builds it's common for an `og-images/` folder to exist in source but not get copied into the publish directory.
- [ ] After fixing, force a re-scrape (previews are cached per-URL and won't update on their own):
  - Facebook Sharing Debugger — paste URL, click "Scrape Again"
  - LinkedIn Post Inspector — same, forces LinkedIn's cache to refresh
  - X / Twitter Card tools if available (validators have been flaky/deprecated at times — treat as secondary)
  - iMessage/WhatsApp previews are the hardest to force-refresh — may just need time, or a version-tagged image URL (`og-image.png?v=2`) to bust the cache.
- [ ] Test actual rendering, not just tag presence — code inspection alone misses broken paths:
  - Google: search `site:yourdomain.com` and check the favicon shown next to the listing (can take time to update/recrawl).
  - Rich Results Test / URL Inspection in Google Search Console for favicon eligibility issues (Google has specific size/squareness rules for favicons to show in search results — non-square or too-small icons get dropped).
  - Facebook Sharing Debugger and LinkedIn Post Inspector for OG image previews (also force a re-scrape if a stale/blank preview was cached from before the fix).

## 3. llms.txt

- [ ] Publish `/llms.txt` at domain root. Emerging convention (optional navigation aid for LLMs — **not** access control, **not** a confirmed ranking/citation factor; adoption and crawler fetch rates are still low). Plain-text/Markdown file pointing AI systems to your most important, cleanest pages. Structure:
  - Site/brand name + one-line description
  - Links to key pages (services, demos, about, contact) with a one-line description each
  - Optional: link to a clean Markdown version of long-form pages if the HTML is heavy
- [ ] Align linked paths with what `robots.txt` actually allows — listing a URL in `llms.txt` does nothing if the bot is blocked.
- [ ] Do not rely on any auto-generated default `llms.txt` from a host/platform — it'll be generic and indistinguishable from competitors. Write it manually per site.

## 4. Structured Data (JSON-LD)

- [ ] `Organization` schema on homepage (name, URL, logo, social profiles, legal name).
- [ ] `SoftwareApplication` schema for each app/demo/tool hosted on the site.
- [ ] `LocalBusiness` + `Service` + `GeoCoordinates` schema for any local-business client sites — one distinct page per service and per location, not a single combined page.
- [ ] `FAQPage` schema for FAQ content — each answer must be a complete, standalone response (no "see above").
- [ ] `HowTo` schema for any procedural/step content.
- [ ] `Person`/portfolio schema where relevant for personal sites.

## 5. Content Strategy

- [ ] Audit existing pages: flag anything that's generic "how-to"/boilerplate rehashing content available elsewhere. Deprioritize or cut.
- [ ] For content to keep or add, it must include at least one of: proprietary data, a working first-party tool/calculator/demo, a real case study, or a distinct expert take not found elsewhere.
- [ ] Reformat content for extraction:
  - Lead each section with a direct, standalone answer (1–2 sentences) before supporting detail.
  - Clean heading hierarchy (H1 → H2 → H3), one topic per section.
  - Use tables, numbered steps, and bullet lists over long prose blocks.
  - Phrase key headings as actual questions where natural.
- [ ] Add a freshness/update pass cadence for evergreen pages — stale pages lose ground to recently updated ones in AI retrieval.

## 6. Local Business Client Sites (if applicable)

- [ ] Website structure mirrors the client's Google Business Profile exactly — matching service names, categories, and locations.
- [ ] For multi-service and/or multi-location clients: one dedicated page per service × per location (no combined "services" list page). Single-location / single-service sites can keep a simpler structure.
- [ ] Copy explicitly names specific services and outcomes matching how customers phrase reviews/prompts (e.g., "emergency tankless water heater repair in [City]") — pull language directly from real reviews where possible.
- [ ] `LocalBusiness`/`Service`/`GeoCoordinates` schema implemented in the static build, not injected client-side only.

## 7. Off-Site Authority (not on-page, but required)

- [ ] Identify opportunities for mentions in other authoritative sites/publications, relevant directories, and (where applicable) Wikipedia/Wikidata — brand-mention frequency across the web correlates with AI citation frequency.
- [ ] Maintain accurate, consistent brand info across all external profiles (name, description, links) — inconsistency undermines entity matching.

## 8. Branded Demand / Diversification

- [ ] Track branded search volume (client name / app name searches) as a KPI, not just generic keyword rank.
- [ ] Maintain at least one non-search channel per client (YouTube, social, email list) so visibility isn't 100% dependent on any single engine.

## 9. Measurement

- [ ] Set up manual or tool-based tracking of AI citations — Search Console does not capture this. Periodically query ChatGPT, Perplexity, Gemini, and Claude with real target prompts and log which pages/competitors get cited.
- [ ] Track AI bot crawl activity in server logs over time, separate from human traffic.

---

**Priority order if doing this incrementally:** Section 0 → 1 → 2 → 4 → 3 → 5 → 6/7/8 → 9. Access, rendering, and icon fixes are quick wins with immediate visible payoff; content/schema work is higher effort. Both are wasted if crawlers can't reach the site at all (Section 0).
