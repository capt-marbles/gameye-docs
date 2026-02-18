// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import starlightOpenAPI, { createOpenAPISidebarGroup } from 'starlight-openapi';
import { legacyRedirects } from './redirects/legacy-redirects.mjs';

const canonicalOpenAPISidebarGroup = createOpenAPISidebarGroup();

// https://astro.build/config
export default defineConfig({
  site: 'https://docs.gameye.com',
  trailingSlash: 'never',
  redirects: legacyRedirects,
  integrations: [
    starlight({
      title: 'Gameye Docs',
      description:
        'Technical documentation for Gameye orchestration, deployment policies, API workflows, and operations.',
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/capt-marbles/gameye-docs' },
        { icon: 'external', label: 'Gameye Website', href: 'https://gameye.com' },
      ],
      pagefind: true,
      editLink: {
        baseUrl: 'https://github.com/capt-marbles/gameye-docs/edit/main/',
      },
      lastUpdated: true,
      plugins: [
        starlightOpenAPI([
          {
            base: 'api/reference',
            schema: './schemas/openapi/gameye-session-api-v1.yaml',
            sidebar: {
              label: 'Canonical OpenAPI (v1)',
              group: canonicalOpenAPISidebarGroup,
              operations: {
                badges: true,
                labels: 'summary',
                sort: 'document',
              },
              tags: {
                sort: 'document',
              },
            },
          },
        ]),
      ],
      sidebar: [
        {
          label: 'Getting Started',
          autogenerate: { directory: 'getting-started' },
        },
        {
          label: 'Guides',
          autogenerate: { directory: 'guides' },
        },
        {
          label: 'API',
          items: [
            { label: 'API Overview', slug: 'api' },
            { label: 'Authentication', slug: 'api/authentication' },
            { label: 'Session Lifecycle', slug: 'api/session-lifecycle' },
            { label: 'Session Management', slug: 'api/session-management' },
            { label: 'Open API Spec', slug: 'api/open-api-spec' },
            { label: 'OpenAPI Versioning Flow', slug: 'api/versioning-and-openapi-flow' },
            canonicalOpenAPISidebarGroup,
          ],
        },
        {
          label: 'FAQ',
          autogenerate: { directory: 'faq' },
        },
        {
          label: 'Troubleshooting',
          autogenerate: { directory: 'troubleshooting' },
        },
        {
          label: 'Changelog',
          autogenerate: { directory: 'changelog' },
        },
      ],
      head: [
        {
          tag: 'meta',
          attrs: {
            name: 'robots',
            content: 'index,follow',
          },
        },
        {
          tag: 'meta',
          attrs: {
            property: 'og:site_name',
            content: 'Gameye Docs',
          },
        },
      ],
    }),
  ],
});
