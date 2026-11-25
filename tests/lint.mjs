// Check source limits, copy, catalogue names and local-only boundaries.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { SERVER_INSTRUCTIONS, TOOL_COPY, PROTOCOL } from '../src/copy.mjs';
import { OPS } from '../src/core/ops.mjs';
import { BLOCKS } from '../src/core/palette.mjs';
import { PREFABS } from '../src/core/prefabs.mjs';
import { town } from '../src/games/town.mjs';
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { checkKitData, checkKitWords, banned, spelling } from '../scripts/kit-lint.mjs';
import { createKitFiles } from '../src/kit-files.mjs';
import { EFFECTS, OPERATORS, KIT_OPS } from '../src/kit/kinds.mjs';
import { INPUT_OPS } from '../src/kit/inputs.mjs';
import { checkKitDocs } from './kit-bundles.mjs';
const failures = [];
const check = (rule, ok, detail = '') => {
  if (!ok) {
    failures.push({ rule, detail });
  }
};
const read = p => readFileSync(p, 'utf8');
const walk = (p = '.') => readdirSync(p, { withFileTypes: true }).flatMap(
  e => ['.git', '.agent-work', 'docs'].includes(e.name) ? []:
  e.isDirectory() ? walk(p + '/' + e.name): [p + '/' + e.name]
);
const files = walk();
const pkg = JSON.parse(read('package.json'));
check('package-version', pkg.version === PROTOCOL.version, 'package and protocol versions');
check(
  'no-deps',
  !['dependencies', 'devDependencies', 'optionalDependencies'].some(
    k => Object.hasOwn(pkg, k)
  ) && !Object.keys(pkg.scripts || {}).some(k => /install/.test(k)) &&
  pkg.engines?.node === '>=20',
  'package'
);
check(
  'no-deps',
  !existsSync('node_modules') && !files.some(
    p => /(lock\.json|lock\.yaml|yarn\.lock)$/.test(p)
  ),
  'install artefacts'
);
for (const p of files.filter(p => /^\.\/(src|bin|viewer|scripts|tests)\//.test(p))) {
  const lines = read(p).split('\n');
  check('size-caps', lines.length - 1 <= 400, p);
  for (let index = 0; index < lines.length; index++) {
    check('line-length', lines[index].length <= 100, p + ':' + (index + 1));
  }
}
check(
  'size-caps',
  files.length <= 144 && files.reduce((n, p) => n + statSync(p).size, 0) <= 900 * 1024,
  'files ' + files.length
);
check(
  'vendor-pin',
  createHash('sha256').update(readFileSync('vendor/voxel-engine.js')).digest('hex') === JSON.parse(
    read('vendor/VENDOR.json')
  ).sha256,
  'vendor bytes'
);
// no-leaks: no keys, secret files, emails, personal paths or public IPs in shipped files.
const skip = ['.git', '.agent-work', 'node_modules', '.grok', '.mcp.json', 'voxel-kit'];
const all = (p = '.') => readdirSync(p, { withFileTypes: true }).flatMap(e => skip.includes(e.name)
  ? []: e.isDirectory() ? all(p + '/' + e.name): [p + '/' + e.name]);
const leaks = [
  /AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_\w{20}|AIza[\w-]{35}|xox[abpr]-\w{8}/,
  /sk-[\w-]{20,}|xai-\w{20,}|(sk|pk|rk)_live_\w{8}|whsec_\w{8}|eyJ[\w-]{10,}\.eyJ/,
  /-----BEGIN [A-Z ]*PRIVATE KEY/, /[\w.+-]+@[\w-]+\.[a-z]{2,}/i,
  /[A-Za-z]:[\\/]+Users[\\/]|\/Users\/[a-z]|\/home\/[a-z]/,
  /(api[_-]?key|secret|passw(or)?d|token)["' ]*[:=] *["'][^"' ]{8,}/i,
  /\b(?!127\.0\.0\.1\b)(\d{1,3}\.){3}\d{1,3}\b/
];
for (const p of all()) {
  check('no-leaks', !/(^|\/)(\.env[^/]*|id_rsa[^/]*|[^/]+\.(pem|key|p12))$/.test(p), p);
  if (/\.(jpe?g|png|gif|webp|tgz)$/i.test(p)) continue;
  const text = read(p), hit = leaks.find(r => r.test(text));
  check('no-leaks', !hit, p + ' ' + hit);
}
const copy = existsSync('src/copy.mjs') ? read('src/copy.mjs'):
'';
check('copy-home', copy.includes('COPY-DRAFT'), 'copy module');
const tools = TOOL_COPY;
check(
  'tool-caps',
  tools.length === 4 && tools.every(
    t => /^world_[a-z]+$/.test(t.name) && t.description.length <= (
      t.name === 'world_build' ? 760: t.name === 'world_open' ? 224: 160
    )
  ),
  'names and descriptions'
);
const schemas = s => {
  if (s && typeof s === 'object') {
    if (s.type === 'object') {
      check('tool-caps', s.additionalProperties === false, 'object schema');
    }
    for (const v of Object.values(s)) {
      schemas(v);
    }
  }
};
tools.forEach(t => schemas(t.inputSchema));
check(
  'tool-budget',
  Buffer.byteLength(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { tools } })) +
  Buffer.byteLength(SERVER_INSTRUCTIONS) <= 2800,
  'instructions and manifest'
);
const documentation = read('README.md') + '\n' + TOOL_COPY.map(tool => tool.description).join(
  '\n'
);
for (const match of documentation.matchAll(/\bworld_[a-z]+\b/g)) {
  check('doc-names', tools.some(tool => tool.name === match[0]), match[0]);
}
const namedArgument = /\["(box|line|paint|cover|hill|drop|stamp|scatter|car|pet)",\s*"([^"]+)"/g;
for (const [, op, name] of documentation.matchAll(namedArgument)) {
  const blockExists = BLOCKS.some(block => block.name === name);
  const prefabExists = Object.hasOwn(PREFABS, name);
  const known = op === 'stamp' ? prefabExists
    : op === 'scatter' ? blockExists || prefabExists : blockExists;
  check('doc-names', known, op + ' ' + name);
}
for (const match of documentation.matchAll(/Ground: ([a-z ]+)\./g)) {
  for (const name of match[1].split(' ')) {
    check('doc-names', BLOCKS.some(block => block.name === name && block.fixed), name);
  }
}
for (const match of documentation.matchAll(/\[(?:"|')?([a-z]+(?:\|[a-z]+)*)(?:"|')?,/g)) {
  for (const name of match[1].split('|')) {
    check('doc-names', ['rep', ...EFFECTS, ...OPERATORS, ...KIT_OPS, ...Object.keys(INPUT_OPS)]
      .includes(name) ||
      Object.hasOwn({ ...OPS, ...town.ops }, name), name);
  }
}
for (
  const [label, names] of [
    ['Blocks', BLOCKS.map(block => block.name)],
    ['Prefabs', Object.keys(PREFABS)]
  ]
) {
  const line = documentation.match(new RegExp(label + ': ([^\\n]+)'))?.[1] ||
  '';
  for (const match of line.matchAll(/`([a-z]+)`/g)) {
    check('doc-names', names.includes(match[1]), match[1]);
  }
}
// Examine prose values, not protocol identifiers, CSS syntax or JavaScript operators.
const prose = p => p.endsWith('.html') ? read(p).replace(/<style>[\s\S]*?<\/style>/g, '').match(
  />([^<>]+)</g
)?.join(' ') || '': p.endsWith('copy.mjs') ? read(p).split('/*protocol*/')[0]:
p.endsWith('README.md') ? read(p).replace(/`{3}[\s\S]*?`{3}/g, ''):
'';
for (
  const p of files.filter(
    p => p === './src/copy.mjs' || p.startsWith('./viewer/') ||
    p === './README.md' || p.startsWith('./fixtures/')
  )
) {
  const text = read(p);
  check('banned-words', !banned.test(text), p);
  if (!p.startsWith('./fixtures/')) {
    const text = prose(p);
    check('no-dash-bang', !/[\u2013\u2014!]/.test(text), p);
    check('au-spelling', !spelling.test(text), p);
    check(
      'no-promises',
      !/\b(guarantee|guaranteed|always works|perfect)\b/i.test(text),
      p
    );
  }
}
for (const p of files.filter(p => /^\.\/(src|bin|viewer|scripts)\//.test(p))) {
  const text = read(p);
  check(
    'copy-home',
    ![...text.matchAll(/throw new \w+\(([^;\n]*)/g)].some(m => /^['"`]/.test(m[1])),
    p + ' thrown copy'
  );
  if (p.includes('/viewer/') && p.endsWith('.mjs')) {
    check(
      'copy-home',
      !/(textContent|innerText)\s*=\s*['"`][A-Za-z]/.test(text),
      p + ' text node'
    );
  }
  check(
    'localhost-only',
    (
      p === './scripts/check.mjs' || !new RegExp(
        "(?:from\\s*|import\\s*\\()['\"](?:node:)?(?:https" +
        "|net|dns|dgram|tls|child_process)['\"]",
        ""
      ).test(text)
    ),
    p + ' imports'
  );
  check(
    'localhost-only',
    ![...text.matchAll(/https?:\/\/([^/\s'"`]+)/g)].some(
      m => !/^127\.0\.0\.1(?::|$)/.test(m[1]) && !/^localhost(?::|$)/.test(m[1])
    ),
    p + ' URL'
  );
  check(
    'localhost-only',
    ![...text.matchAll(/\.listen\(([^\n]*)/g)].some(m => !m[1].includes("'127.0.0.1'")),
    p + ' bind'
  );
  check(
    'localhost-only',
    !/(?:fetch|WebSocket|XMLHttpRequest)\(\s*['"](?!\/)/.test(text),
    p + ' requests'
  );
  if (p.includes('/core/') || p.includes('/games/') || p.includes('/kit/')) {
    check(
      'core-pure',
      !/(?:node:|Math\.(?:sin|cos|pow|exp|random)\b|\bDate\b)/.test(text),
      p
    );
  }
}
check('kit-budget', tools.length === 4 && tools[0].inputSchema.properties.kit &&
  tools[2].inputSchema.properties.of &&
  Buffer.byteLength(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { tools } })) +
  Buffer.byteLength(SERVER_INSTRUCTIONS) <= 2800 &&
  tools.every(tool => !/\[(?:"?)(kit|edit|cut|do|end|say)[,\]]/.test(tool.description)),
  'kit discovery schema and compact manifest');
const kitNames = ['kinds', 'canon', 'expr', 'parts', 'view', 'effects', 'play', 'advise'];
check('kit-pure', kitNames.every(name => existsSync('src/kit/' + name + '.mjs')) &&
  existsSync('src/kit-files.mjs'), 'kit modules present');
for (const name of kitNames) {
  const path = 'src/kit/' + name + '.mjs';
  if (existsSync(path)) check('kit-pure', !/node:|\bprocess\b|\bfetch\b/.test(read(path)), path);
  if (existsSync(path)) check('kit-data',
    !/\b(acquire|renovate|redevelop|divest|insure|rival|quarter)\b/.test(read(path)), path);
}
mkdirSync('.agent-work/kit-lint', { recursive: true });
const tracePath = resolve('.agent-work/kit-lint/modules.txt');
const traceRun = spawnSync(process.execPath,
  ['--experimental-loader', './tests/boot-loader.mjs', 'bin/voxel-genesis.mjs', 'mcp'], {
    input: '{"jsonrpc":"2.0","id":1,"method":"tools/list"}\n', encoding: 'utf8',
    env: { ...process.env, VOXEL_GENESIS_TRACE: tracePath,
      VOXEL_GENESIS_HOME: resolve('.agent-work/kit-lint') }
  });
check('kit-pure', traceRun.status === 0 && existsSync(tracePath) &&
  !/\/kit\/|kit-files|kit-copy/.test(read(tracePath)), 'no kit imports before a tool call');
check('kit-copy', existsSync('src/kit-copy.mjs') &&
  read('src/kit-copy.mjs').includes('COPY-DRAFT'), 'kit copy module');
if (existsSync('src/kit-copy.mjs')) {
  const text = read('src/kit-copy.mjs').split('/*protocol*/')[0];
  check('kit-copy', !banned.test(text) && !spelling.test(text) &&
    !/[\u2013\u2014!]/.test(text), 'kit wording');
}
if (existsSync('viewer/kit-panel.mjs')) check('kit-copy',
  !/(textContent|innerText)\s*=\s*['"`]/.test(read('viewer/kit-panel.mjs')), 'kit panel copy');
const bundleFiles = files.filter(path => /^\.\/kit\/.*\.json$/.test(path));
check('kit-data', bundleFiles.length > 0, 'built-in bundles exist');
const bundleIds = new Set();
for (const path of bundleFiles) {
  try { checkKitData(path, check, undefined, bundleIds); }
  catch (error) { check('kit-data', false, path + ': ' + error.message); }
}
check('kit-data', createKitFiles().check().length === 0, 'built-in diagnostics');
for (const path of files.filter(path => /^\.\/(kit|fixtures\/kit)\/.*\.json$/.test(path))) {
  try { checkKitWords(path, check); }
  catch (error) { check('kit-words', false, path + ': ' + error.message); }
}
const html = existsSync('viewer/index.html') ? read('viewer/index.html'):
'';
await checkKitDocs(check);
check(
  'viewer-static',
  html.includes('lang="en-AU"') && html.includes('name="viewport"') &&
  html.includes("default-src 'self'") && html.includes('<noscript>') &&
  /min-height:\s*44px/.test(html) && ![...html.matchAll(/<button\b([^>]*)>/g)].some(
    m => !m[1].includes('aria-label')
  ),
  'HTML'
);
for (const f of failures) {
  console.log('FAIL ' + f.rule + ': ' + f.detail);
}
console.log('lint: ' + failures.length + ' failures');
process.exitCode = failures.length ? 1: 0;
