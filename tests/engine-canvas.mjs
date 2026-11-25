// Frozen check for pkg/canvas: 96x96x64 worlds, swap and mirror ops.
// Run: node tests/engine-canvas.mjs
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
const json = JSON.stringify, fails = [];
const check = (rule, ok, detail = '') => {
  if (!ok) fails.push(rule + (detail ? ': ' + detail : ''));
};
mkdirSync('.agent-work/canvas', { recursive: true });
const home = () => mkdtempSync(resolve('.agent-work/canvas/run-'));
process.env.VOXEL_GENESIS_HOME = home();
process.env.VOXEL_GENESIS_PORT = '0';
process.env.VOXEL_GENESIS_NO_LOG = '1';
delete process.env.VOXEL_GENESIS_KIT;
const { createToolSession } = await import('../src/session.mjs');
const { TOOL_COPY: tools } = await import('../src/copy.mjs');
const { hash } = await import('../src/core/codec.mjs');
const { createCore } = await import('../src/core/index.mjs');
const E = createRequire(import.meta.url)('../vendor/voxel-engine.js');
const fresh = () => createToolSession({ home: home() });
const call = (s, tool, args) => {
  try { return s.call(tool, args); } catch (e) {
    if (!e.code) throw e;
    return { err: e.code, msg: e.message };
  }
};
const name = (s, x, y, z) => s.world?.types[s.world.get(x, y, z)]?.name ?? 'air';
const count = (s, block) => {
  if (!s.world) return -1;
  const id = s.world.types.findIndex(t => t?.name === block);
  return s.world.cells.reduce((n, v) => n + (v === id), 0);
};
const num = (text, key) => Number(String(text).match(new RegExp(key + '=(\\d+)'))?.[1]);
const replayHash = s => {
  const rows = readFileSync(s.logPath, 'utf8').trim().split('\n').map(x => JSON.parse(x));
  return hash(createCore(E).replay(rows[0], rows.slice(1)).world);
};

// 1. Old worlds keep their hashes; default size unchanged.
{
  const a = fresh(), r = call(a, 'world_open', { name: 'plain' });
  check('1 default size', json([a.world.w, a.world.d, a.world.h]) === '[32,32,24]');
  check('1 default hash', r.hash === 'fb543699', r.hash);
  const b = fresh();
  const q = call(b, 'world_open', { name: 'old-max', size: [48, 48, 32], fresh: true });
  check('1 old max hash', q.hash === '4228fe31', q.hash);
}

// 2. New limits: 96x96x64 opens, one past refuses and names the limits.
{
  const s = fresh(), r = call(s, 'world_open', { name: 'big', size: [160, 160, 64], fresh: true });
  check('2 opens', !r.err && json([s.world?.w, s.world?.d, s.world?.h]) === '[160,160,64]',
    json(r));
  for (const size of [[161, 8, 8], [8, 161, 8], [8, 8, 65], [7, 8, 8]]) {
    const t = fresh(), e = call(t, 'world_open', { name: 'bad', size });
    check('2 refuses ' + size, e.err === 'size' && /160, 160, 64/.test(e.msg) && !t.world, json(e));
  }
  const schema = json(tools.find(t => t.name === 'world_open').inputSchema.properties.size);
  check('2 schema names limits', /160, 160, 64/.test(schema), schema);
}

// 3. A 64-high drop settles and a 96-wide batch stays quick.
{
  const s = fresh();
  call(s, 'world_open', { name: 'drop', size: [96, 96, 64], fresh: true });
  const r = call(s, 'world_build', { ops: [['box', 'cream', 50, 63, 50, 50, 63, 50]] });
  check('3 no error', !r.err, json(r));
  check('3 fell', num(r, 'fell') === 1, r);
  check('3 landed', name(s, 50, 1, 50) === 'cream' && name(s, 50, 63, 50) === 'air');
  const ops = [];
  for (let i = 0; i < 190; i++) {
    const x = (i * 7) % 90, z = (i * 13) % 90;
    ops.push(['box', i % 2 ? 'rock' : 'cream', x, 1, z, x + 4, 1 + (i % 40), z + 4]);
  }
  const t0 = performance.now(), big = call(s, 'world_build', { ops });
  const ms = performance.now() - t0;
  check('3 big batch', !big.err, json(big));
  check('3 big batch under 5 s', ms < 5000, Math.round(ms) + ' ms');
  console.log('note: 190-op batch at 96x96x64 took ' + Math.round(ms) + ' ms');
}

// 4. Look views stay one character per cell at heights 32 to 63, within the reply budget.
{
  const s = fresh();
  call(s, 'world_open', { name: 'tall', size: [96, 96, 64], fresh: true });
  call(s, 'world_build', { ops: [
    ['box', 'rock', 0, 1, 0, 0, 40, 0], ['box', 'rock', 1, 1, 0, 1, 63, 0]] });
  const h = String(call(s, 'world_look', { view: 'height', at: [0, 0, 9, 3] }));
  const row = h.split('\n').find(l => /^\S{10}$/.test(l));
  check('4 height one char per cell', Boolean(row), h.slice(0, 200));
  check('4 height 0..31 unchanged', row && row[0] !== row[1] && row.slice(2) === '00000000', row);
  const full = String(call(s, 'world_look', { view: 'top' }));
  check('4 top within budget', Buffer.byteLength(full) <= 3000, Buffer.byteLength(full));
}

// 5. swap: region form, whole-world default, settle, one undo step, replay match.
{
  const s = fresh();
  call(s, 'world_open', { name: 'swap', size: [24, 24, 16], fresh: true });
  call(s, 'world_build', { ops: [
    ['box', 'slate', 2, 1, 2, 5, 3, 5], ['box', 'slate', 10, 1, 10, 12, 2, 12],
    ['box', 'rock', 15, 1, 15, 19, 1, 15], ['box', 'rock', 15, 2, 15, 15, 2, 15],
    ['box', 'rock', 19, 2, 15, 19, 2, 15], ['box', 'rock', 15, 3, 15, 19, 3, 15]] });
  const slate = count(s, 'slate'), rev = s.world.rev;
  const r = call(s, 'world_build', { ops: [['swap', 'slate', 'blue', 0, 0, 0, 7, 15, 7]] });
  check('5 region no error', !r.err, json(r));
  check('5 region swapped', count(s, 'blue') === 48 && count(s, 'slate') === slate - 48);
  check('5 outside region kept', name(s, 10, 1, 10) === 'slate');
  check('5 one rev', s.world.rev === rev + 1);
  call(s, 'world_build', { ops: [['swap', 'slate', 'blue']] });
  check('5 whole world default', count(s, 'slate') === 0);
  // Span: rock row at y=3 rests on two rock posts; swapping it to loose cream must settle.
  const f = call(s, 'world_build', { ops: [['swap', 'rock', 'cream', 16, 3, 15, 18, 3, 15]] });
  check('5 swap settles', num(f, 'fell') === 3, f);
  check('5 replay matches', replayHash(s) === hash(s.world));
  const before = hash(s.world);
  call(s, 'world_build', { ops: [['swap', 'blue', 'brick']] });
  call(s, 'world_undo', { steps: 1 });
  check('5 undo one step', hash(s.world) === before);
  const bad = call(s, 'world_build', { ops: [['swap', 'slate', 'nope']] });
  check('5 unknown block refused', Boolean(bad.err), json(bad));
}

// 6. mirror: [mirror, axis, at, x1,y1,z1, x2,y2,z2]; cell c maps to 2*at - c on that axis.
{
  const s = fresh();
  call(s, 'world_open', { name: 'mirror', size: [24, 24, 16], fresh: true });
  call(s, 'world_build', { ops: [
    ['box', 'rock', 2, 1, 4, 3, 2, 4], ['box', 'brick', 2, 1, 6, 2, 1, 6]] });
  // Odd symmetry about z=8: z4 -> z12, z6 -> z10.
  const r = call(s, 'world_build', { ops: [['mirror', 'z', 8, 0, 0, 0, 23, 15, 7]] });
  check('6 no error', !r.err, json(r));
  check('6 odd copy', name(s, 2, 1, 12) === 'rock' && name(s, 3, 2, 12) === 'rock' &&
    name(s, 2, 1, 10) === 'brick');
  check('6 source kept', name(s, 2, 1, 4) === 'rock' && name(s, 2, 1, 6) === 'brick');
  // Even symmetry about x=11.5: x2 -> x21, x3 -> x20.
  call(s, 'world_build', { ops: [['mirror', 'x', 11.5, 0, 0, 0, 11, 15, 23]] });
  check('6 even copy', name(s, 21, 1, 4) === 'rock' && name(s, 20, 2, 4) === 'rock' &&
    name(s, 21, 1, 12) === 'rock');
  // Air does not erase: a block already at the target stays.
  call(s, 'world_build', { ops: [
    ['box', 'tile', 5, 1, 20, 5, 1, 20], ['mirror', 'z', 12, 0, 0, 4, 23, 15, 4]] });
  check('6 air does not erase', name(s, 5, 1, 20) === 'tile');
  // Deterministic: same ops in a fresh session give the same hash; replay matches.
  check('6 replay matches', replayHash(s) === hash(s.world));
  // A copy that would leave the world is refused and changes nothing.
  const before = hash(s.world);
  const out = call(s, 'world_build', { ops: [['mirror', 'x', 22, 0, 0, 0, 10, 15, 23]] });
  check('6 outside refused', Boolean(out.err) && hash(s.world) === before, json(out));
  const axis = call(s, 'world_build', { ops: [['mirror', 'q', 8, 0, 0, 0, 1, 1, 1]] });
  check('6 bad axis refused', Boolean(axis.err), json(axis));
  const half = call(s, 'world_build', { ops: [['mirror', 'z', 8.25, 0, 0, 0, 1, 1, 1]] });
  check('6 quarter plane refused', Boolean(half.err), json(half));
  // A mirrored loose block with no support falls and is reported.
  const t = fresh();
  call(t, 'world_open', { name: 'mfall', size: [24, 24, 16], fresh: true });
  call(t, 'world_build', { ops: [
    ['box', 'rock', 2, 1, 2, 2, 4, 2], ['box', 'cream', 2, 5, 2, 2, 5, 2]] });
  const fall = call(t, 'world_build', { ops: [['mirror', 'z', 10, 0, 5, 0, 23, 5, 9]] });
  check('6 mirror reports falls', num(fall, 'fell') === 1, fall);
  check('6 fallen block landed', name(t, 2, 1, 18) === 'cream');
}

// 7. Tool text names both ops within the raised cap.
{
  const b = tools.find(t => t.name === 'world_build').description;
  check('7 swap named', /\[swap,/.test(b), b);
  check('7 mirror named', /\[mirror,/.test(b), b);
  check('7 cap', b.length <= 760, b.length);
}

for (const f of fails) console.log('FAIL ' + f);
console.log('engine-canvas: ' + fails.length + ' failures');
process.exitCode = +!!fails.length;
