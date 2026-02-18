#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const docsRoot = path.resolve(process.cwd(), 'src/content/docs');

const bannedPatterns = [
  'Legacy content could not be extracted automatically for this page.',
  '_Legacy migration generated file._',
  '_GAM-15 curated migration page._',
  'Migrated from legacy URL:',
  'Migrated from legacy Archbee docs path',
  'Coming soon.',
];

function walkDocs(dirPath) {
  const files = [];
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const nextPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkDocs(nextPath));
      continue;
    }

    if (entry.name.endsWith('.mdx')) {
      files.push(nextPath);
    }
  }
  return files;
}

function getWordCount(body) {
  return (body.match(/\b\w+\b/g) ?? []).length;
}

function normalizeTitle(title) {
  return title.toLowerCase().replace(/\s+/g, ' ').trim();
}

if (!fs.existsSync(docsRoot)) {
  console.error(`Docs directory not found: ${docsRoot}`);
  process.exit(1);
}

const files = walkDocs(docsRoot);
const errors = [];
const warnings = [];
const titleToFiles = new Map();

for (const filePath of files) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const relPath = path.relative(process.cwd(), filePath);

  const frontmatterMatch = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!frontmatterMatch) {
    errors.push(`${relPath}: missing frontmatter block`);
    continue;
  }

  const frontmatter = frontmatterMatch[1];
  const titleMatch = frontmatter.match(/^title:\s*(.+)$/m);
  const descriptionMatch = frontmatter.match(/^description:\s*(.+)$/m);

  if (!titleMatch) {
    errors.push(`${relPath}: missing title frontmatter`);
    continue;
  }

  if (!descriptionMatch) {
    errors.push(`${relPath}: missing description frontmatter`);
  }

  const title = titleMatch[1].replace(/^['"]|['"]$/g, '').trim();
  if (title.length === 0) {
    errors.push(`${relPath}: empty title`);
  }

  if (/^untitled$/i.test(title)) {
    errors.push(`${relPath}: title cannot be "Untitled"`);
  }

  const normalizedTitle = normalizeTitle(title);
  if (!titleToFiles.has(normalizedTitle)) {
    titleToFiles.set(normalizedTitle, []);
  }
  titleToFiles.get(normalizedTitle).push(relPath);

  for (const phrase of bannedPatterns) {
    if (raw.includes(phrase)) {
      errors.push(`${relPath}: contains banned placeholder text -> ${phrase}`);
    }
  }

  const body = raw.slice(frontmatterMatch[0].length).trim();
  const words = getWordCount(body);

  // Non-index docs should have enough body content to be useful.
  if (!relPath.endsWith('/index.mdx') && words < 20) {
    errors.push(`${relPath}: too short (${words} words), expected at least 20`);
  }

  if (!relPath.endsWith('/index.mdx') && words < 50) {
    warnings.push(`${relPath}: low content depth (${words} words)`);
  }
}

for (const [title, paths] of titleToFiles.entries()) {
  if (paths.length > 1) {
    errors.push(`duplicate title "${title}" used by: ${paths.join(', ')}`);
  }
}

if (warnings.length > 0) {
  console.log('Docs quality warnings:');
  for (const warning of warnings) {
    console.log(`- ${warning}`);
  }
}

if (errors.length > 0) {
  console.error('Docs quality checks failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(`Docs quality checks passed for ${files.length} docs pages.`);
