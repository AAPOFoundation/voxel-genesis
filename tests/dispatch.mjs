// Check dispatch 3 behaviour, project configs, fixed-rule reviews and camera bounds.
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve, join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { createToolSession } from '../src/session.mjs';
import { TOOL_COPY, SERVER_INSTRUCTIONS, PROTOCOLS } from '../src/copy.mjs';
import { connect } from '../src/connect.mjs';
import { hash } from '../src/core/codec.mjs';
import { createCore } from '../src/core/index.mjs';
import { createPlayer } from '../viewer/player.mjs';
import { fitCamera, worldHeight } from '../viewer/camera.mjs';
import { CachedCanvasRenderer } from '../viewer/canvas-renderer.mjs';
import { weeklyReview } from '../scripts/weekly-review.mjs';
import { suitesForPaths } from '../scripts/check.mjs';
import { analyseUsage, fixtureTarget } from '../scripts/usage-data.mjs';
mkdirSync('.agent-work/dispatch-tests', { recursive: true });
assert.deepEqual(suitesForPaths([]), []);
assert.deepEqual(suitesForPaths(['bin/voxel-genesis.mjs']), ['lint', 'invariants']);
assert.deepEqual(suitesForPaths(['README.md']), ['lint', 'taste']);
assert.deepEqual(suitesForPaths(['docs/DESIGN.md']), ['lint']);
assert.deepEqual(suitesForPaths(['vendor/voxel-engine.js']),
  ['lint', 'invariants', 'engine', 'taste']);
const home = () => mkdtempSync(resolve('.agent-work/dispatch-tests/run-'));
const engine = createRequire(import.meta.url)('../vendor/voxel-engine.js');
const core = createCore(engine);
const session = createToolSession({ home: home() });
const opened = session.call('world_open', { size: [24, 24, 24] });
assert.equal(opened.viewer, 'run serve');
assert.match(
  session.call('world_build', { ops: [['stamp', 'house', 2, 2, 0]] }),
  /changed=[1-9]/
);
assert.match(
  session.call('world_build', { ops: [['stamp', 'house', 2, 2, 0]] }),
  /changed=0/
);
assert.match(
  session.call('world_build', { ops: [['car', 'sun', 1, 1, 8, 8]] }),
  /life=1/
);
assert.match(session.call('world_undo'), /^rev=\d+ hash=\w+ count=\d+ fell=0/);
const before = session.state();
assert.throws(
  () => session.call(
    'world_build',
    { ops: [['paint', 'grass', 0, 0, 1, 1], ['box', 'wood', 1, 1, 1, 1, 1, 1]] }
  ),
  /ops\[1\]\.block "wood": unknown\. Use timber\./
);
assert.deepEqual(session.state(), before);
assert.throws(
  () => session.call('world_build', { ops: [['stamp', 'houes', 1, 1, 0]] }),
  /ops\[0\]\.prefab "houes": unknown\. Use house\./
);
assert.throws(
  () => session.call(
    'world_build',
    { ops: [['rep', 2, 1, 0, 0, [['stamp', 'houes', 1, 1, 0]]]] }
  ),
  /ops\[0\]\.ops\[0\]\.prefab/
);
const falling = session.call(
  'world_build',
  { ops: [['box', 'brick', 20, 6, 20, 20, 6, 20]] }
);
assert.match(falling, /fell=1.*at=ops\[0\]:20,6,20/);
const sinking = session.call(
  'world_build',
  { ops: [['paint', 'water', 21, 21, 21, 21], ['drop', 'brick', 21, 21, 1]] }
);
assert.match(sinking, /sank=1.*at=ops\[1\]:21,/);
const counts = { ...session.work };
session.call('world_look', { view: 'info' });
assert.deepEqual(session.work, counts, 'warm look does no replay, apply or tick work');
session.call(
  'world_build',
  { ops: [['paint', 'grass', 0, 0, 0, 0], ['pet', 'sun', 1, 1]] }
);
assert.equal(session.work.applies - counts.applies, 2);
assert.equal(session.work.replays, counts.replays);
assert.equal(session.work.ticks - counts.ticks, 2);
const header = JSON.parse(readFileSync(session.logPath, 'utf8').split('\n')[0]);
assert.equal(header.set, 'base@3');
const baseHash = hash(session.world);
session.world.setId = 'base@1';
assert.notEqual(hash(session.world), baseHash);
session.world.setId = 'base@3';
const raw = readFileSync(session.logPath, 'utf8');
writeFileSync(session.logPath, raw.replace('base@3', 'base@9'));
assert.throws(
  () => createToolSession({ home: session.home }).call('world_open'),
  /unknown block set/
);
writeFileSync(session.logPath, raw);
assert.ok(
  Buffer.byteLength(
    JSON.stringify({ jsonrpc: '2.0', id: 1, result: { tools: TOOL_COPY } })
  ) + Buffer.byteLength(SERVER_INSTRUCTIONS) <= 2500
);
assert.ok(TOOL_COPY.every(tool => tool.annotations.openWorldHint === false));
assert.equal(TOOL_COPY[2].annotations.readOnlyHint, true);
const request = (id, method, params) => JSON.stringify(
  { jsonrpc: '2.0', id, method, params }
);
const handshake = request(1, 'initialize', { protocolVersion: 'unknown' });
for (const client of ['claude', 'grok', 'both']) {
  const folder = home();
  mkdirSync(join(folder, '.grok'));
  const other = { command: 'other', args: ['kept'] };
  writeFileSync(
    join(folder, '.mcp.json'),
    JSON.stringify({ theme: 'kept', mcpServers: { other } })
  );
  const otherToml = '# retained\n[mcp_servers.other]\ncommand = "other"\n';
  writeFileSync(join(folder, '.grok/config.toml'), otherToml);
  const result = await connect(client, folder);
  assert.equal(result.viewer, 'http://127.0.0.1:4747/');
  const claude = JSON.parse(readFileSync(join(folder, '.mcp.json')));
  assert.equal(claude.theme, 'kept');
  assert.deepEqual(claude.mcpServers.other, other);
  const grok = readFileSync(join(folder, '.grok/config.toml'), 'utf8');
  assert.ok(grok.startsWith(otherToml));
  if (client === 'claude') {
    assert.equal(grok, otherToml);
  }
  if (client === 'grok') {
    assert.equal(claude.mcpServers['voxel-genesis'], undefined);
  }
  const entry = client === 'grok' ? {
    command: JSON.parse(grok.match(/^command = (.+)$/gm).at(- 1).slice(10)),
    args: JSON.parse(grok.match(/^args = (.+)$/m)[1])
  }: claude.mcpServers['voxel-genesis'];
  const calls = [
    handshake,
    request(2, 'tools/call', { name: 'world_open', arguments: {} }),
    request(
      3,
      'tools/call',
      { name: 'world_build', arguments: { ops: [['pet', 'sun', 1, 1]] } }
    ),
    request(4, 'tools/call', { name: 'world_look', arguments: { view: 'info' } })
  ];
  const processResult = spawnSync(
    entry.command,
    entry.args,
    {
      cwd: folder,
      input: calls.join('\n') + '\n',
      encoding: 'utf8',
      env: { ...process.env, VOXEL_GENESIS_HOME: folder, VOXEL_GENESIS_PORT: '0' }
    }
  );
  assert.equal(processResult.status, 0, processResult.stderr);
  const replies = processResult.stdout.trim().split('\n').map(JSON.parse);
  assert.equal(replies.length, 4);
  assert.equal(replies[0].result.protocolVersion, PROTOCOLS[0]);
  assert.ok(replies.slice(1).every(reply => !reply.result.isError));
  const once = [readFileSync(join(folder, '.mcp.json'), 'utf8'), grok];
  await connect(client, folder);
  assert.deepEqual(
    [
      readFileSync(join(folder, '.mcp.json'), 'utf8'),
      readFileSync(join(folder, '.grok/config.toml'), 'utf8')
    ],
    once,
    'idempotent project configs'
  );
  const usage = readFileSync(join(folder, 'usage.jsonl'), 'utf8').trim().split('\n').map(
    JSON.parse
  );
  assert.equal(usage.filter(row => row.tool === 'initialize').length, 1);
  assert.ok(
    usage.every(row => Object.keys(row).join(',') === 't,door,tool,ms,in,out,err')
  );
}
const npxHome = home();
const npxPackage = join(npxHome, '_npx', 'cache', 'node_modules', 'test-package');
cpSync('src', join(npxPackage, 'src'), { recursive: true });
writeFileSync(join(npxPackage, 'package.json'), JSON.stringify({ name: 'test-package' }));
const npxConnect = await import(pathToFileURL(join(npxPackage, 'src/connect.mjs')).href);
await npxConnect.connect('claude', npxHome);
assert.deepEqual(JSON.parse(readFileSync(join(npxHome, '.mcp.json'))).mcpServers['voxel-genesis'], {
  command: process.platform === 'win32' ? 'cmd': 'npx',
  args: [...(process.platform === 'win32' ? ['/c', 'npx']: []), '-y', 'test-package', 'mcp']
});
const ambiguousHome = home();
mkdirSync(join(ambiguousHome, '.grok'));
const ambiguous = 'notes = """\n[mcp_servers.voxel-genesis]\ncommand = "kept"\n"""\n';
writeFileSync(join(ambiguousHome, '.grok/config.toml'), ambiguous);
const existingClaude = '{"mcpServers":{"other":{"command":"kept"}}}\n';
writeFileSync(join(ambiguousHome, '.mcp.json'), existingClaude);
await assert.rejects(connect('both', ambiguousHome), /cannot safely edit/);
assert.equal(readFileSync(join(ambiguousHome, '.grok/config.toml'), 'utf8'), ambiguous);
assert.equal(readFileSync(join(ambiguousHome, '.mcp.json'), 'utf8'), existingClaude);

const now = new Date('2026-11-12T12:00:00Z');
const reviewHome = home();
assert.equal(
  weeklyReview({ home: reviewHome, folder: reviewHome, now }).message,
  'no data'
);
const rows = Array.from(
  { length: 3 },
  (_, index) => (
    {
      t: now.getTime() - 10 + index,
      door: 'call',
      tool: 'world_build',
      ms: index + 1,
      in: 10,
      out: 600,
      err: 'block'
    }
  )
);
rows.push(
  { ...rows[0], t: now.getTime(), tool: 'world_look', ms: 20, out: 50, err: null }
);
writeFileSync(
  join(reviewHome, 'usage.jsonl'),
  rows.map(row => JSON.stringify(row)).join('\n') + '\n'
);
const review = weeklyReview({ home: reviewHome, folder: reviewHome, now });
const report = readFileSync(review.path, 'utf8');
assert.match(report, /Unrecovered errors: 3/);
assert.match(report, /block:3/);
assert.match(report, /600.0 \/ 400/);
assert.match(report, /Add an alias or a clearer message/);
assert.match(report, /Trim replies for world_build/);
assert.ok((report.match(/^\d+\./gm) || []).length <= 5);
rows.push({ ...rows[0], t: now.getTime() + 1, err: null });
assert.equal(analyseUsage(rows, fixtureTarget()).unrecovered, 0);
for (const name of ['tiny-garden', 'small-town', 'hill-village']) {
  const fixture = fixtureTarget(name);
  assert.equal(fixture.calls, fixture.batches.length + 2);
  let world = core.newWorld(fixture.open);
  for (const ops of fixture.batches) {
    world = core.applyBatch(world, ops).world;
  }
  for (const [width, height] of [[1240, 570], [351, 582]]) {
    for (let turn = 0; turn < 16; turn++) {
      const renderer = { world, yaw: turn * Math.PI / 8, pitch: 0.56 };
      fitCamera(renderer, width, height, 1);
      for (const x of [0, world.w]) {
        for (const z of [0, world.d]) {
          for (const y of [0, worldHeight(world)]) {
            const dx = x - renderer.focus[0];
            const dy = y - renderer.focus[1];
            const dz = z - renderer.focus[2];
            const scale = width / renderer.span;
            const horizontal = dx * Math.cos(renderer.yaw) - dz * Math.sin(renderer.yaw);
            const px = width / 2 + horizontal * scale;
            const py = height / 2 + (
              (dx * Math.sin(renderer.yaw) + dz * Math.cos(renderer.yaw)) * Math.sin(
                renderer.pitch
              ) - dy * Math.cos(renderer.pitch)
            ) * scale;
            assert.ok(px >= width * 0.039 && px <= width * 0.961);
            assert.ok(py >= height * 0.039 && py <= height * 0.961);
          }
        }
      }
    }
  }
}
const player = createPlayer(engine);
const context = new Proxy({}, { get: () => () => {} });
const canvas = {
  width: 1280,
  height: 800,
  getContext: () => context,
  ownerDocument: { createElement: () => ({ getContext: () => context }) }
};
const cachedWorld = core.newWorld();
const originalSet = cachedWorld.set;
const cache = new CachedCanvasRenderer(engine, canvas, cachedWorld);
cache.render();
cache.render();
assert.equal(cache.rebuilds, 1);
cachedWorld.set(1, 1, 1, cachedWorld.byName.brick);
cache.render();
assert.equal(cache.rebuilds, 2, 'same-operation cell changes invalidate the cache');
cache.yaw += 1;
cache.render();
assert.equal(cache.rebuilds, 3);
cache.dispose();
assert.equal(cachedWorld.set, originalSet);
const playerSession = createToolSession({ home: home() });
playerSession.call('world_open');
player.load(playerSession.state());
const ops = [['drop', 'brick', 1, 1, 3], ['pet', 'sun', 2, 2]];
playerSession.call('world_build', { ops });
player.enqueue({ rev: 1, line: { ops }, hash: playerSession.state().hash });
player.step(0.1);
player.reduced(true);
assert.equal(player.busy, false);
assert.equal(player.hash, playerSession.state().hash);
const traceHome = home();
const trace = join(traceHome, 'modules.txt');
const traced = spawnSync(
  process.execPath,
  ['--experimental-loader', './tests/boot-loader.mjs', 'bin/voxel-genesis.mjs', 'mcp'],
  {
    input: handshake + '\n' + request(2, 'tools/list') + '\n',
    encoding: 'utf8',
    env: { ...process.env, VOXEL_GENESIS_HOME: traceHome, VOXEL_GENESIS_TRACE: trace }
  }
);
assert.equal(traced.status, 0, traced.stderr);
const modules = readFileSync(trace, 'utf8').trim().split('\n');
assert.ok(modules.length <= 8, 'tool list module budget: ' + modules.length);
assert.ok(!modules.some(path => /session|core\/|voxel-engine|http\.mjs/.test(path)));
assert.equal(existsSync(join(traceHome, 'worlds')), false);
const bare = [];
const boot = [];
async function firstReply(args, input = '') {
  const start = performance.now();
  const child = spawn(
    process.execPath,
    args,
    {
      env: { ...process.env, VOXEL_GENESIS_HOME: traceHome },
      stdio: ['pipe', 'pipe', 'pipe']
    }
  );
  let elapsed;
  child.stdout.once(
    'data',
    () => {
      elapsed = performance.now() - start;
    }
  );
  child.stdin.end(input);
  await new Promise(
    (resolve, reject) => {
      child.on('error', reject);
      child.on(
        'exit',
        code => code ? reject(new Error('Boot process failed')):
        resolve()
      );
    }
  );
  assert.ok(Number.isFinite(elapsed));
  return elapsed;
}
for (let i = 0; i < 7; i++) {
  const [baseline, application] = await Promise.all([
    firstReply(['-e', 'console.log(0)']),
    firstReply(['bin/voxel-genesis.mjs', 'mcp'], handshake + '\n')
  ]);
  bare.push(baseline);
  boot.push(application);
}
const median = values => values.sort((left, right) => left - right)[3];
const ratio = median(boot) / median(bare);
writeFileSync(
  '.agent-work/boot-3.json',
  JSON.stringify(
    { modules: modules.length, bareMs: median(bare), bootMs: median(boot), ratio, bare, boot }
  )
);
assert.ok(ratio <= 3.5, 'boot ratio ' + ratio.toFixed(2));
console.log('dispatch: 0 failures');
