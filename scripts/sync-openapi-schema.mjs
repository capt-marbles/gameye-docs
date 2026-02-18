#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const sourceArg = process.argv.find((arg) => arg.startsWith('--source='));
const versionArg = process.argv.find((arg) => arg.startsWith('--version='));

const defaultSourceUrl = 'https://api.production-gameye.gameye.net/openapi.yaml';
const sourceUrl = sourceArg?.split('=')[1] || process.env.OPENAPI_SOURCE || defaultSourceUrl;
const versionLabel = versionArg?.split('=')[1] || process.env.OPENAPI_DOC_VERSION || 'v1';

const schemaDir = path.join(projectRoot, 'schemas', 'openapi');
const publicDir = path.join(projectRoot, 'public', 'openapi');

const schemaFileName = `gameye-session-api-${versionLabel}.yaml`;
const schemaFilePath = path.join(schemaDir, schemaFileName);
const publicVersionedPath = path.join(publicDir, schemaFileName);
const publicLatestPath = path.join(publicDir, 'openapi.yaml');
const manifestPath = path.join(schemaDir, 'manifest.json');

function inferOpenAPIVersion(specText) {
  const openapiMatch = specText.match(/^openapi\s*:\s*['"]?([^'"\n]+)['"]?/m);
  const swaggerMatch = specText.match(/^swagger\s*:\s*['"]?([^'"\n]+)['"]?/m);
  return openapiMatch?.[1] || swaggerMatch?.[1] || 'unknown';
}

function inferInfoVersion(specText) {
  const infoBlock = specText.match(/^info\s*:[\s\S]*?(?=^\S|\Z)/m);
  if (!infoBlock) return 'unknown';

  const versionMatch = infoBlock[0].match(/\n\s*version\s*:\s*['"]?([^'"\n]+)['"]?/);
  return versionMatch?.[1] || 'unknown';
}

async function fetchSchema(primaryUrl) {
  const fallbackUrls = [
    primaryUrl,
    'https://api.gameye.io/openapi.yaml',
    'https://api.sandbox-gameye.gameye.net/openapi.yaml',
  ].filter((value, index, arr) => arr.indexOf(value) === index);

  const errors = [];

  for (const url of fallbackUrls) {
    try {
      const response = await fetch(url, {
        headers: {
          'user-agent': 'GameyeOpenAPISync/1.0',
          accept: 'application/yaml, text/yaml, text/plain, */*',
        },
      });

      if (!response.ok) {
        errors.push(`${url}: HTTP ${response.status}`);
        continue;
      }

      return { schemaText: await response.text(), resolvedSourceUrl: url };
    } catch (error) {
      errors.push(`${url}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error(`Failed to download OpenAPI schema. Attempts: ${errors.join(' | ')}`);
}

async function main() {
  const { schemaText, resolvedSourceUrl } = await fetchSchema(sourceUrl);
  const checksum = createHash('sha256').update(schemaText).digest('hex');
  const fetchedAt = new Date().toISOString();

  await mkdir(schemaDir, { recursive: true });
  await mkdir(publicDir, { recursive: true });

  await writeFile(schemaFilePath, schemaText, 'utf8');
  await writeFile(publicVersionedPath, schemaText, 'utf8');
  await writeFile(publicLatestPath, schemaText, 'utf8');

  const manifest = {
    sourceUrl: resolvedSourceUrl,
    requestedSourceUrl: sourceUrl,
    fetchedAt,
    versionLabel,
    openapiVersion: inferOpenAPIVersion(schemaText),
    apiVersion: inferInfoVersion(schemaText),
    sha256: checksum,
    files: {
      schema: path.relative(projectRoot, schemaFilePath),
      publicVersioned: path.relative(projectRoot, publicVersionedPath),
      publicLatest: path.relative(projectRoot, publicLatestPath),
    },
  };

  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  console.log(`OpenAPI schema synced from: ${sourceUrl}`);
  console.log(`Version label: ${versionLabel}`);
  console.log(`OpenAPI version: ${manifest.openapiVersion}`);
  console.log(`API version: ${manifest.apiVersion}`);
  console.log(`SHA256: ${checksum}`);
  console.log(`Wrote: ${path.relative(projectRoot, schemaFilePath)}`);
  console.log(`Wrote: ${path.relative(projectRoot, publicVersionedPath)}`);
  console.log(`Wrote: ${path.relative(projectRoot, publicLatestPath)}`);
  console.log(`Wrote: ${path.relative(projectRoot, manifestPath)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
