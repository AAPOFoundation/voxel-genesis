// Frozen check for pkg/undo-fast: world_undo must skip the full replay for builds made here,
// yet match a replay of the saved log. Run: node tests/engine-undo.mjs
import { readFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { resolve } from 'node:path';
const failures = [];
const notes = [];
const check = (rule, ok, detail = '') => {
  if (!ok) failures.push({ rule, detail: String(detail).replaceAll('\n', ' / ') });
};
mkdirSync('.agent-work/engine-undo', { recursive: true });
const home = () => mkdtempSync(resolve('.agent-work/engine-undo/run-'));
process.env.VOXEL_GENESIS_HOME = home();
process.env.VOXEL_GENESIS_PORT = '0';
process.env.VOXEL_GENESIS_NO_LOG = '1';
delete process.env.VOXEL_GENESIS_KIT;
const { createToolSession } = await import('../src/session.mjs');
const { hash } = await import('../src/core/codec.mjs');
const { createCore } = await import('../src/core/index.mjs');
import { createRequire } from 'node:module';
const E = createRequire(import.meta.url)('../vendor/voxel-engine.js');
const session = h => createToolSession({ home: h });
const BLOCKS = ['rock', 'brick', 'earth', 'trunk', 'leaf', 'deck'];
const ops = i => [
  ['box', BLOCKS[i % BLOCKS.length], 2 + i, 1, 2 + i, 6 + i, 1 + (i % 3), 5 + i],
  ['box', BLOCKS[(i + 2) % BLOCKS.length], 20 - i, 1, 3, 22 - i, 2, 5 + i]
];
const open = (s, size) => s.call('world_open', { name: 'undo', size, seed: 3, fresh: true });
const read = s => {
  const rows = readFileSync(s.logPath, 'utf8').trim().split('\n');
  const [header, ...lines] = rows.map(x => JSON.parse(x));
  return { header, lines };
};
const blocks = w => w.cells.reduce((n, id) => n + Number(id !== 0), 0);
const shape = w => [hash(w), w.rev, blocks(w), JSON.stringify(w.life),
  JSON.stringify(w.movers ?? null)].join('|');
const fresh = s => {
  const { header, lines } = read(s);
  return createCore(E).replay(header, lines).world;
};
const same = (rule, s, label) => {
  const a = shape(s.world), b = shape(fresh(s));
  check(rule, a === b, label + ': ' + a + ' vs ' + b);
};
const median = list => [...list].sort((a, b) => a - b)[list.length >> 1];

// Cases 1, 2, 3: builds made in this session.
const h = home();
const s = session(h);
open(s, [24, 24, 16]);
for (let i = 0; i < 8; i++) s.call('world_build', { ops: ops(i) });
const replays = () => s.work.replays;
let before = replays();
s.call('world_undo', { steps: 1 });
check('undo-no-replay', replays() === before, 'undo 1 replayed');
same('undo-same', s, 'undo 1');
before = replays();
s.call('world_undo', { steps: 1 });
check('undo-no-replay', replays() === before, 'second undo 1 replayed');
same('undo-same', s, 'second undo 1');
s.call('world_build', { ops: ops(7) });
before = replays();
s.call('world_undo', { steps: 2 });
check('undo-no-replay', replays() === before, 'undo 2 replayed');
same('undo-same', s, 'undo 2');
before = replays();
s.call('world_undo', { steps: 3 });
check('undo-no-replay', replays() === before, 'undo 3 replayed');
same('undo-same', s, 'undo 3');
const { lines } = read(s);
check('undo-log', lines.filter(l => l.undo !== undefined).map(l => JSON.stringify(l)).join() ===
  '{"undo":1},{"undo":1},{"undo":2},{"undo":3}', 'log lines ' + JSON.stringify(lines.slice(-5)));
check('undo-log', readFileSync(s.logPath, 'utf8').includes('\n{"undo":3}'), 'raw undo line');
const t = session(h);
t.call('world_open', { name: 'undo' });
check('undo-reload', hash(t.world) === hash(s.world) && t.world.rev === s.world.rev,
  'reload ' + hash(t.world) + ' vs ' + hash(s.world));

// Case 4: undo a build made by an earlier process.
const u = session(h);
u.call('world_open', { name: 'undo' });
const w0 = hash(u.world);
u.call('world_build', { ops: ops(1) });
u.call('world_undo', { steps: 1 });
check('undo-old', hash(u.world) === w0, 'undo own after reopen');
u.call('world_undo', { steps: 1 });
same('undo-old', u, 'undo of an earlier process build');

// Case 5: too many steps refused.
let refused = false;
try {
  const r = u.call('world_undo', { steps: 3 });
  refused = /history/i.test(String(r));
} catch (error) {
  refused = /history/i.test(String(error.message ?? error)) || error.code === 'history';
}
check('undo-history', refused, 'steps 3 not refused as history');

// Case 6: info only.
const p = session(home());
open(p, [48, 48, 32]);
for (let i = 0; i < 8; i++) p.call('world_build', { ops: ops(i) });
const times = [];
for (let i = 0; i < 5; i++) {
  const a = performance.now();
  p.call('world_undo', { steps: 1 });
  times.push(performance.now() - a);
  p.call('world_build', { ops: ops(i) });
}
notes.push('median undo 1 on 48x48x32 after 8 builds: ' + median(times).toFixed(1) + ' ms');

for (const note of notes) console.log('info ' + note);
for (const failure of failures) console.log('FAIL ' + failure.rule + ': ' + failure.detail);
console.log('engine-undo: ' + failures.length + ' failures');
process.exitCode = failures.length ? 1 : 0;
