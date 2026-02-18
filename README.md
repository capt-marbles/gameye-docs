# Gameye Docs (Starlight)

Documentation scaffold for `docs.gameye.com`, built with Astro + Starlight.

## Scope (GAM-14 to GAM-22)

- Starlight docs app scaffolded and runnable locally.
- Top-level information architecture implemented:
  - Getting Started
  - Guides
  - API
  - FAQ
  - Troubleshooting
  - Changelog
- URL governance aligned with GAM-8:
  - lowercase, hyphenated slugs
  - one canonical path per page
  - `trailingSlash: 'never'`
- Search and metadata defaults enabled:
  - Pagefind indexing
  - sitemap generation
  - default robots and Open Graph site metadata
- CI build workflow with preview artifact upload.
- Legacy docs migration + URL normalization pipeline:
  - pulls live legacy sitemap from `docs.gameye.com`
  - generates canonical route mappings + redirect rules
  - writes migrated MDX pages into Starlight section folders
  - emits migration CSV artifacts under `/migration`
- Canonical OpenAPI integration:
  - syncs versioned OpenAPI schema artifacts into `schemas/openapi` and `public/openapi`
  - generates `/api/reference` from the canonical schema via `starlight-openapi`
  - supports future versioned reference mounts (e.g. `/api/v2/reference`)
- Docs search UX + SEO hardening:
  - enhanced search modal with shortcut guidance, quick query chips, and direct links
  - supports `/` keyboard shortcut to open docs search quickly
  - dynamic route metadata middleware adds twitter metadata and JSON-LD per page
  - canonical verification and SEO assertions via `npm run check:seo`
- Docs quality sweep:
  - removed duplicate and placeholder docs pages and redirected them to canonical routes
  - stale migration boilerplate removed from docs content pages
  - writing and publishing standards page added under guides
  - docs quality assertions via `npm run check:quality`
- AI chatbot integration slice:
  - shared chatbot launcher included on docs pages
  - citation rendering + confidence-gated fallback routing
  - analytics event emission via `window.dataLayer`
- Unified navigation + cross-linking:
  - custom docs header includes shared global links to key `gameye.com` routes
  - docs entry pages include reciprocal links back to marketing paths
  - bidirectional navigation pattern aligns with the marketing site header/footer docs links
- llms/sitemap/docs parity automation:
  - `public/llms.txt` published for AI-ingestion anchors
  - sitemap + llms + reciprocal link checks via `npm run check:parity`
  - CI gate added to prevent cross-site parity regressions

## AI Chatbot Configuration

The docs site injects `/public/chatbot/chatbot-loader.js` through Starlight `head` config.

Environment variables:

- `PUBLIC_CHATBOT_ENABLED` (default: `true`)
- `PUBLIC_CHATBOT_API_ENDPOINT` (optional; if empty, local fallback knowledge mode is used)
- `PUBLIC_CHATBOT_MIN_CONFIDENCE` (default: `0.62`)

## Local Development

```bash
npm install
npm run dev
```

Open `http://localhost:4321`.

## Production Build

```bash
npm run build
npm run check:seo
npm run check:quality
npm run check:parity
npm run check:launch
npm run preview
```

## Legacy Migration Workflow

```bash
npm run migrate:archbee
```

Generated outputs:

- `/migration/gam-15-legacy-url-inventory.csv`
- `/migration/gam-15-url-normalization-map.csv`
- `/migration/gam-15-generation-results.csv`
- `/redirects/legacy-redirects.mjs`

## OpenAPI Sync Workflow

```bash
npm run sync:openapi
```

Generated outputs:

- `/schemas/openapi/gameye-session-api-v1.yaml`
- `/schemas/openapi/manifest.json`
- `/public/openapi/gameye-session-api-v1.yaml`
- `/public/openapi/openapi.yaml`

## SEO Verification Workflow

```bash
npm run build
npm run check:seo
```

Checks include:

- canonical URL presence and expected value per route
- required meta tags (`description`, Open Graph, Twitter)
- route-level JSON-LD script validation (`#gameye-docs-structured-data`)

## Docs Quality Workflow

```bash
npm run check:quality
```

Checks include:

- no untitled or placeholder pages
- no stale migration boilerplate text
- no duplicate doc titles
- minimum content depth for non-index pages

## Parity Workflow

```bash
npm run build
npm run check:parity
```

Checks include:

- required `llms.txt` URLs for docs + marketing cross-links
- sitemap coverage for docs home and canonical API reference
- reciprocal links in docs index/getting-started/api pages
- shared global links present in the custom docs header

## Launch Readiness Workflow (GAM-23)

```bash
npm run build
npm run check:launch
```

Checks include:

- broken internal links and missing asset references in built docs pages
- redirect validity across legacy + quality redirect maps (no self loops/chains, targets exist)
- required launch routes exist (`/` and `/api/reference`)
- chatbot analytics instrumentation and required event names

## Repository Conventions

- Content lives in `/src/content/docs`.
- Every docs release should include a changelog entry under `/src/content/docs/changelog`.
- Future version namespaces:
  - current default: `/...`
  - future major: `/v2/...`
  - archived major: `/v1/...`
