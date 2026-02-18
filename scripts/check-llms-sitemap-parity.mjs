import { readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();

const LLM_PATH = path.join(ROOT, 'public', 'llms.txt');
const SITEMAP_INDEX_PATH = path.join(ROOT, 'dist', 'sitemap-index.xml');
const DOCS_INDEX_PATH = path.join(ROOT, 'src', 'content', 'docs', 'index.mdx');
const GETTING_STARTED_INDEX_PATH = path.join(ROOT, 'src', 'content', 'docs', 'getting-started', 'index.mdx');
const API_INDEX_PATH = path.join(ROOT, 'src', 'content', 'docs', 'api', 'index.mdx');
const UNIFIED_HEADER_PATH = path.join(ROOT, 'src', 'components', 'starlight', 'UnifiedHeader.astro');

const REQUIRED_LLMS_URLS = [
  'https://docs.gameye.com/sitemap-index.xml',
  'https://docs.gameye.com/',
  'https://docs.gameye.com/api/reference',
  'https://gameye.com/docs/',
  'https://gameye.com/platform/',
  'https://gameye.com/pricing/',
  'https://gameye.com/comparison/',
  'https://gameye.com/contact-us/',
];

const REQUIRED_SITEMAP_URLS = ['https://docs.gameye.com/', 'https://docs.gameye.com/api/reference'];

const REQUIRED_DOCS_RECIPROCAL_LINKS = [
  'https://gameye.com/platform/',
  'https://gameye.com/pricing/',
  'https://gameye.com/comparison/',
  'https://gameye.com/contact-us/',
];

const REQUIRED_HEADER_LINKS = [
  'https://gameye.com/platform/',
  'https://gameye.com/pricing/',
  'https://gameye.com/contact-us/',
  '/api/reference',
  '/guides/getting-support',
];

function extractLocs(xml) {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
}

function normalizeUrl(value) {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

async function readText(filePath) {
  try {
    return await readFile(filePath, 'utf8');
  } catch (error) {
    throw new Error(`Missing required file: ${filePath}`);
  }
}

async function loadSitemapUrlsFromIndex() {
  const indexXml = await readText(SITEMAP_INDEX_PATH);
  const sitemapLocs = extractLocs(indexXml);

  if (sitemapLocs.length === 0) {
    throw new Error('No sitemap files referenced in dist/sitemap-index.xml');
  }

  const urls = new Set();

  for (const loc of sitemapLocs) {
    const fileName = path.basename(new URL(loc).pathname);
    const sitemapPath = path.join(ROOT, 'dist', fileName);
    const sitemapXml = await readText(sitemapPath);
    for (const url of extractLocs(sitemapXml)) urls.add(url);
  }

  return urls;
}

async function main() {
  const failures = [];

  const llms = await readText(LLM_PATH);
  for (const url of REQUIRED_LLMS_URLS) {
    if (!llms.includes(url)) failures.push(`llms.txt missing required URL: ${url}`);
  }

  const docsIndex = await readText(DOCS_INDEX_PATH);
  const gettingStartedIndex = await readText(GETTING_STARTED_INDEX_PATH);
  const apiIndex = await readText(API_INDEX_PATH);

  for (const url of REQUIRED_DOCS_RECIPROCAL_LINKS) {
    if (!docsIndex.includes(url) && !gettingStartedIndex.includes(url) && !apiIndex.includes(url)) {
      failures.push(`reciprocal docs links missing marketing URL: ${url}`);
    }
    if (!llms.includes(url)) {
      failures.push(`llms.txt missing reciprocal marketing URL: ${url}`);
    }
  }

  const headerSource = await readText(UNIFIED_HEADER_PATH);
  for (const link of REQUIRED_HEADER_LINKS) {
    if (!headerSource.includes(link)) {
      failures.push(`Unified docs header missing required global link: ${link}`);
    }
  }

  const sitemapUrls = await loadSitemapUrlsFromIndex();
  const normalizedSitemapUrls = new Set([...sitemapUrls].map(normalizeUrl));
  for (const url of REQUIRED_SITEMAP_URLS) {
    if (!normalizedSitemapUrls.has(normalizeUrl(url))) failures.push(`sitemap missing required URL: ${url}`);
  }

  if (failures.length > 0) {
    console.error('Parity checks failed:');
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }

  console.log(
    `Parity checks passed for ${sitemapUrls.size} sitemap URLs with ${REQUIRED_LLMS_URLS.length} llms anchors.`
  );
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
