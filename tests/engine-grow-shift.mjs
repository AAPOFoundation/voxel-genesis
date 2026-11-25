// Frozen check for pkg/grow-shift: world_open {name, size, grow: true, shift: [x, z]} grows a world
// west and north by moving everything east and south. Run: node tests/engine-grow-shift.mjs
import { mkdirSync, mkdtempSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
const json = JSON.stringify, fails = [];
const check = (rule, ok, detail = '') => {
  if (!ok) fails.push(rule + (detail ? ': ' + detail : ''));
};
mkdirSync('.agent-work/shift', { recursive: true });
const home = () => mkdtempSync(resolve('.agent-work/shift/run-'));
process.env.VOXEL_GENESIS_HOME = home();
process.env.VOXEL_GENESIS_PORT = '0';
process.env.VOXEL_GENESIS_NO_LOG = '1';
delete process.env.VOXEL_GENESIS_KIT;
const { createToolSession } = await import('../src/session.mjs');
const { TOOL_COPY: tools, SERVER_INSTRUCTIONS } = await import('../src/copy.mjs');
const { hash } = await import('../src/core/codec.mjs');
const { createCore } = await import('../src/core/index.mjs');
const E = createRequire(import.meta.url)('../vendor/voxel-engine.js');
const session = h => createToolSession({ home: h });
const call = (s, tool, args) => {
  try { return s.call(tool, args); } catch (e) {
    if (!e.code) throw e;
    return { err: e.code, msg: e.message };
  }
};
const dims = s => json(s.world && [s.world.w, s.world.d, s.world.h]);
const name = (s, x, y, z) => s.world?.types[s.world.get(x, y, z)]?.name ?? 'air';
const replayHash = s => {
  const rows = readFileSync(s.logPath, 'utf8').trim().split('\n').map(x => JSON.parse(x));
  return hash(createCore(E).replay(rows[0], rows.slice(1)).world);
};
const OPS = [
  ['box', 'cream', 2, 1, 2, 4, 3, 4], ['box', 'brick', 15, 1, 15, 15, 5, 15],
  ['paint', 'water', 10, 0, 12, 2], ['car', 'sun', 0, 6, 8, 9], ['pet', 'brick', 7, 12],
  ['mover', 'bob', 'tile', 3, 11]
];
const CELLS = [[2, 1, 2], [4, 3, 4], [15, 5, 15], [11, 0, 1], [0, 0, 0], [15, 0, 15]];

// 1-3. Shift moves every cell, life entry and mover by +x, +z; new west and north strips are grass.
const h = home();
const s = session(h);
call(s, 'world_open', { name: 'g', size: [16, 16, 16], fresh: true });
call(s, 'world_build', { ops: OPS });
const before = { hash: hash(s.world), rev: s.world.rev, cells: CELLS.map(c => name(s, ...c)),
  life: json(s.world.life), mover: json(s.world.movers?.bob) };
check('0 setup', s.world.life.length === 2 && Boolean(s.world.movers?.bob), before.life);
const r = call(s, 'world_open', { name: 'g', size: [24, 20, 18], grow: true, shift: [5, 3] });
check('1 grow ok', !r.err && dims(s) === '[24,20,18]', json(r));
check('1 cells moved', json(CELLS.map(([x, y, z]) => name(s, x + 5, y, z + 3))) ===
  json(before.cells), json(CELLS.map(([x, y, z]) => name(s, x + 5, y, z + 3))));
check('1 old spot cleared', name(s, 2, 1, 2) === 'air' && name(s, 4, 3, 4) === 'air');
check('2 west strip grass', [0, 4].every(x => name(s, x, 0, 10) === 'grass'));
check('2 north strip grass', [0, 2].every(z => name(s, 10, 0, z) === 'grass'));
check('2 east and south grass', name(s, 23, 0, 10) === 'grass' && name(s, 10, 0, 19) === 'grass');
check('3 car shifted', json(s.world.life[0]) === json(['car', 'sun', 5, 9, 13, 12]),
  json(s.world.life[0]));
check('3 pet shifted', json(s.world.life[1]) === json(['pet', 'brick', 12, 15]),
  json(s.world.life[1]));
check('3 mover shifted', json(s.world.movers?.bob) === json({ block: 'tile', x: 8, z: 14 }),
  json(s.world.movers?.bob));
check('3 one rev', s.world.rev === before.rev + 1);
check('3 replay', replayHash(s) === hash(s.world));
const m = call(s, 'world_build', { ops: [['move', 'bob', 9, 14]] });
check('3 mover still moves', !m.err && json(s.world.movers?.bob) === json({ block: 'tile', x: 9,
  z: 14 }), json(m));
const grown = hash(s.world);

// 4. Reopen, undo across the shift, fast undo, and a plain grow after a shift.
const t = session(h);
call(t, 'world_open', { name: 'g' });
check('4 reopen', dims(t) === '[24,20,18]' && t.world && hash(t.world) === grown);
call(t, 'world_undo', { steps: 2 });
check('4 undo across shift', dims(t) === '[16,16,16]' && hash(t.world) === before.hash &&
  json(t.world.life) === before.life);
check('4 undo replay', replayHash(t) === hash(t.world));
const u = session(h);
call(u, 'world_open', { name: 'g', size: [20, 20, 16], grow: true, shift: [4, 0] });
call(u, 'world_open', { name: 'g', size: [20, 24, 16], grow: true });
check('4 shift then grow', dims(u) === '[20,24,16]' && name(u, 6, 1, 2) === 'cream' &&
  replayHash(u) === hash(u.world));
call(u, 'world_undo', { steps: 1 });
check('4 fast undo', dims(u) === '[20,20,16]' && replayHash(u) === hash(u.world));

// 5. Refusals change nothing.
const r5 = session(home());
call(r5, 'world_open', { name: 'k', size: [16, 16, 16], fresh: true });
call(r5, 'world_build', { ops: OPS });
const k = { hash: hash(r5.world), bytes: statSync(r5.logPath).size };
const refuse = (label, args) => {
  const e = call(r5, 'world_open', { name: 'k', ...args });
  check('5 refuses ' + label, Boolean(e.err) && dims(r5) === '[16,16,16]' &&
    hash(r5.world) === k.hash && statSync(r5.logPath).size === k.bytes, json(e));
};
refuse('shift without grow', { size: [20, 20, 16], shift: [2, 2] });
refuse('room too small', { size: [18, 20, 16], grow: true, shift: [3, 0] });
refuse('negative', { size: [20, 20, 16], grow: true, shift: [-1, 0] });
refuse('fraction', { size: [20, 20, 16], grow: true, shift: [1.5, 0] });
refuse('one value', { size: [20, 20, 16], grow: true, shift: [1] });
refuse('zero shift no growth', { size: [16, 16, 16], grow: true, shift: [0, 0] });

// 6. Shift alone (same size, no room) is refused; zero shift with growth behaves like plain grow.
const z = session(home());
call(z, 'world_open', { name: 'z', size: [16, 16, 16], fresh: true });
call(z, 'world_build', { ops: OPS });
const plain = session(home());
call(plain, 'world_open', { name: 'z', size: [16, 16, 16], fresh: true });
call(plain, 'world_build', { ops: OPS });
call(z, 'world_open', { name: 'z', size: [20, 20, 16], grow: true, shift: [0, 0] });
call(plain, 'world_open', { name: 'z', size: [20, 20, 16], grow: true });
check('6 zero shift equals grow', hash(z.world) === hash(plain.world));

// 7. Tool text and budget.
const open = tools.find(x => x.name === 'world_open');
const shift = open.inputSchema.properties.shift;
check('7 schema shift', shift?.type === 'array' && shift.items?.type === 'integer' &&
  shift.minItems === 2 && shift.maxItems === 2, json(shift));
check('7 open text cap', open.description.length <= 224, open.description.length);
check('7 bytes', Buffer.byteLength(json({ jsonrpc: '2.0', id: 1, result: { tools } })) +
  Buffer.byteLength(SERVER_INSTRUCTIONS) <= 2800);

for (const f of fails) console.log('FAIL ' + f);
console.log('engine-grow-shift: ' + fails.length + ' failures');
process.exitCode = +!!fails.length;
