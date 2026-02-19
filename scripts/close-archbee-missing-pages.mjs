#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

const projectRoot = process.cwd();
const defaultReportPath = path.join(projectRoot, 'reports', 'parity', 'archbee-export-parity-report.json');
const defaultExportDir = path.resolve(projectRoot, '..', 'archbee-export');
const docsRoot = path.join(projectRoot, 'src', 'content', 'docs');

function parseArgs(argv) {
  const args = {
    reportPath: defaultReportPath,
    exportDir: defaultExportDir,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--report' && argv[i + 1]) {
      args.reportPath = path.resolve(argv[i + 1]);
      i += 1;
      continue;
    }
    if (token === '--export-dir' && argv[i + 1]) {
      args.exportDir = path.resolve(argv[i + 1]);
      i += 1;
      continue;
    }
  }

  return args;
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

function parseFrontmatter(raw) {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) {
    return { data: {}, body: raw.trim() };
  }

  const data = {};
  for (const line of match[1].split('\n')) {
    const pair = line.match(/^([A-Za-z0-9_-]+):\s*(.+)$/);
    if (!pair) continue;
    data[pair[1]] = pair[2].trim().replace(/^['"]|['"]$/g, '');
  }

  return {
    data,
    body: raw.slice(match[0].length).trim(),
  };
}

function normalizeWhitespace(value) {
  return decodeEntities(value)
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function yamlQuote(value) {
  return `'${String(value || '').replace(/'/g, "''")}'`;
}

function stripHtmlTags(value) {
  return decodeEntities(value)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeCurly(value) {
  return String(value || '').replace(/\{/g, '\\{').replace(/\}/g, '\\}');
}

function renderParameterGroup(title, params) {
  if (!Array.isArray(params) || params.length === 0) return '';
  const lines = [`### ${title}`];
  for (const p of params) {
    const name = decodeEntities(p.name || 'parameter');
    const type = decodeEntities(p.type || 'string');
    const kind = decodeEntities(p.kind || 'optional').toLowerCase();
    const desc = stripHtmlTags(p.description || '');
    lines.push(`- \`${name}\` (${type}, ${kind})${desc ? `: ${desc}` : ''}`);
  }
  return lines.join('\n');
}

function collectSchemaFieldNames(schemaItems = [], into = new Set()) {
  for (const item of schemaItems) {
    if (item?.name) into.add(decodeEntities(item.name));
    if (Array.isArray(item?.schema)) collectSchemaFieldNames(item.schema, into);
  }
  return into;
}

function renderResponseList(responses = []) {
  if (!Array.isArray(responses) || responses.length === 0) return '';
  const lines = ['### Responses'];
  for (const response of responses) {
    const code = decodeEntities(response.statusCode || response.code || response.name || 'response');
    const desc = stripHtmlTags(response.description || response.summary || '');
    const prefix = desc ? `- \`${code}\`: ${desc}` : `- \`${code}\``;
    lines.push(prefix);

    const schemaFields = collectSchemaFieldNames(response.schema || []);
    if (schemaFields.size > 0) {
      lines.push(`  - fields: ${[...schemaFields].join(', ')}`);
    }
  }
  return lines.join('\n');
}

function normalizeCodeLanguage(value) {
  const language = String(value || '').toLowerCase();
  if (language === 'linux' || language === 'curl' || language === 'shell') return 'bash';
  if (/^\d+$/.test(language)) return 'json';
  return language || 'txt';
}

function renderSelectedCodeBlock(group, fallbackLabel) {
  if (!group || !Array.isArray(group.languages) || group.languages.length === 0) return '';
  const selected = group.languages.find((entry) => entry.id === group.selectedLanguageId) || group.languages[0];
  const code = decodeEntities(selected.code || '').trimEnd();
  if (!code) return '';
  const language = normalizeCodeLanguage(selected.language || fallbackLabel);
  return `\`\`\`${language}\n${code}\n\`\`\``;
}

function renderApiPayload(api, fallbackTitle) {
  const data = api?.data || api || {};
  const name = escapeCurly(decodeEntities(data.name || fallbackTitle || 'API Endpoint'));
  const method = decodeEntities(data.method || 'GET').toUpperCase();
  const url = decodeEntities(data.url || '');
  const description = escapeCurly(stripHtmlTags(data.description || ''));
  const request = data.request || {};

  const lines = [`## ${name}`];
  if (url) {
    lines.push('```http');
    lines.push(`${method} ${url}`);
    lines.push('```');
  }
  if (description) lines.push(description);

  const paramSections = [
    renderParameterGroup('Path Parameters', request.pathParameters),
    renderParameterGroup('Query Parameters', request.queryParameters),
    renderParameterGroup('Header Parameters', request.headerParameters),
    renderParameterGroup('Body Parameters', request.bodyDataParameters),
    renderParameterGroup('Form Data Parameters', request.formDataParameters),
  ].filter(Boolean);
  if (paramSections.length > 0) lines.push(paramSections.join('\n\n'));

  const responseSection = renderResponseList(data.responses || data.results || []);
  if (responseSection) lines.push(responseSection);

  const exampleCode = renderSelectedCodeBlock(data.examples, 'bash');
  if (exampleCode) {
    lines.push('### Example');
    lines.push(exampleCode);
  }

  return lines.join('\n\n').trim();
}

function renderApiMethodV2Json(rawJson, fallbackTitle) {
  try {
    const parsed = JSON.parse(decodeEntities(rawJson));
    const text = renderApiPayload(parsed, fallbackTitle);
    return text || '';
  } catch {
    return '';
  }
}

function transformHintBlocks(markdown) {
  return markdown.replace(/<hint\s+type="([^"]+)"\s*>([\s\S]*?)<\/hint>/gi, (_, type, inner) => {
    const label = String(type || 'info').toUpperCase();
    const clean = stripHtmlTags(inner);
    return `> **${label}:** ${clean}`;
  });
}

function transformApiMethodBlocks(markdown, fallbackTitle) {
  return markdown.replace(/<ApiMethodV2\s+data="([\s\S]*?)">\s*<\/ApiMethodV2>/gi, (_, dataString) => {
    const rendered = renderApiMethodV2Json(dataString, fallbackTitle);
    return rendered || `## ${fallbackTitle}`;
  });
}

function transformLegacyMdx(body, title) {
  let output = decodeEntities(body);

  output = transformHintBlocks(output);
  output = transformApiMethodBlocks(output, title);

  output = output.replace(/<[^>]+>/g, ' ');
  output = output.replace(/^###\s+\*\*(.+?)\*\*\s*$/gm, '### $1');
  output = output.replace(/^##\s+\*\*(.+?)\*\*\s*$/gm, '## $1');
  output = output.replace(/^#\s+\*\*(.+?)\*\*\s*$/gm, '# $1');
  output = output.replace(/\*\*([^*]+?)\s+\*\*/g, '**$1**');
  output = output.replace(/\n{3,}/g, '\n\n');

  output = normalizeWhitespace(output);
  return output || 'No additional content was included in the Archbee export for this page.';
}

function routeToFile(route) {
  const clean = String(route || '/').replace(/\/+/g, '/').replace(/^\/+|\/+$/g, '');
  if (!clean) return path.join(docsRoot, 'index.mdx');
  return path.join(docsRoot, `${clean}.mdx`);
}

function chooseTargetRoute(expectedRoutes) {
  if (!Array.isArray(expectedRoutes) || expectedRoutes.length === 0) return null;
  const filtered = expectedRoutes.filter((route) => route !== '/api/reference');
  return filtered[0] || expectedRoutes[0] || null;
}

async function main() {
  const { reportPath, exportDir } = parseArgs(process.argv);
  await fs.access(reportPath);
  await fs.access(exportDir);

  const report = JSON.parse(await fs.readFile(reportPath, 'utf8'));
  const missing = Array.isArray(report.missingInDocs) ? report.missingInDocs : [];

  const created = [];
  const skipped = [];

  for (const entry of missing) {
    const exportRelPath = entry.exportRelPath;
    const sourcePath = path.join(exportDir, exportRelPath);
    const targetRoute = chooseTargetRoute(entry.expectedRoutes);

    if (!targetRoute) {
      skipped.push({ exportRelPath, reason: 'no-expected-route' });
      continue;
    }

    const targetPath = routeToFile(targetRoute);
    try {
      await fs.access(targetPath);
      skipped.push({ exportRelPath, reason: 'target-exists', targetRoute });
      continue;
    } catch {
      // target path does not exist, continue
    }

    const raw = await fs.readFile(sourcePath, 'utf8');
    const { data, body } = parseFrontmatter(raw);
    const title = decodeEntities(String(data.title || entry.title || path.basename(exportRelPath, '.mdx')).trim());

    let pageBody = '';
    try {
      const parsed = JSON.parse(body.trim());
      if (parsed && String(parsed.type || '').includes('api')) {
        pageBody = renderApiPayload(parsed, title);
      } else {
        pageBody = transformLegacyMdx(body, title);
      }
    } catch {
      pageBody = transformLegacyMdx(body, title);
    }

    const description = `Legacy Archbee documentation page for ${title}.`;
    const content = `---\ntitle: ${yamlQuote(title)}\ndescription: ${yamlQuote(description)}\n---\n\n${pageBody}\n`;

    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, content, 'utf8');
    created.push({
      exportRelPath,
      targetRoute,
      targetFile: path.relative(projectRoot, targetPath).replace(/\\/g, '/'),
    });
  }

  console.log(`Missing pages requested: ${missing.length}`);
  console.log(`Created pages: ${created.length}`);
  console.log(`Skipped pages: ${skipped.length}`);

  if (created.length > 0) {
    console.log('Created:');
    for (const item of created) {
      console.log(`- ${item.targetRoute} -> ${item.targetFile} (from ${item.exportRelPath})`);
    }
  }

  if (skipped.length > 0) {
    console.log('Skipped:');
    for (const item of skipped) {
      console.log(`- ${item.exportRelPath}: ${item.reason}${item.targetRoute ? ` (${item.targetRoute})` : ''}`);
    }
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
