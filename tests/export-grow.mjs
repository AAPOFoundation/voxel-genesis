// Export/run round trips and ungrown byte pins captured on 61e3d92.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createToolSession } from '../src/session.mjs';
import { hash } from '../src/core/codec.mjs';

const work = resolve('.agent-work/export-grow');
mkdirSync(work, { recursive: true });
const home = () => mkdtempSync(join(work, 'home-'));
process.env.VOXEL_GENESIS_HOME = home();
process.env.VOXEL_GENESIS_NO_LOG = '1';
delete process.env.VOXEL_GENESIS_KIT;
const cli = (folder, ...args) => {
  const result = spawnSync(process.execPath, ['bin/voxel-genesis.mjs', ...args], {
    encoding: 'utf8', timeout: 10000,
    env: { ...process.env, VOXEL_GENESIS_HOME: folder }
  });
  assert.equal(result.status, 0, result.error?.message ?? result.stdout + result.stderr);
  return JSON.parse(result.stdout);
};
function roundTrip(s) {
  const name = s.world.name, expected = hash(s.world);
  const before = readFileSync(s.logPath);
  const out = mkdtempSync(join(work, 'out-'));
  const run = join(out, 'world.run.json'), kit = join(out, 'voxel-kit', name + '.json');
  const exported = cli(s.home, 'export', name, '--run', run, '--kit', kit);
  assert.equal(exported.hash, expected);
  assert.deepEqual(readFileSync(s.logPath), before, 'export leaves the source log unchanged');
  const target = home();
  const result = cli(target, 'run', run);
  assert.equal(result.hash, expected, 'run in a fresh home reproduces the world hash');
  const reopened = createToolSession({ home: target });
  reopened.call('world_open', { name });
  assert.equal(hash(reopened.world), expected, 'the replayed world persists');
  for (const key of ['cells', 'life', 'movers', 'feed', 'kit']) {
    assert.deepEqual(reopened.world[key], s.world[key]);
  }
  return { run: readFileSync(run), kit: readFileSync(kit), cwd: out };
}

// SHA-256 covers exact bytes, including key order and the run file's trailing newline.
const legacy = [
  ['plain', [['box', 'brick', 2, 1, 2, 4, 3, 4]],
    'f99d5975fc373151463c536ab682e91e55cc60403f267f4aea0fd4bea4e92530',
    '662b542549d17e7d474b1559f306084b0b3d75a548301cefa5cc04c380632e15'],
  ['kit', [['part', { part: 'store/coins', max: 3 }]],
    '9c17b17c4c0b84880590a46fb38999821158f3b9213f16604674106a943145fa',
    'fd08e959b02e5dc42ecbfe72b68895daa8fe2c2da4f5d85bfc6c1fcd28d7dba1'],
  ['town', [['auto']],
    '5f6ce5c7b19580dbe9148dfe2ef7c9929d5e926640a5e077dfc5d48b8146c61e',
    '8f74da5041be897310452f43c2b80b94a29aa10b7dd07ae2939bea1bf782e15f']
];
for (const [kind, ops, runPin, kitPin] of legacy) {
  const s = createToolSession({ home: home() });
  s.call('world_open', { name: 'legacy-' + kind, seed: 7, fresh: true,
    ...(kind === 'town' ? { game: 'town' } : { size: [16, 16, 16] }) });
  s.call('world_build', { ops });
  const bytes = roundTrip(s);
  for (const [file, pin] of [['run', runPin], ['kit', kitPin]]) {
    assert.equal(createHash('sha256').update(bytes[file]).digest('hex'), pin,
      kind + ' ' + file + ' bytes match 61e3d92');
  }
}

// Shifted exports retain ordered growth, moves and the surviving history after undo.
const shifted = createToolSession({ home: home() });
const shiftOpen = { name: 'shifted', size: [16, 16, 16], seed: 7, fresh: true };
const shiftOps = [['box', 'brick', 1, 1, 1, 3, 3, 3], ['stamp', 'bridge', 5, 5, 0],
  ['car', 'sun', 0, 6, 8, 9], ['pet', 'brick', 7, 12],
  ['mover', 'bob', 'tile', 3, 11], ['note', 'The bridge is ready.']];
shifted.call('world_open', shiftOpen);
shifted.call('world_build', { ops: shiftOps });
const beforeShift = hash(shifted.world);
function shiftedRoundTrip(batches) {
  const bytes = roundTrip(shifted);
  assert.deepEqual(JSON.parse(bytes.run), { open: shiftOpen, batches });
  assert.deepEqual(JSON.parse(bytes.kit).size,
    [shifted.world.w, shifted.world.d, shifted.world.h]);
}
const shiftGrow = (entry) => shifted.call('world_open', {
  name: shiftOpen.name, size: entry.grow, grow: true, shift: entry.shift
});
const firstShift = { grow: [24, 20, 18], shift: [5, 3] };
shiftGrow(firstShift);
shiftedRoundTrip([shiftOps, firstShift]);
const moves = [['move', 'bob', 9, 14]];
shifted.call('world_build', { ops: moves });
const nextShift = { grow: [28, 24, 20], shift: [2, 4] };
shiftGrow(nextShift);
shiftedRoundTrip([shiftOps, firstShift, moves, nextShift]);
shifted.call('world_undo', { steps: 1 });
shiftedRoundTrip([shiftOps, firstShift, moves]);
shifted.call('world_undo', { steps: 2 });
assert.equal(hash(shifted.world), beforeShift);
shiftedRoundTrip([shiftOps]);
const zeroShift = { grow: [16, 16, 18], shift: [0, 0] };
shiftGrow(zeroShift);
shiftedRoundTrip([shiftOps, zeroShift]);

const s = createToolSession({ home: home() });
const open = { name: 'grown', size: [16, 16, 16], seed: 7, fresh: true };
s.call('world_open', open);
const batches = [
  [['box', 'brick', 2, 1, 2, 4, 3, 4]],
  { grow: [24, 20, 18] },
  [['box', 'rock', 22, 1, 18, 23, 17, 19]],
  { grow: [28, 24, 20] },
  { grow: [32, 28, 24] },
  [['box', 'rock', 30, 1, 26, 31, 23, 27]]
];
for (const batch of batches) {
  if (Array.isArray(batch)) s.call('world_build', { ops: batch });
  else s.call('world_open', { name: open.name, size: batch.grow, grow: true });
}
assert.equal(s.world.types[s.world.get(31, 23, 27)].name, 'rock');
const bytes = roundTrip(s), exported = JSON.parse(bytes.run);
assert.deepEqual(exported.open, open, 'open keeps the original dimensions');
assert.deepEqual(exported.batches, batches, 'grow entries stay separate and ordered');
const placed = createToolSession({ home: home() });
placed.call('world_open', { name: 'grown-kit', size: [16, 16, 16], fresh: true });
placed.call('world_open', { name: 'grown-kit', size: [32, 32, 16], grow: true });
const yard = { part: 'place/yard', at: [20, 20, 30, 30] };
placed.call('world_build', { ops: [['part', yard]] });
const kitBytes = roundTrip(placed), kitRun = JSON.parse(kitBytes.run);
assert.deepEqual(JSON.parse(kitBytes.kit).size, [32, 32, 16], 'kit uses the grown size');
assert.deepEqual(kitRun.open.size, [16, 16, 16], 'kit run keeps the original open size');
assert.deepEqual(kitRun.batches, [{ grow: [32, 32, 16] }, [['part', yard]]]);
assert.deepEqual(cli(home(), 'kit', 'check', kitBytes.cwd), [], 'exported kit passes check');
const imported = createToolSession({ home: home(), cwd: kitBytes.cwd });
imported.call('world_open', { name: 'imported-kit', kit: 'grown-kit' });
assert.deepEqual([imported.world.w, imported.world.d, imported.world.h], [32, 32, 16]);
assert.deepEqual(imported.world.kit.parts, placed.world.kit.parts, 'new-space parts reopen');
console.log('export-grow: grown round trip and ungrown run/kit byte pins passed');
