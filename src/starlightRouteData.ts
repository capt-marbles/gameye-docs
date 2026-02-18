import { defineRouteMiddleware } from '@astrojs/starlight/route-data';

const DOCS_ORIGIN = 'https://docs.gameye.com';
const WEBSITE_ID = `${DOCS_ORIGIN}/#website`;
const ORGANIZATION_ID = 'https://gameye.com/#organization';
const FALLBACK_DESCRIPTION =
  'Technical documentation for Gameye orchestration, deployment policies, API workflows, and operations.';

function normalizePathname(pathname: string) {
  if (pathname === '/') return pathname;
  return pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
}

function upsertMeta(
  head: Array<{ tag: string; attrs?: Record<string, string | boolean | undefined>; content?: string }>,
  key: 'name' | 'property',
  value: string,
  content: string
) {
  const entry = head.find((item) => item.tag === 'meta' && item.attrs?.[key] === value);

  if (entry) {
    entry.attrs = {
      ...(entry.attrs ?? {}),
      content,
    };
    return;
  }

  head.push({
    tag: 'meta',
    attrs: {
      [key]: value,
      content,
    },
  });
}

function upsertCanonical(
  head: Array<{ tag: string; attrs?: Record<string, string | boolean | undefined>; content?: string }>,
  canonicalHref: string
) {
  const canonical = head.find((item) => item.tag === 'link' && item.attrs?.rel === 'canonical');

  if (canonical) {
    canonical.attrs = {
      ...(canonical.attrs ?? {}),
      rel: 'canonical',
      href: canonicalHref,
    };
    return;
  }

  head.push({
    tag: 'link',
    attrs: {
      rel: 'canonical',
      href: canonicalHref,
    },
  });
}

function upsertStructuredData(
  head: Array<{ tag: string; attrs?: Record<string, string | boolean | undefined>; content?: string }>,
  jsonLd: Record<string, unknown>
) {
  const entry = head.find(
    (item) => item.tag === 'script' && item.attrs?.id === 'gameye-docs-structured-data'
  );

  if (entry) {
    entry.attrs = {
      ...(entry.attrs ?? {}),
      id: 'gameye-docs-structured-data',
      type: 'application/ld+json',
    };
    entry.content = JSON.stringify(jsonLd);
    return;
  }

  head.push({
    tag: 'script',
    attrs: {
      id: 'gameye-docs-structured-data',
      type: 'application/ld+json',
    },
    content: JSON.stringify(jsonLd),
  });
}

function buildBreadcrumb(pathname: string, title: string) {
  const segments = pathname.split('/').filter(Boolean);
  const items: Array<Record<string, unknown>> = [
    {
      '@type': 'ListItem',
      position: 1,
      name: 'Gameye Docs',
      item: `${DOCS_ORIGIN}/`,
    },
  ];

  if (segments.length === 0) {
    return {
      '@type': 'BreadcrumbList',
      itemListElement: items,
    };
  }

  let rollingPath = '';

  segments.forEach((segment, index) => {
    rollingPath += `/${segment}`;
    items.push({
      '@type': 'ListItem',
      position: index + 2,
      name: index === segments.length - 1 ? title : segment.replace(/-/g, ' '),
      item: `${DOCS_ORIGIN}${rollingPath}`,
    });
  });

  return {
    '@type': 'BreadcrumbList',
    itemListElement: items,
  };
}

export const onRequest = defineRouteMiddleware(async (context, next) => {
  await next();

  const route = context.locals.starlightRoute;
  const head = route.head;
  const title = route.entry.data.title;
  const description = route.entry.data.description ?? FALLBACK_DESCRIPTION;
  const pathname = normalizePathname(context.url.pathname);
  const canonicalHref = new URL(pathname, DOCS_ORIGIN).toString();
  const ogType = route.entry.data.template === 'splash' ? 'website' : 'article';

  upsertCanonical(head, canonicalHref);

  upsertMeta(head, 'name', 'description', description);
  upsertMeta(head, 'property', 'og:url', canonicalHref);
  upsertMeta(head, 'property', 'og:type', ogType);
  upsertMeta(head, 'property', 'og:description', description);
  upsertMeta(head, 'name', 'twitter:title', title);
  upsertMeta(head, 'name', 'twitter:description', description);
  upsertMeta(head, 'name', 'twitter:url', canonicalHref);

  if (route.lastUpdated instanceof Date && !Number.isNaN(route.lastUpdated.getTime())) {
    upsertMeta(head, 'property', 'article:modified_time', route.lastUpdated.toISOString());
  }

  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': ORGANIZATION_ID,
        name: 'Gameye',
        url: 'https://gameye.com',
        logo: {
          '@type': 'ImageObject',
          url: 'https://gameye.com/wp-content/uploads/2023/11/cropped-favicon.png',
        },
      },
      {
        '@type': 'WebSite',
        '@id': WEBSITE_ID,
        name: 'Gameye Docs',
        url: `${DOCS_ORIGIN}/`,
        inLanguage: route.lang,
        description: FALLBACK_DESCRIPTION,
        publisher: {
          '@id': ORGANIZATION_ID,
        },
        potentialAction: {
          '@type': 'SearchAction',
          target: {
            '@type': 'EntryPoint',
            urlTemplate: `${DOCS_ORIGIN}/search/?q={search_term_string}`,
          },
          'query-input': 'required name=search_term_string',
        },
      },
      {
        '@type': 'TechArticle',
        '@id': `${canonicalHref}#techarticle`,
        headline: title,
        description,
        inLanguage: route.lang,
        url: canonicalHref,
        isPartOf: {
          '@id': WEBSITE_ID,
        },
        mainEntityOfPage: {
          '@type': 'WebPage',
          '@id': `${canonicalHref}#webpage`,
        },
        author: {
          '@id': ORGANIZATION_ID,
        },
        publisher: {
          '@id': ORGANIZATION_ID,
        },
      },
      buildBreadcrumb(pathname, title),
    ],
  };

  upsertStructuredData(head, structuredData);
});
