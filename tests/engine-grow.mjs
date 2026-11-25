// Frozen check for pkg/grow: world_open {name, size, grow: true} enlarges a world in place
// (east, south and up). Run: node tests/engine-grow.mjs
import { mkdirSync, mkdtempSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
const json = JSON.stringify, fails = [];
const check = (rule, ok, detail = '') => {
  if (!ok) fails.push(rule + (detail ? ': ' + detail : ''));
};
mkdirSync('.agent-work/grow', { recursive: true });
const home = () => mkdtempSync(resolve('.agent-work/grow/run-'));
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
const built = s => {
  const ids = new Set(['grass', 'earth', 'rock', 'path', 'road', 'water', 'deck']
    .map(b => s.world.byName[b]));
  return s.world.cells.reduce((n, v) => n + (v && !ids.has(v) ? 1 : 0), 0);
};
const replayHash = s => {
  const rows = readFileSync(s.logPath, 'utf8').trim().split('\n').map(x => JSON.parse(x));
  return hash(createCore(E).replay(rows[0], rows.slice(1)).world);
};
const OPS = [
  ['box', 'cream', 2, 1, 2, 4, 3, 4], ['box', 'brick', 15, 1, 15, 15, 5, 15],
  ['box', 'rock', 0, 1, 15, 0, 15, 15], ['paint', 'water', 10, 0, 12, 2]
];

// 1-3. Grow keeps every block at its coordinates, adds grass ground, counts as one rev.
const h = home();
const s = session(h);
call(s, 'world_open', { name: 'g', size: [16, 16, 16], fresh: true });
call(s, 'world_build', { ops: OPS });
const before = { hash: hash(s.world), rev: s.world.rev, built: built(s),
  cells: [[2, 1, 2], [15, 5, 15], [0, 15, 15], [11, 0, 1]].map(c => name(s, ...c)) };
const r = call(s, 'world_open', { name: 'g', size: [24, 20, 18], grow: true });
check('1 grow ok', !r.err && dims(s) === '[24,20,18]', json(r));
check('1 reply size', json(r.size) === '[24,20,18]', json(r));
check('1 blocks kept', json([[2, 1, 2], [15, 5, 15], [0, 15, 15], [11, 0, 1]]
  .map(c => name(s, ...c))) === json(before.cells));
check('1 built count kept', built(s) === before.built, built(s) + ' vs ' + before.built);
check('2 new ground is grass', name(s, 20, 0, 18) === 'grass' && name(s, 23, 0, 0) === 'grass' &&
  name(s, 0, 0, 19) === 'grass');
check('2 new space is air', name(s, 20, 1, 18) === 'air' && name(s, 5, 17, 5) === 'air');
check('3 one rev', s.world.rev === before.rev + 1, s.world.rev);
check('3 replay matches', replayHash(s) === hash(s.world));

// 4. Building in the new space works and replays.
const b = call(s, 'world_build', { ops: [['box', 'tile', 22, 1, 18, 23, 2, 19]] });
check('4 build in new space', !b.err && name(s, 23, 2, 19) === 'tile', json(b));
check('4 replay after build', replayHash(s) === hash(s.world));
const grownHash = hash(s.world);

// 5. Persistence: a new session reopens the grown world; the old size no longer matches.
const t = session(h);
const o = call(t, 'world_open', { name: 'g' });
check('5 reopen size', !o.err && dims(t) === '[24,20,18]', json(o));
check('5 reopen hash', t.world && hash(t.world) === grownHash);
const same = call(session(h), 'world_open', { name: 'g', size: [24, 20, 18] });
check('5 new size matches', !same.err, json(same));
const old = call(session(h), 'world_open', { name: 'g', size: [16, 16, 16] });
check('5 old size refused', Boolean(old.err), json(old));

// 6. Undo across the grow returns the old size and hash; fast undo matches replay.
call(t, 'world_undo', { steps: 2 });
check('6 undo size', dims(t) === '[16,16,16]', dims(t));
check('6 undo hash', t.world && hash(t.world) === before.hash);
check('6 undo replay', replayHash(t) === hash(t.world));
const u = session(h);
call(u, 'world_open', { name: 'g', size: [24, 20, 18], grow: true });
call(u, 'world_build', { ops: [['box', 'tile', 22, 1, 18, 22, 1, 18]] });
call(u, 'world_undo', { steps: 1 });
check('6 fast undo keeps grown size', dims(u) === '[24,20,18]' && replayHash(u) === hash(u.world));
call(u, 'world_undo', { steps: 1 });
check('6 fast undo across grow', dims(u) === '[16,16,16]' && hash(u.world) === before.hash);

// 7. Refusals change nothing: shrink, same size, over cap, fresh, from, seed, missing, town.
const r7 = session(home());
call(r7, 'world_open', { name: 'k', size: [16, 16, 16], fresh: true });
call(r7, 'world_build', { ops: OPS });
const k = { hash: hash(r7.world), bytes: statSync(r7.logPath).size };
const refuse = (label, args) => {
  const e = call(r7, 'world_open', { name: 'k', grow: true, ...args });
  check('7 refuses ' + label, Boolean(e.err) && dims(r7) === '[16,16,16]' &&
    hash(r7.world) === k.hash && statSync(r7.logPath).size === k.bytes, json(e));
};
refuse('shrink', { size: [16, 15, 16] });
refuse('mixed', { size: [20, 15, 20] });
refuse('same size', { size: [16, 16, 16] });
refuse('over cap', { size: [161, 16, 16] });
refuse('over height', { size: [16, 16, 65] });
refuse('no size', {});
refuse('fresh', { size: [20, 20, 20], fresh: true });
refuse('from', { size: [20, 20, 20], from: 'small-town' });
refuse('seed', { size: [20, 20, 20], seed: 99 });
const m = call(session(home()), 'world_open', { name: 'none', size: [20, 20, 20], grow: true });
check('7 refuses missing world', Boolean(m.err), json(m));
const town = session(home());
call(town, 'world_open', { name: 'tg', game: 'town' });
const tsize = dims(town);
const tg = call(town, 'world_open', { name: 'tg', size: [64, 64, 32], grow: true });
check('7 refuses town game', Boolean(tg.err) && dims(town) === tsize, json(tg));

// 8. Old hashes unchanged; growing to the maximum stays quick.
const p = session(home());
check('8 default hash', call(p, 'world_open', { name: 'plain' }).hash === 'fb543699');
const big = session(home());
call(big, 'world_open', { name: 'big', size: [48, 48, 32], fresh: true });
check('8 old max hash', hash(big.world) === '4228fe31');
call(big, 'world_build', { ops: [['box', 'rock', 40, 1, 40, 47, 31, 47]] });
const t0 = performance.now();
const g = call(big, 'world_open', { name: 'big', size: [160, 160, 64], grow: true });
const ms = Math.round(performance.now() - t0);
check('8 grow to max', !g.err && dims(big) === '[160,160,64]' && name(big, 47, 31, 47) === 'rock' &&
  name(big, 48, 31, 47) === 'air', json(g));
check('8 grow to max under 2 s', ms < 2000, ms + ' ms');
console.log('note: grow 48x48x32 -> 160x160x64 took ' + ms + ' ms');

// 9. Tool text: world_open names grow; budget holds.
const open = tools.find(x => x.name === 'world_open');
check('9 schema grow', open.inputSchema.properties.grow?.type === 'boolean');
check('9 open text', /grow/.test(open.description) && open.description.length <= 224,
  open.description);
check('9 bytes', Buffer.byteLength(json({ jsonrpc: '2.0', id: 1, result: { tools } })) +
  Buffer.byteLength(SERVER_INSTRUCTIONS) <= 2800);

for (const f of fails) console.log('FAIL ' + f);
console.log('engine-grow: ' + fails.length + ' failures');
process.exitCode = +!!fails.length;
