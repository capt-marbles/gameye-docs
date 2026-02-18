// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import { legacyRedirects } from './redirects/legacy-redirects.mjs';

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
          autogenerate: { directory: 'api' },
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
