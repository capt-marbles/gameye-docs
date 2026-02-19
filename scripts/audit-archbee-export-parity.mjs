#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

const projectRoot = process.cwd();
const docsRoot = path.join(projectRoot, 'src', 'content', 'docs');
const defaultExportDir = path.resolve(projectRoot, '..', 'archbee-export');
const defaultOutputDir = path.join(projectRoot, 'reports', 'parity');

function parseArgs(argv) {
  const args = {
    exportDir: defaultExportDir,
    outputDir: defaultOutputDir,
    minSimilarity: 0.72,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--export-dir' && argv[i + 1]) {
      args.exportDir = path.resolve(argv[i + 1]);
      i += 1;
      continue;
    }
    if (token === '--output-dir' && argv[i + 1]) {
      args.outputDir = path.resolve(argv[i + 1]);
      i += 1;
      continue;
    }
    if (token === '--min-similarity' && argv[i + 1]) {
      const value = Number(argv[i + 1]);
      if (!Number.isNaN(value) && value >= 0 && value <= 1) {
        args.minSimilarity = value;
      }
      i += 1;
      continue;
    }
  }

  return args;
}

function normalizeRoute(value) {
  const clean = String(value || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/');
  if (!clean || clean === '/') return '/';
  return `/${clean.replace(/^\/+|\/+$/g, '')}`;
}

function docsRouteFromRelPath(relPath) {
  const noExt = relPath.replace(/\.mdx$/i, '');
  if (noExt === 'index') return '/';
  if (noExt.endsWith('/index')) {
    return normalizeRoute(noExt.slice(0, -('/index'.length)));
  }
  return normalizeRoute(noExt);
}

async function walkMdxFiles(rootDir) {
  const output = [];

  async function walk(currentDir) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const nextPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(nextPath);
        continue;
      }
      if (!entry.name.toLowerCase().endsWith('.mdx')) continue;
      output.push(nextPath);
    }
  }

  await walk(rootDir);
  return output.sort((a, b) => a.localeCompare(b));
}

function parseFrontmatter(raw) {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) {
    return { data: {}, body: raw.trim() };
  }

  const data = {};
  const block = match[1];
  for (const line of block.split('\n')) {
    const pair = line.match(/^([A-Za-z0-9_-]+):\s*(.+)$/);
    if (!pair) continue;
    const key = pair[1];
    const value = pair[2].trim().replace(/^['"]|['"]$/g, '');
    data[key] = value;
  }

  return {
    data,
    body: raw.slice(match[0].length).trim(),
  };
}

function decodeEntities(value) {
  return String(value || '')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function slugify(input) {
  return decodeEntities(input)
    .toLowerCase()
    .replace(/[_]/g, ' ')
    .replace(/[()[\]{}!?.,:;'"`~]/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function normalizeTitle(input) {
  return decodeEntities(input)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s-]/g, '')
    .trim();
}

function extractTitle(rawTitle, fallback) {
  const clean = String(rawTitle || '').trim().replace(/^['"]|['"]$/g, '');
  return clean || fallback;
}

function parseCsvLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ',' && !inQuotes) {
      values.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  values.push(current);
  return values;
}

async function loadLegacyNormalizationMap() {
  const csvPath = path.join(projectRoot, 'migration', 'gam-15-url-normalization-map.csv');
  try {
    const raw = await fs.readFile(csvPath, 'utf8');
    const lines = raw.split(/\r?\n/).filter(Boolean);
    if (lines.length <= 1) return new Map();

    const header = parseCsvLine(lines[0]);
    const fromIndex = header.indexOf('from');
    const toIndex = header.indexOf('to');
    if (fromIndex === -1 || toIndex === -1) return new Map();

    const map = new Map();
    for (const line of lines.slice(1)) {
      const cells = parseCsvLine(line);
      const from = normalizeRoute(cells[fromIndex] || '');
      const to = normalizeRoute(cells[toIndex] || '');
      if (from && to) map.set(from, to);
    }
    return map;
  } catch {
    return new Map();
  }
}

function parseArchbeeApiObject(body) {
  const trimmed = body.trim();
  if (!trimmed.startsWith('{')) return null;

  try {
    const parsed = JSON.parse(trimmed);
    if (!parsed || !parsed.type || !String(parsed.type).includes('api')) {
      return null;
    }
    const data = parsed.data || {};
    const lines = [];
    const name = decodeEntities(data.name || '');
    const method = decodeEntities(data.method || '');
    const url = decodeEntities(data.url || '');
    const description = decodeEntities(data.description || '');

    if (name) lines.push(name);
    if (method || url) lines.push(`${method} ${url}`.trim());
    if (description) lines.push(description);

    const request = data.request || {};
    const sections = [
      request.pathParameters || [],
      request.queryParameters || [],
      request.headerParameters || [],
      request.formDataParameters || [],
      request.bodyDataParameters || [],
    ];

    for (const section of sections) {
      for (const item of section) {
        const pName = decodeEntities(item.name || '');
        const pType = decodeEntities(item.type || '');
        const pDesc = decodeEntities(item.description || '');
        lines.push([pName, pType, pDesc].filter(Boolean).join(' '));
      }
    }

    const responses = Array.isArray(data.responses) ? data.responses : [];
    for (const response of responses) {
      const code = decodeEntities(response.statusCode || response.code || '');
      const desc = decodeEntities(response.description || response.summary || '');
      lines.push([code, desc].filter(Boolean).join(' '));
    }

    return lines.filter(Boolean).join('\n');
  } catch {
    return null;
  }
}

function normalizeMarkdownForComparison(body) {
  const asText = decodeEntities(body)
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/```/g, ' '))
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\{[^}]+\}/g, ' ')
    .replace(/[#>*_~|-]/g, ' ')
    .replace(/[()[\],.!?:;"'\\/]/g, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

  return asText;
}

function tokens(input) {
  return input.split(/\s+/).filter(Boolean);
}

function tokenOverlapScore(aText, bText) {
  const aTokens = tokens(aText);
  const bTokens = tokens(bText);
  if (aTokens.length === 0 && bTokens.length === 0) return 1;
  if (aTokens.length === 0 || bTokens.length === 0) return 0;

  const aSet = new Set(aTokens);
  const bSet = new Set(bTokens);
  let shared = 0;
  for (const token of aSet) {
    if (bSet.has(token)) shared += 1;
  }
  return shared / Math.max(aSet.size, bSet.size);
}

function inferExpectedRoutes(exportRelPath, exportMeta, legacyMap) {
  const noExt = exportRelPath.replace(/\.mdx$/i, '');
  const segments = noExt.split('/').filter(Boolean);
  const fileName = segments[segments.length - 1] || '';
  const slug = slugify(fileName);

  const candidates = new Set();
  const add = (value) => {
    const route = normalizeRoute(value);
    if (route) candidates.add(route);
  };

  const top = (segments[0] || '').toLowerCase();
  const second = (segments[1] || '').toLowerCase();

  if (segments.length === 1) {
    if (slug === 'what-is-gameye' || slug === 'introduction') add('/');
    if (slug === 'changelogs' || slug === 'changelog') add('/changelog');
    add(`/${slug}`);
  }

  if (top === 'getting started') {
    if (slug === 'getting-ready-to-start') add('/getting-started/getting-ready-to-start');
    else add(`/getting-started/${slug}`);
  }

  if (top === 'api v2') {
    if (second === 'api reference') {
      add(`/api/${slug}`);
      add(`/api/reference/${slug}`);
      add('/api/reference');
    } else {
      add(`/api/${slug}`);
    }
  }

  if (top === 'legacy api') {
    add(`/api/${slug}`);
  }

  if (top === 'guides') {
    add(`/guides/${slug}`);
  }

  if (top === 'support') {
    add(`/guides/${slug}`);
  }

  if (top === 'troubleshooting') {
    add(`/troubleshooting/${slug}`);
  }

  if (top === 'faqs') {
    if (slug === 'faqs') add('/faq');
    else add(`/faq/${slug}`);
  }

  if (top === 'glossary') {
    add(`/guides/${slug}`);
    if (slug === 'region') add('/guides/regions');
  }

  if (top === 'admin panel') {
    if (second === 'user manual' && segments.length === 2) {
      add('/guides/user-manual');
    } else {
      add(`/guides/${slug}`);
    }
  }

  const slugValues = [
    exportMeta.slug || '',
    slug,
    fileName,
  ]
    .map((value) => slugify(value))
    .filter(Boolean);

  for (const legacySlug of slugValues) {
    const oldPath = normalizeRoute(`/${legacySlug}`);
    const mapped = legacyMap.get(oldPath);
    if (mapped) add(mapped);
  }

  return [...candidates];
}

async function buildDocsIndex() {
  const files = await walkMdxFiles(docsRoot);
  const pages = [];

  for (const absPath of files) {
    const relPath = path.relative(docsRoot, absPath).replace(/\\/g, '/');
    const raw = await fs.readFile(absPath, 'utf8');
    const { data, body } = parseFrontmatter(raw);
    const fileStem = path.basename(relPath, '.mdx');
    const fallbackTitle = fileStem === 'index' ? path.basename(path.dirname(relPath)) : fileStem;
    const title = extractTitle(data.title, fallbackTitle);
    const route = docsRouteFromRelPath(relPath);
    const normalizedBody = normalizeMarkdownForComparison(body);

    pages.push({
      absPath,
      relPath,
      route,
      title,
      normalizedTitle: normalizeTitle(title),
      body,
      normalizedBody,
    });
  }

  return pages;
}

async function buildExportIndex(exportDir, legacyMap) {
  const files = await walkMdxFiles(exportDir);
  const pages = [];

  for (const absPath of files) {
    const relPath = path.relative(exportDir, absPath).replace(/\\/g, '/');
    const raw = await fs.readFile(absPath, 'utf8');
    const { data, body } = parseFrontmatter(raw);
    const fileStem = path.basename(relPath, '.mdx');
    const fallbackTitle = fileStem;
    const title = extractTitle(data.title, fallbackTitle);
    const apiText = parseArchbeeApiObject(body);
    const compareBody = apiText || body;
    const normalizedBody = normalizeMarkdownForComparison(compareBody);
    const expectedRoutes = inferExpectedRoutes(relPath, data, legacyMap);

    pages.push({
      absPath,
      relPath,
      title,
      normalizedTitle: normalizeTitle(title),
      body: compareBody,
      normalizedBody,
      expectedRoutes,
      sourceSlug: data.slug || '',
    });
  }

  return pages;
}

function scoreToPct(score) {
  return Number((score * 100).toFixed(1));
}

function buildMarkdownReport(report) {
  const lines = [];
  lines.push('# Archbee -> Starlight Parity Report');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Export directory: ${report.exportDir}`);
  lines.push(`Docs directory: ${report.docsDir}`);
  lines.push('');
  lines.push('## Summary');
  lines.push(`- Export pages scanned: ${report.summary.exportPages}`);
  lines.push(`- Docs pages scanned: ${report.summary.docsPages}`);
  lines.push(`- Matched pages: ${report.summary.matched}`);
  lines.push(`- Exact content matches: ${report.summary.exact}`);
  lines.push(`- High-confidence matches: ${report.summary.high}`);
  lines.push(`- Low-similarity matches: ${report.summary.low}`);
  lines.push(`- Export pages missing in docs: ${report.summary.missingInDocs}`);
  lines.push(`- Extra docs pages not in export: ${report.summary.extraInDocs}`);
  lines.push('');

  if (report.missingInDocs.length > 0) {
    lines.push('## Missing In Docs');
    for (const item of report.missingInDocs) {
      lines.push(`- \`${item.exportRelPath}\` (${item.title})`);
      lines.push(`  expected routes: ${item.expectedRoutes.join(', ') || '(none)'}`);
    }
    lines.push('');
  }

  if (report.lowSimilarity.length > 0) {
    lines.push('## Low Similarity');
    for (const item of report.lowSimilarity.slice(0, 25)) {
      lines.push(`- ${scoreToPct(item.similarity)}% \`${item.exportRelPath}\` -> \`${item.docsRelPath}\``);
    }
    lines.push('');
  }

  if (report.extraInDocs.length > 0) {
    lines.push('## Extra Docs Pages');
    for (const item of report.extraInDocs.slice(0, 40)) {
      lines.push(`- \`${item.relPath}\` (${item.route})`);
    }
    lines.push('');
  }

  lines.push('## Must Fix Before Launch');
  if (report.missingInDocs.length === 0 && report.lowSimilarity.length === 0) {
    lines.push('- None identified by automated parity checks.');
  } else {
    for (const item of report.missingInDocs) {
      lines.push(`- Create/map page for \`${item.exportRelPath}\` (${item.title}).`);
    }
    for (const item of report.lowSimilarity.slice(0, 20)) {
      lines.push(
        `- Reconcile copy for \`${item.exportRelPath}\` vs \`${item.docsRelPath}\` (${scoreToPct(item.similarity)}% similarity).`
      );
    }
  }
  lines.push('');

  lines.push('## Safe Post-Launch Improvements');
  if (report.extraInDocs.length === 0) {
    lines.push('- None.');
  } else {
    lines.push('- Review extra docs pages to keep, redirect, or merge after parity signoff:');
    for (const item of report.extraInDocs.slice(0, 30)) {
      lines.push(`  - \`${item.route}\``);
    }
  }
  lines.push('');

  return `${lines.join('\n')}\n`;
}

async function main() {
  const { exportDir, outputDir, minSimilarity } = parseArgs(process.argv);

  await fs.access(exportDir);
  await fs.access(docsRoot);
  await fs.mkdir(outputDir, { recursive: true });

  const legacyMap = await loadLegacyNormalizationMap();
  const docsPages = await buildDocsIndex();
  const exportPages = await buildExportIndex(exportDir, legacyMap);

  const docsByRoute = new Map(docsPages.map((page) => [page.route, page]));
  const docsByTitle = new Map();
  for (const page of docsPages) {
    const key = page.normalizedTitle;
    if (!docsByTitle.has(key)) docsByTitle.set(key, []);
    docsByTitle.get(key).push(page);
  }

  const matchedDocsRoutes = new Set();
  const results = [];

  for (const exportPage of exportPages) {
    let mapped = null;
    let mappingSource = 'none';

    for (const route of exportPage.expectedRoutes) {
      const candidate = docsByRoute.get(route);
      if (candidate) {
        mapped = candidate;
        mappingSource = 'route';
        break;
      }
    }

    if (!mapped && exportPage.expectedRoutes.length === 0) {
      const byTitle = docsByTitle.get(exportPage.normalizedTitle) || [];
      if (byTitle.length > 0) {
        mapped = byTitle[0];
        mappingSource = 'title';
      }
    }

    if (!mapped) {
      results.push({
        status: 'missing_in_docs',
        exportRelPath: exportPage.relPath,
        title: exportPage.title,
        expectedRoutes: exportPage.expectedRoutes,
      });
      continue;
    }

    matchedDocsRoutes.add(mapped.route);
    const similarity = tokenOverlapScore(exportPage.normalizedBody, mapped.normalizedBody);

    let status = 'high_similarity';
    if (exportPage.normalizedBody === mapped.normalizedBody) {
      status = 'exact';
    } else if (similarity < minSimilarity) {
      status = 'low_similarity';
    }

    results.push({
      status,
      exportRelPath: exportPage.relPath,
      docsRelPath: mapped.relPath,
      route: mapped.route,
      title: exportPage.title,
      docsTitle: mapped.title,
      similarity,
      mappingSource,
      expectedRoutes: exportPage.expectedRoutes,
    });
  }

  const missingInDocs = results
    .filter((row) => row.status === 'missing_in_docs')
    .map((row) => ({
      exportRelPath: row.exportRelPath,
      title: row.title,
      expectedRoutes: row.expectedRoutes,
    }));

  const lowSimilarity = results
    .filter((row) => row.status === 'low_similarity')
    .sort((a, b) => a.similarity - b.similarity)
    .map((row) => ({
      exportRelPath: row.exportRelPath,
      docsRelPath: row.docsRelPath,
      route: row.route,
      title: row.title,
      docsTitle: row.docsTitle,
      similarity: row.similarity,
      mappingSource: row.mappingSource,
    }));

  const extraInDocs = docsPages
    .filter((page) => !matchedDocsRoutes.has(page.route))
    .map((page) => ({
      relPath: page.relPath,
      route: page.route,
      title: page.title,
    }))
    .sort((a, b) => a.route.localeCompare(b.route));

  const summary = {
    exportPages: exportPages.length,
    docsPages: docsPages.length,
    matched: results.filter((row) => row.status !== 'missing_in_docs').length,
    exact: results.filter((row) => row.status === 'exact').length,
    high: results.filter((row) => row.status === 'high_similarity').length,
    low: lowSimilarity.length,
    missingInDocs: missingInDocs.length,
    extraInDocs: extraInDocs.length,
    minSimilarity,
  };

  const report = {
    generatedAt: new Date().toISOString(),
    exportDir,
    docsDir: docsRoot,
    summary,
    missingInDocs,
    lowSimilarity,
    extraInDocs,
    results: results.sort((a, b) => a.exportRelPath.localeCompare(b.exportRelPath)),
  };

  const jsonPath = path.join(outputDir, 'archbee-export-parity-report.json');
  const markdownPath = path.join(outputDir, 'archbee-export-parity-report.md');
  await fs.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await fs.writeFile(markdownPath, buildMarkdownReport(report), 'utf8');

  console.log('Archbee parity audit complete.');
  console.log(`Export pages: ${summary.exportPages}`);
  console.log(`Docs pages: ${summary.docsPages}`);
  console.log(`Matched pages: ${summary.matched}`);
  console.log(`Missing in docs: ${summary.missingInDocs}`);
  console.log(`Low similarity: ${summary.low}`);
  console.log(`Extra in docs: ${summary.extraInDocs}`);
  console.log(`Report: ${path.relative(projectRoot, markdownPath)}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
