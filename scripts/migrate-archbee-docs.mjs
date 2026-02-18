#!/usr/bin/env node

import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const LEGACY_SITE = 'https://docs.gameye.com';
const NEXT_DATA_REGEX = /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/;
const GENERATED_MARKER = 'Legacy migration generated file.';
const GENERATED_MARKERS = [GENERATED_MARKER, '<!-- Legacy migration generated file -->'];
const RESERVED_INDEX_PATHS = new Set([
  '/',
  '/getting-started',
  '/guides',
  '/api',
  '/faq',
  '/troubleshooting',
  '/changelog',
]);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const docsRoot = path.join(projectRoot, 'src', 'content', 'docs');
const migrationDir = path.join(projectRoot, 'migration');
const redirectsFile = path.join(projectRoot, 'redirects', 'legacy-redirects.mjs');

const dateStamp = new Date().toISOString().slice(0, 10);

function normalizeKey(value) {
  return String(value || '')
    .replace(/^\/+|\/+$/g, '')
    .trim();
}

function isRandomPrefixedSlug(slug) {
  return /^[A-Za-z0-9]{4,5}-.+/.test(normalizeKey(slug));
}

function stripLegacyPrefix(segment) {
  const match = segment.match(/^([A-Za-z0-9]{4,5})-(.+)$/);
  if (!match) return segment;
  const [, token, remainder] = match;
  const looksGenerated = /[A-Z]/.test(token) || /\d/.test(token);
  if (!looksGenerated) return segment;
  if (!/[a-z]/.test(remainder)) return segment;
  return remainder;
}

function normalizeSlug(slug) {
  const clean = normalizeKey(slug);
  if (!clean) return '';

  return clean
    .split('/')
    .map((segment) => stripLegacyPrefix(segment))
    .map((segment) =>
      segment
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
    )
    .filter(Boolean)
    .join('/');
}

function inferSection(rootKey, slug) {
  const root = (rootKey || '').toLowerCase();
  const key = (slug || '').toLowerCase();

  if (root === 'getting-started') return 'getting-started';
  if (root === 'api' || root === 'untitled') return 'api';
  if (root === 'faqs') return 'faq';
  if (root === 'troubleshooting') return 'troubleshooting';
  if (root === 'changelogs') return 'changelog';
  if (['guides', 'support', 'glossary', '17ed-untitled', ''].includes(root)) return 'guides';

  if (/(api|session|location|log|artifact|auth|open-api|reference|error)/.test(key)) return 'api';
  if (/(troubleshoot|support|problem)/.test(key)) return 'troubleshooting';
  if (/(faq|how-do-i|is-gameye|difference-between)/.test(key)) return 'faq';
  if (/changelog/.test(key)) return 'changelog';
  if (/getting-started|docker/.test(key)) return 'getting-started';

  return 'guides';
}

function toCanonicalPath(oldPath, rootKey) {
  const key = normalizeKey(oldPath).toLowerCase();
  if (!key) return '/';

  if (key === 'api' || key === 'untitled') return '/api';
  if (key === 'faqs') return '/faq';
  if (key === 'troubleshooting') return '/troubleshooting';
  if (key === 'changelogs') return '/changelog';
  if (key === 'guides') return '/guides';
  if (key === 'getting-started') return '/getting-started';
  if (key === 'support') return '/guides/support';
  if (key === 'glossary') return '/guides/glossary';
  if (key === '17ed-untitled') return '/guides/user-manual';

  if (key === 'awp7-faqs') return '/faq';
  if (key === 'uylw-troubleshooting') return '/troubleshooting';
  if (key === 'rzvy-getting-started') return '/getting-started';
  if (key === '1thl-open-api-spec') return '/api/open-api-spec';

  const section = inferSection(rootKey, key);
  const normalized = normalizeSlug(key);
  return `/${section}/${normalized}`.replace(/\/+/g, '/');
}

function cleanInline(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .replace(/\u00A0/g, ' ')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .trim();
}

function stripHtml(input) {
  return String(input || '')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeCodeLanguage(value) {
  const language = String(value || '').toLowerCase();
  if (language === 'linux' || language === 'curl') return 'bash';
  if (language === 'shell') return 'bash';
  return language || 'txt';
}

function getText(node) {
  if (!node) return '';

  if (typeof node.text === 'string') {
    let value = node.text;
    if (node.code) value = `\`${value}\``;
    if (node.bold) value = `**${value}**`;
    if (node.italic) value = `*${value}*`;
    if (node.strikethrough) value = `~~${value}~~`;
    return value;
  }

  if (node.type === 'link') {
    const href = node.data?.href || '#';
    const label = cleanInline((node.children || []).map((child) => getText(child)).join('')) || href;
    return `[${label}](${href})`;
  }

  if (Array.isArray(node.children)) {
    return node.children.map((child) => getText(child)).join('');
  }

  return '';
}

function renderList(children, ordered, depth = 0) {
  const lines = [];
  let index = 1;

  for (const item of children || []) {
    if (!Array.isArray(item.children)) continue;

    const nested = [];
    const textParts = [];

    for (const child of item.children) {
      if (child.type === 'bulleted-list' || child.type === 'numbered-list') {
        nested.push(child);
      } else {
        textParts.push(getText(child));
      }
    }

    const lineText = cleanInline(textParts.join(' '));
    const marker = ordered ? `${index}.` : '-';
    if (lineText) {
      lines.push(`${'  '.repeat(depth)}${marker} ${lineText}`);
    }

    for (const nestedList of nested) {
      lines.push(renderList(nestedList.children || [], nestedList.type === 'numbered-list', depth + 1));
    }

    index += 1;
  }

  return lines.filter(Boolean).join('\n');
}

function renderTable(node) {
  const rows = (node.children || [])
    .filter((child) => child.type === 'table-row')
    .map((row) =>
      (row.children || [])
        .filter((cell) => cell.type === 'table-cell')
        .map((cell) => cleanInline(getText(cell)).replace(/\|/g, '\\|'))
    )
    .filter((cells) => cells.length > 0);

  if (rows.length === 0) return '';

  const width = Math.max(...rows.map((row) => row.length));
  const paddedRows = rows.map((row) => [...row, ...new Array(width - row.length).fill('')]);
  const header = paddedRows[0];
  const body = paddedRows.slice(1);

  const lines = [
    `| ${header.join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...body.map((row) => `| ${row.join(' | ')} |`),
  ];

  return lines.join('\n');
}

function renderParameterGroup(title, params) {
  if (!Array.isArray(params) || params.length === 0) return '';

  const lines = [`### ${title}`];
  for (const parameter of params) {
    const name = parameter.name || 'parameter';
    const type = parameter.type || 'string';
    const required = parameter.kind === 'required' ? 'required' : 'optional';
    const description = stripHtml(parameter.description || '');
    lines.push(`- \`${name}\` (${type}, ${required})${description ? `: ${description}` : ''}`);
  }

  return lines.join('\n');
}

function renderApiNode(data) {
  const blocks = [];
  const title = cleanInline(data.name || 'API Endpoint');
  const method = cleanInline(data.method || 'GET').toUpperCase();
  const url = cleanInline(data.url || '');

  blocks.push(`## ${title}`);
  if (url) {
    blocks.push('```http');
    blocks.push(`${method} ${url}`);
    blocks.push('```');
  }

  const description = stripHtml(data.description || '');
  if (description) blocks.push(description);

  const request = data.request || {};
  const paramSections = [
    renderParameterGroup('Path Parameters', request.pathParameters),
    renderParameterGroup('Query Parameters', request.queryParameters),
    renderParameterGroup('Header Parameters', request.headerParameters),
    renderParameterGroup('Form Data Parameters', request.formDataParameters),
    renderParameterGroup('Body Parameters', request.bodyDataParameters),
  ].filter(Boolean);

  if (paramSections.length > 0) {
    blocks.push(paramSections.join('\n\n'));
  }

  const responses = data.responses || data.results || [];
  if (Array.isArray(responses) && responses.length > 0) {
    blocks.push('### Responses');
    for (const response of responses) {
      const code = response.statusCode || response.code || response.name || 'response';
      const desc = stripHtml(response.description || response.summary || '');
      blocks.push(`- \`${code}\`${desc ? `: ${desc}` : ''}`);
    }
  }

  return blocks.filter(Boolean).join('\n\n');
}

function renderNode(node) {
  if (!node || !node.type) return '';

  switch (node.type) {
    case 'paragraph': {
      const text = cleanInline(getText(node));
      return text ? `${text}\n` : '';
    }
    case 'h1':
    case 'h2':
    case 'h3': {
      const level = Number(node.type.slice(1));
      const text = cleanInline(getText(node));
      if (!text) return '';
      return `${'#'.repeat(level)} ${text}\n`;
    }
    case 'bulleted-list': {
      const list = renderList(node.children || [], false);
      return list ? `${list}\n` : '';
    }
    case 'numbered-list': {
      const list = renderList(node.children || [], true);
      return list ? `${list}\n` : '';
    }
    case 'blockquote': {
      const text = cleanInline(getText(node));
      return text ? `> ${text}\n` : '';
    }
    case 'callout-v2': {
      const calloutType = String(node.data?.type || 'info').toUpperCase();
      const text = cleanInline(getText(node));
      return text ? `> **${calloutType}:** ${text}\n` : '';
    }
    case 'image': {
      const src = node.data?.src || node.data?.signedSrc || node.data?.darkSrc;
      if (!src) return '';
      const alt = cleanInline(node.data?.alt || 'Legacy documentation image');
      const caption = cleanInline(node.data?.caption || '');
      return `![${alt}](${src})${caption ? `\n\n*${caption}*` : ''}\n`;
    }
    case 'code-editor-v2': {
      const languages = node.data?.languages || [];
      const selectedId = node.data?.selectedLanguageId;
      const selected = languages.find((entry) => entry.id === selectedId) || languages[0];
      const code = String(selected?.code || '').trimEnd();
      if (!code) return '';
      const language = normalizeCodeLanguage(selected?.language);
      return `\`\`\`${language}\n${code}\n\`\`\`\n`;
    }
    case 'code-drawer': {
      const title = cleanInline(node.data?.title || 'Code Example');
      const languages = node.data?.codeEditorData?.languages || [];
      const selectedId = node.data?.codeEditorData?.selectedLanguageId;
      const selected = languages.find((entry) => entry.id === selectedId) || languages[0];
      const code = String(selected?.code || '').trimEnd();
      if (!code) return `### ${title}\n`;
      const language = normalizeCodeLanguage(selected?.language);
      return `### ${title}\n\n\`\`\`${language}\n${code}\n\`\`\`\n`;
    }
    case 'table': {
      const table = renderTable(node);
      return table ? `${table}\n` : '';
    }
    case 'api-method-v2':
    case 'api-oas-v2': {
      return `${renderApiNode(node.data || {})}\n`;
    }
    case 'changelog': {
      const entries = node.data?.items || [];
      const title = cleanInline(node.data?.title || 'Changelog');
      const lines = [`## ${title}`];
      for (const entry of entries) {
        const type = cleanInline(entry.type || 'updated');
        const description = cleanInline(stripHtml(entry.description || ''));
        if (description) lines.push(`- ${type}: ${description}`);
      }
      return `${lines.join('\n')}\n`;
    }
    case 'horizontal-line': {
      return '---\n';
    }
    default: {
      const fallback = cleanInline(getText(node));
      return fallback ? `${fallback}\n` : '';
    }
  }
}

function renderDocument(nodes) {
  const chunks = (nodes || []).map((node) => renderNode(node)).filter(Boolean);
  const content = chunks.join('\n');
  return content.replace(/\n{3,}/g, '\n\n').trim();
}

function lookupCanonicalPath(rawPath, legacyToCanonical) {
  const normalized = normalizeKey(rawPath).toLowerCase();
  if (!normalized) return '/';

  const withSlash = `/${normalized}`;
  const withoutSlash = withSlash.endsWith('/') ? withSlash.slice(0, -1) : withSlash;
  return (
    legacyToCanonical.get(withSlash) ||
    legacyToCanonical.get(withoutSlash) ||
    legacyToCanonical.get(`/${normalized}/`) ||
    withSlash
  );
}

function rewriteLegacyDocsLinks(markdown, legacyToCanonical) {
  return markdown.replace(/\[([^\]]+)\]\((https?:\/\/docs\.gameye\.com[^)\s]*)\)/gi, (match, label, href) => {
    try {
      const parsed = new URL(href);
      const canonicalPath = lookupCanonicalPath(parsed.pathname, legacyToCanonical);
      const suffix = `${parsed.search || ''}${parsed.hash || ''}`;
      return `[${label}](${canonicalPath}${suffix})`;
    } catch {
      return match;
    }
  });
}

function postProcessMarkdown(markdown, legacyToCanonical) {
  let text = markdown;

  text = rewriteLegacyDocsLinks(text, legacyToCanonical);

  // Convert heading wrappers like `## **Heading**` to plain headings.
  text = text.replace(/^(#{1,6})\s+\*\*(.+?)\*\*\s*$/gm, (_, hashes, heading) => {
    return `${hashes} ${heading.trim()}`;
  });

  // Normalize malformed emphasis spacing from legacy rich-text exports.
  text = text.replace(/\*\*([^*]+?)\s+\*\*/g, (_, inner) => `**${inner.trim()}**`);
  text = text.replace(/\*\*\s+([^*]+?)\*\*/g, (_, inner) => `**${inner.trim()}**`);
  text = text.replace(/\*\*([^*]+)\*\*\[/g, (_, inner) => `**${inner.trim()}** [`);
  text = text.replace(/([A-Za-z0-9])\*\*([^*\n]+)\*\*/g, '$1 **$2**');
  text = text.replace(/\*\*([^*\n]+)\*\*([A-Za-z0-9])/g, '**$1** $2');
  text = text.replace(/([.!?])\s*\*\*([^*\n]+:)\*\*\s*/g, '$1\n\n**$2** ');
  text = text.replace(/\*\*([^*\n]+:)\*\*([A-Za-z])/g, '**$1** $2');
  text = text.replace(/\*\*([^*\n]+)\*\*\s*-\s*/g, '\n- **$1**: ');
  text = text.replace(/:\n- /g, ':\n\n- ');
  text = text.replace(/-\s*\*\*([^\n*]+)\*\*\s*-\s*\*\*/g, '\n- **$1**\n- **');

  // Fix links with missing space before the next word.
  text = text.replace(/(\]\([^)]+\))([A-Za-z])/g, '$1 $2');

  // Replace legacy placeholder links with canonical targets.
  text = text.replace(/\[support@gameye\.com\]\(#\)/gi, '[support@gameye.com](mailto:support@gameye.com)');
  text = text.replace(/\[Authentication\]\(#\)/g, '[Authentication](/api/authentication)');
  text = text.replace(/\[Create your first game session\]\(#\)/g, '[Create your first game session](/api/launch-a-session)');
  text = text.replace(/\[Check available locations\]\(#\)/g, '[Check available locations](/api/available-locations)');

  return text.replace(/\n{3,}/g, '\n\n').trim();
}

function toCsv(rows, columns) {
  const escapeCell = (value) => {
    const text = String(value ?? '');
    if (/[",\n]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  };

  const lines = [columns.join(',')];
  for (const row of rows) {
    lines.push(columns.map((column) => escapeCell(row[column])).join(','));
  }
  return `${lines.join('\n')}\n`;
}

function canonicalPathToFile(canonicalPath) {
  const clean = normalizeKey(canonicalPath);
  if (!clean) return path.join(docsRoot, 'index.mdx');
  return path.join(docsRoot, `${clean}.mdx`);
}

function yamlQuote(value) {
  return `'${String(value || '').replace(/'/g, "''")}'`;
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function fetchJsonFromPage(url) {
  const response = await fetch(url, {
    headers: {
      'user-agent': 'GameyeDocsMigrationBot/1.0',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  const html = await response.text();
  const match = html.match(NEXT_DATA_REGEX);
  if (!match) {
    throw new Error(`Could not locate __NEXT_DATA__ for ${url}`);
  }

  return JSON.parse(match[1]);
}

async function buildTreeMaps() {
  const home = await fetchJsonFromPage(`${LEGACY_SITE}/`);
  const tree = home?.props?.pageProps?._docSpace?.publicDocsTree || [];

  const rootBySlug = new Map();

  function walk(nodes, rootKey = null) {
    for (const node of nodes || []) {
      const urlKey = normalizeKey(node.urlKey);
      const key = urlKey.toLowerCase();
      const currentRoot = rootKey ?? key;

      if (rootKey !== null && key) {
        rootBySlug.set(key, currentRoot);
      }

      if (Array.isArray(node.children) && node.children.length > 0) {
        walk(node.children, currentRoot);
      }
    }
  }

  walk(tree, null);
  return { rootBySlug };
}

async function main() {
  await mkdir(migrationDir, { recursive: true });
  await mkdir(path.dirname(redirectsFile), { recursive: true });

  const sitemapResponse = await fetch(`${LEGACY_SITE}/sitemap.xml`, {
    headers: {
      'user-agent': 'GameyeDocsMigrationBot/1.0',
    },
  });

  if (!sitemapResponse.ok) {
    throw new Error(`Failed to fetch sitemap.xml: ${sitemapResponse.status}`);
  }

  const sitemapXml = await sitemapResponse.text();
  const urlMatches = [...sitemapXml.matchAll(/<url>\s*<loc>([^<]+)<\/loc>\s*<lastmod>([^<]+)<\/lastmod>\s*<\/url>/g)];

  const legacyItems = urlMatches.map((match) => ({
    url: match[1],
    oldPath: match[1].replace(LEGACY_SITE, '') || '/',
    lastmod: match[2],
  }));

  const { rootBySlug } = await buildTreeMaps();

  const inventoryRows = [];
  const canonicalRows = [];
  const redirects = new Map();
  const canonicalContent = new Map();

  for (const [index, item] of legacyItems.entries()) {
    const oldSlug = normalizeKey(item.oldPath).toLowerCase();
    const rootKey = rootBySlug.get(oldSlug) || oldSlug;
    const canonicalPath = toCanonicalPath(item.oldPath, rootKey);

    const pageData = await fetchJsonFromPage(item.url);
    const doc = pageData?.props?.pageProps?._doc || {};
    const title = cleanInline(doc.title || doc.name || oldSlug || 'Legacy Page');
    const nodes = doc?.data?.nodes || [];
    const markdown = renderDocument(nodes);

    inventoryRows.push({
      legacy_url: item.url,
      legacy_path: item.oldPath,
      legacy_slug: oldSlug,
      legacy_title: title,
      legacy_lastmod: item.lastmod,
      source_root: rootKey,
      canonical_path: canonicalPath,
    });

    canonicalRows.push({
      from: item.oldPath,
      to: canonicalPath,
      reason: item.oldPath === canonicalPath ? 'already-canonical' : 'legacy-normalization',
    });

    if (item.oldPath !== canonicalPath) {
      redirects.set(item.oldPath, canonicalPath);
    }

    const existing = canonicalContent.get(canonicalPath);
    const candidate = {
      oldPath: item.oldPath,
      title,
      markdown,
      updatedAt: doc.updatedAt || item.lastmod,
      legacyUrl: item.url,
      randomSlug: isRandomPrefixedSlug(oldSlug),
      order: index,
    };

    if (!existing) {
      canonicalContent.set(canonicalPath, candidate);
    } else if (existing.randomSlug && !candidate.randomSlug) {
      canonicalContent.set(canonicalPath, candidate);
    }
  }

  const writeResults = [];
  const legacyToCanonical = new Map();

  for (const row of canonicalRows) {
    const from = `/${normalizeKey(row.from).toLowerCase()}`;
    const to = row.to;
    legacyToCanonical.set(from, to);
    legacyToCanonical.set(`${from}/`, to);
  }

  for (const [canonicalPath, content] of [...canonicalContent.entries()].sort(([a], [b]) =>
    a.localeCompare(b)
  )) {
    if (RESERVED_INDEX_PATHS.has(canonicalPath)) {
      writeResults.push({ canonicalPath, status: 'skipped-reserved-index', file: '' });
      continue;
    }

    const targetFile = canonicalPathToFile(canonicalPath);
    await mkdir(path.dirname(targetFile), { recursive: true });

    let canWrite = true;
    if (await exists(targetFile)) {
      const existingText = await readFile(targetFile, 'utf8');
      canWrite = GENERATED_MARKERS.some((marker) => existingText.includes(marker));
    }

    if (!canWrite) {
      writeResults.push({
        canonicalPath,
        status: 'skipped-existing-manual-file',
        file: path.relative(projectRoot, targetFile),
      });
      continue;
    }

    const description = `Migrated from legacy Archbee docs path ${content.oldPath}.`;
    const markdownBody = content.markdown || 'Legacy content could not be extracted automatically for this page.';
    const body = postProcessMarkdown(markdownBody, legacyToCanonical);

    const fileText = `---\ntitle: ${yamlQuote(content.title)}\ndescription: ${yamlQuote(description)}\n---\n\n_${GENERATED_MARKER}_\n\n> Migrated from legacy URL: [${content.oldPath}](${content.legacyUrl})\n>\n> Source last updated: ${content.updatedAt}\n\n${body}\n`;

    await writeFile(targetFile, fileText, 'utf8');
    writeResults.push({
      canonicalPath,
      status: 'generated',
      file: path.relative(projectRoot, targetFile),
    });
  }

  const redirectObject = Object.fromEntries(
    [...redirects.entries()].sort(([a], [b]) => a.localeCompare(b))
  );

  const redirectsText = `// Auto-generated by scripts/migrate-archbee-docs.mjs on ${dateStamp}.\n// Legacy docs.gameye.com URL redirects to canonical normalized routes.\n\nexport const legacyRedirects = ${JSON.stringify(redirectObject, null, 2)};\n`;

  await writeFile(redirectsFile, redirectsText, 'utf8');

  await writeFile(
    path.join(migrationDir, 'gam-15-legacy-url-inventory.csv'),
    toCsv(inventoryRows, [
      'legacy_url',
      'legacy_path',
      'legacy_slug',
      'legacy_title',
      'legacy_lastmod',
      'source_root',
      'canonical_path',
    ]),
    'utf8'
  );

  await writeFile(
    path.join(migrationDir, 'gam-15-url-normalization-map.csv'),
    toCsv(canonicalRows, ['from', 'to', 'reason']),
    'utf8'
  );

  await writeFile(
    path.join(migrationDir, 'gam-15-generation-results.csv'),
    toCsv(writeResults, ['canonicalPath', 'status', 'file']),
    'utf8'
  );

  const generatedCount = writeResults.filter((row) => row.status === 'generated').length;
  const skippedCount = writeResults.length - generatedCount;
  console.log(`Legacy URLs scanned: ${legacyItems.length}`);
  console.log(`Canonical pages considered: ${writeResults.length}`);
  console.log(`Generated pages: ${generatedCount}`);
  console.log(`Skipped pages: ${skippedCount}`);
  console.log(`Redirect entries: ${Object.keys(redirectObject).length}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
