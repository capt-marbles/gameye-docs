import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const DIST = path.join(ROOT, 'dist');
const SITE_ORIGIN = 'https://docs.gameye.com';

const CHATBOT_SCRIPT = path.join(ROOT, 'public', 'chatbot', 'chatbot-loader.js');
const REDIRECT_FILES = [
  { exportName: 'legacyRedirects', file: path.join(ROOT, 'redirects', 'legacy-redirects.mjs') },
  { exportName: 'qualityRedirects', file: path.join(ROOT, 'redirects', 'quality-redirects.mjs') },
];

const REQUIRED_CHATBOT_EVENTS = [
  'gy_chatbot_opened',
  'gy_chatbot_question_submitted',
  'gy_chatbot_response_received',
  'gy_chatbot_citation_clicked',
  'gy_chatbot_fallback_routed',
  'gy_chatbot_fallback_link_clicked',
  'gy_chatbot_error',
];

const REQUIRED_ROUTE_URLS = ['https://docs.gameye.com/', 'https://docs.gameye.com/api/reference'];

function normalizePathname(value) {
  if (!value) return '/';
  const trimmed = value.endsWith('/') && value !== '/' ? value.slice(0, -1) : value;
  return trimmed || '/';
}

function isSkippableLink(raw) {
  if (!raw) return true;
  const value = raw.trim();
  if (!value) return true;
  return (
    value.startsWith('#') ||
    value.startsWith('mailto:') ||
    value.startsWith('tel:') ||
    value.startsWith('javascript:') ||
    value.startsWith('data:')
  );
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(fullPath)));
      continue;
    }
    files.push(fullPath);
  }

  return files;
}

function toWebPath(filePath) {
  return `/${path.relative(DIST, filePath).split(path.sep).join('/')}`;
}

function htmlFileToRoute(filePath) {
  const rel = path.relative(DIST, filePath).split(path.sep).join('/');
  if (rel === 'index.html') return '/';
  if (rel.endsWith('/index.html')) return `/${rel.slice(0, -'/index.html'.length)}`;
  if (rel.endsWith('.html')) return `/${rel.slice(0, -'.html'.length)}`;
  return null;
}

function resolveInternalPath(raw, currentRoute) {
  const base = new URL(currentRoute.endsWith('/') ? currentRoute : `${currentRoute}/`, SITE_ORIGIN);
  const resolved = new URL(raw, base);
  if (resolved.origin !== SITE_ORIGIN) return null;
  return `${resolved.pathname}${resolved.search}`;
}

function extractReferences(html) {
  return [...html.matchAll(/(?:href|src)=\"([^\"]+)\"/g)].map((m) => m[1]);
}

async function loadRedirects() {
  const combined = {};

  for (const ref of REDIRECT_FILES) {
    const url = pathToFileURL(ref.file).href;
    const mod = await import(url);
    const map = mod[ref.exportName] || {};
    Object.assign(combined, map);
  }

  return combined;
}

async function main() {
  const failures = [];

  const files = await walk(DIST);
  const htmlFiles = files.filter((file) => file.endsWith('.html'));

  if (htmlFiles.length === 0) {
    throw new Error('No HTML files found in dist. Run npm run build first.');
  }

  const assetPaths = new Set(files.map(toWebPath));
  const routePaths = new Set();

  for (const htmlFile of htmlFiles) {
    const route = htmlFileToRoute(htmlFile);
    if (!route) continue;
    routePaths.add(normalizePathname(route));
  }

  for (const expected of REQUIRED_ROUTE_URLS) {
    const pathname = normalizePathname(new URL(expected).pathname);
    if (!routePaths.has(pathname)) {
      failures.push(`missing required route in build output: ${expected}`);
    }
  }

  for (const htmlFile of htmlFiles) {
    const route = htmlFileToRoute(htmlFile);
    if (!route) continue;

    const html = await readFile(htmlFile, 'utf8');
    const refs = extractReferences(html);

    for (const ref of refs) {
      if (isSkippableLink(ref)) continue;
      const resolved = resolveInternalPath(ref, route);
      if (!resolved) continue;

      const [pathname] = resolved.split('?');
      if (!pathname) continue;

      const hasExtension = /\.[a-z0-9]+$/i.test(pathname);
      if (hasExtension && !pathname.endsWith('.html')) {
        if (!assetPaths.has(pathname)) {
          failures.push(`broken asset reference on ${route}: ${ref}`);
        }
        continue;
      }

      const normalized = normalizePathname(pathname);
      if (!routePaths.has(normalized)) {
        failures.push(`broken internal link on ${route}: ${ref}`);
      }
    }
  }

  const redirects = await loadRedirects();
  const redirectEntries = Object.entries(redirects);

  for (const [source, target] of redirectEntries) {
    if (typeof source !== 'string' || typeof target !== 'string') {
      failures.push(`invalid redirect entry: ${source} -> ${target}`);
      continue;
    }

    if (!source.startsWith('/')) failures.push(`redirect source must start with '/': ${source}`);
    if (!target.startsWith('/')) failures.push(`redirect target must start with '/': ${source} -> ${target}`);

    const normalizedSource = normalizePathname(source);
    const normalizedTarget = normalizePathname(target);

    if (normalizedSource === normalizedTarget) {
      failures.push(`self-referencing redirect: ${source} -> ${target}`);
    }

    if (Object.prototype.hasOwnProperty.call(redirects, target)) {
      failures.push(`redirect chain detected (must be one-hop): ${source} -> ${target}`);
    }

    if (!routePaths.has(normalizedTarget)) {
      failures.push(`redirect target not found in built routes: ${source} -> ${target}`);
    }
  }

  const chatbotSource = await readFile(CHATBOT_SCRIPT, 'utf8');

  if (!chatbotSource.includes('window.dataLayer')) {
    failures.push('chatbot analytics hook missing window.dataLayer integration');
  }

  for (const eventName of REQUIRED_CHATBOT_EVENTS) {
    if (!chatbotSource.includes(eventName)) {
      failures.push(`chatbot analytics event missing: ${eventName}`);
    }
  }

  if (failures.length > 0) {
    console.error('Launch readiness checks failed:');
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }

  console.log(
    `Launch readiness checks passed for ${htmlFiles.length} HTML files, ${redirectEntries.length} redirects, and ${REQUIRED_CHATBOT_EVENTS.length} analytics events.`
  );
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
