# Gameye Docs (Starlight)

Documentation scaffold for `docs.gameye.com`, built with Astro + Starlight.

## Scope (GAM-14 to GAM-18)

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

## Repository Conventions

- Content lives in `/src/content/docs`.
- Every docs release should include a changelog entry under `/src/content/docs/changelog`.
- Future version namespaces:
  - current default: `/...`
  - future major: `/v2/...`
  - archived major: `/v1/...`
