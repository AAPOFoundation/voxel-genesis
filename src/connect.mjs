// Install only the local project entry for supported MCP clients.
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { C } from './copy.mjs';
import { failure } from './errors.mjs';
function readProjectFile(path) {
  let file;
  try {
    file = lstatSync(path);
  } catch (error) {
    if (error.code === 'ENOENT') return '';
    throw failure('config');
  }
  if (!file.isFile() || file.isSymbolicLink()) {
    throw failure('config');
  }
  return readFileSync(path, 'utf8');
}
function claudeConfig(path, entry) {
  let config;
  try {
    config = JSON.parse(readProjectFile(path) || '{}');
  } catch {
    throw failure('config');
  }
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw failure('config');
  }
  const servers = config.mcpServers ?? {};
  if (!servers || typeof servers !== 'object' || Array.isArray(servers)) {
    throw failure('config');
  }
  config.mcpServers = { ...servers, 'voxel-genesis': entry };
  return JSON.stringify(config, null, 2) + '\n';
}
function grokConfig(path, entry) {
  const previous = readProjectFile(path);
  // This small editor cannot distinguish table headers inside multiline TOML strings.
  if (previous.includes('"""') || previous.includes("'''")) throw failure('config');
  const lines = previous.split(/\r?\n/);
  const owned =
    /^\s*\[mcp_servers\.(?:voxel-genesis|"voxel-genesis"|'voxel-genesis')\]\s*(?:#.*)?$/;
  const table = /^\s*\[/;
  let start = - 1;
  let end = lines.length;
  for (let i = 0; i < lines.length; i++) {
    if (owned.test(lines[i])) {
      if (start >= 0) {
        throw failure('config');
      }
      start = i;
    } else if (start >= 0 && end === lines.length && table.test(lines[i])) {
      end = i;
    } else if (/voxel-genesis/.test(lines[i]) && table.test(lines[i])) {
      throw failure('config');
    }
  }
  // Refuse alternate inline/dotted definitions instead of creating conflicting TOML.
  if (start < 0 && /^\s*(?:mcp_servers\b|["']?voxel-genesis["']?\s*=)/m.test(previous)) {
    throw failure('config');
  }
  const replacement = [
    '[mcp_servers.voxel-genesis]',
    'command = ' + JSON.stringify(entry.command),
    'args = ' + JSON.stringify(entry.args),
    'enabled = true',
    ''
  ];
  if (start >= 0) {
    lines.splice(start, end - start,...replacement);
  } else {
    lines.push(...replacement);
  }
  return lines.join('\n');
}
/** Write project-scoped entries while preserving all unrelated settings. */
export async function connect(client = 'both', folder = process.cwd()) {
  if (!['claude', 'grok', 'both'].includes(client)) {
    throw failure('arguments');
  }
  const entry = {
    command: process.execPath,
    args: [fileURLToPath(new URL('../bin/voxel-genesis.mjs', import.meta.url)), 'mcp']
  };
  if (entry.args[0].split(/[\\/]/).includes('_npx')) {
    const { name } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    entry.command = process.platform === 'win32' ? 'cmd': 'npx';
    entry.args = ['-y', name, 'mcp'];
    if (process.platform === 'win32') entry.args.unshift('/c', 'npx');
  }
  const changes = [];
  if (client !== 'grok') {
    const path = join(folder, '.mcp.json');
    changes.push([path, claudeConfig(path, entry)]);
  }
  if (client !== 'claude') {
    const directory = join(folder, '.grok');
    if (existsSync(directory) && lstatSync(directory).isSymbolicLink()) {
      throw failure('config');
    }
    const path = join(directory, 'config.toml');
    changes.push([path, grokConfig(path, entry)]);
  }
  for (const [path, text] of changes) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text);
  }
  return { viewer: 'http://127.0.0.1:4747/', serve: C.viewerHint, next: C.nextStep };
}
