#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const DIST_DIR = process.argv.find((arg) => arg.startsWith('--dist='))?.split('=')[1] ?? 'dist';
const distPath = path.resolve(process.cwd(), DIST_DIR);
const origin = 'https://docs.gameye.com';

function walkHtml(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  let files = [];

  for (const entry of entries) {
    const filePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files = files.concat(walkHtml(filePath));
      continue;
    }

    if (entry.name.endsWith('.html')) {
      files.push(filePath);
    }
  }

  return files;
}

function routeFromHtml(htmlFile) {
  const relative = path.relative(distPath, htmlFile).replace(/\\/g, '/');
  if (relative === 'index.html') return '/';
  if (relative.endsWith('/index.html')) {
    return `/${relative.slice(0, -'/index.html'.length)}`;
  }
  return `/${relative.replace(/\.html$/, '')}`;
}

function expectedCanonical(routePath) {
  const normalized = routePath === '/' ? routePath : routePath.replace(/\/$/, '');
  return `${origin}${normalized}`;
}

function extractCanonical(html) {
  const match = html.match(/<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["'][^>]*>/i);
  return match ? match[1] : null;
}

function hasMeta(html, key, value) {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(
    `<meta(?=[^>]*\\b${key}=["']${escaped}["'])(?=[^>]*\\bcontent=["'][^"']+["'])[^>]*>`,
    'i'
  );
  return pattern.test(html);
}

function extractStructuredData(html) {
  const match = html.match(
    /<script[^>]+id=["']gameye-docs-structured-data["'][^>]*>([\s\S]*?)<\/script>/i
  );
  if (!match) return null;
  return match[1].trim();
}

if (!fs.existsSync(distPath)) {
  console.error(`Dist directory not found: ${distPath}`);
  process.exit(1);
}

const htmlFiles = walkHtml(distPath);
const errors = [];
let checkedPages = 0;

for (const file of htmlFiles) {
  const html = fs.readFileSync(file, 'utf8');
  const isRedirectStub = /<meta[^>]+http-equiv=["']refresh["']/i.test(html);
  if (isRedirectStub) {
    continue;
  }
  checkedPages += 1;
  const routePath = routeFromHtml(file);
  const expected = expectedCanonical(routePath);
  const canonical = extractCanonical(html);

  if (!canonical) {
    errors.push(`${routePath}: missing canonical link tag`);
  } else if (canonical !== expected) {
    errors.push(`${routePath}: canonical mismatch (expected ${expected}, got ${canonical})`);
  }

  if (!hasMeta(html, 'name', 'description')) {
    errors.push(`${routePath}: missing meta[name="description"]`);
  }

  if (!hasMeta(html, 'property', 'og:title')) {
    errors.push(`${routePath}: missing meta[property="og:title"]`);
  }

  if (!hasMeta(html, 'property', 'og:url')) {
    errors.push(`${routePath}: missing meta[property="og:url"]`);
  }

  if (!hasMeta(html, 'name', 'twitter:title')) {
    errors.push(`${routePath}: missing meta[name="twitter:title"]`);
  }

  if (!hasMeta(html, 'name', 'twitter:description')) {
    errors.push(`${routePath}: missing meta[name="twitter:description"]`);
  }

  const structuredDataRaw = extractStructuredData(html);
  if (!structuredDataRaw) {
    errors.push(`${routePath}: missing #gameye-docs-structured-data JSON-LD`);
  } else {
    try {
      const parsed = JSON.parse(structuredDataRaw);
      if (parsed['@context'] !== 'https://schema.org') {
        errors.push(`${routePath}: invalid JSON-LD @context`);
      }
    } catch {
      errors.push(`${routePath}: invalid JSON-LD (failed to parse)`);
    }
  }
}

if (errors.length > 0) {
  console.error('SEO checks failed:');
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

console.log(`SEO checks passed for ${checkedPages} canonical HTML pages (${htmlFiles.length} total files).`);
