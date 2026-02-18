# Gameye Docs (Starlight)

Documentation scaffold for `docs.gameye.com`, built with Astro + Starlight.

## Scope (GAM-14 + GAM-15)

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

## Local Development

```bash
npm install
npm run dev
```

Open `http://localhost:4321`.

## Production Build

```bash
npm run build
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

## Repository Conventions

- Content lives in `/src/content/docs`.
- Every docs release should include a changelog entry under `/src/content/docs/changelog`.
- Future version namespaces:
  - current default: `/...`
  - future major: `/v2/...`
  - archived major: `/v1/...`
