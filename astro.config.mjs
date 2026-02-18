// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// https://astro.build/config
export default defineConfig({
  site: 'https://docs.gameye.com',
  trailingSlash: 'never',
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
      sidebar: [
        {
          label: 'Getting Started',
          items: [
            { label: 'Overview', slug: 'getting-started' },
            { label: 'Quickstart', slug: 'getting-started/quickstart' },
          ],
        },
        {
          label: 'Guides',
          items: [
            { label: 'Migration from Archbee', slug: 'guides/migration-from-archbee' },
            { label: 'Versioning and Release Policy', slug: 'guides/versioning-and-release-policy' },
          ],
        },
        {
          label: 'API',
          items: [
            { label: 'API Overview', slug: 'api' },
            { label: 'Session Lifecycle', slug: 'api/session-lifecycle' },
          ],
        },
        {
          label: 'FAQ',
          items: [{ label: 'Frequently Asked Questions', slug: 'faq' }],
        },
        {
          label: 'Troubleshooting',
          items: [{ label: 'Operational Troubleshooting', slug: 'troubleshooting' }],
        },
        {
          label: 'Changelog',
          items: [
            { label: 'Changelog Index', slug: 'changelog' },
            { label: '2026-02-18 Scaffold Release', slug: 'changelog/2026-02-18-scaffold-release' },
          ],
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
