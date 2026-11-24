// Frozen Stage 2a: one world_open from each proven fixture (2026-11-20).
import { readFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { resolve } from 'node:path';
const failures = [];
const notes = [];
const check = (rule, ok, detail = '') => {
  if (!ok) failures.push({ rule, detail: String(detail).replaceAll('\n', ' / ') });
};
mkdirSync('.agent-work/engine-from', { recursive: true });
const home = () => mkdtempSync(resolve('.agent-work/engine-from/run-'));
process.env.VOXEL_GENESIS_HOME = home();
process.env.VOXEL_GENESIS_PORT = '0';
process.env.VOXEL_GENESIS_NO_LOG = '1';
delete process.env.VOXEL_GENESIS_KIT;
const { createToolSession } = await import('../src/session.mjs');
const { summary } = await import('../src/core/codec.mjs');
const session = (h = home()) => createToolSession({ home: h });
const names = ['small-town', 'tiny-garden', 'hill-village'];
const call = (s, tool, args) => {
  try { return s.call(tool, args); } catch (error) {
    if (!error.code) throw error;
    return { ok: false, code: error.code, message: error.message };
  }
};
const refused = r => r?.ok === false || Boolean(r?.code);
const shape = s => s.world ? JSON.stringify({ rev: s.world.rev, ...summary(s.world) }) : 'none';
const same = (s, t) => shape(s) === shape(t);
const open = (s, args) => call(s, 'world_open', args);
const plain = { name: 'plain-from', size: [16, 16, 12], seed: 3, fresh: true };

// Case 2: literal JSON bytes captured from main ee5548c, using exactly `plain` above.
const plainBytes = '{"rev":0,"count":256,"hash":"b9f320ad","viewer":"run serve",' +
  '"blocks":"grass earth rock path road water deck brick cream sun slate roof timber trunk ' +
  'leaf needle plaster amber blue tile","prefabs":"workshop:5x5x6 market:6x6x7 cottage:5x5x5 ' +
  'house:5x6x8 shop:6x5x5 tower:4x4x12 barn:7x5x6 tree:3x3x6 pine:3x3x7 bridge:6x3x2 ' +
  'well:2x2x3 bench:2x1x1"}';
check('from', JSON.stringify(open(session(), plain)) === plainBytes, 'case 2: plain reply bytes');
notes.push('case 2: plain reply compared with main ee5548c');

for (const name of names) {
  // Case 1: exactly the run door path, in a separate home; count every refused call.
  const f = JSON.parse(readFileSync('fixtures/' + name + '.json', 'utf8'));
  const reference = session();
  const replies = [open(reference, f.open)];
  for (const ops of f.batches) replies.push(call(reference, 'world_build', { ops }));
  const h = home(), s = session(h);
  const start = performance.now();
  const reply = open(s, { name, from: name });
  const ms = performance.now() - start;
  notes.push(name + ': from reply ' + Buffer.byteLength(JSON.stringify(reply)) +
    ' bytes, ' + ms.toFixed(2) + ' ms');
  check('from', [...replies, reply].filter(refused).length === 0,
    'case 1: ' + name + ' refused calls');
  check('from', same(s, reference), 'case 1: ' + name + ' hash/rev/count');
  const want = reference.world && summary(reference.world);
  check('from', reply.hash === want?.hash && reply.count === want?.count &&
    reply.rev === reference.world?.rev, 'case 1: ' + name + ' reply hash/rev/count');

  // Case 4: a new session loads the saved world and can undo its last fixture batch.
  const reload = session(h);
  const loaded = open(reload, { name });
  check('from', !refused(loaded) && same(reload, reference),
    'case 4: ' + name + ' reload hash/rev/count');
  const undone = call(reload, 'world_undo', { steps: 1 });
  const expected = call(reference, 'world_undo', { steps: 1 });
  check('from', !refused(undone) && !refused(expected) && same(reload, reference),
    'case 4: ' + name + ' undo 1 after reload');

  // Case 3: refuse an existing built world unchanged; fresh replaces it successfully.
  const built = session();
  open(built, { ...plain, name });
  call(built, 'world_build', { ops: [['box', 'rock', 1, 1, 1, 2, 1, 2]] });
  const before = shape(built), log = readFileSync(built.logPath, 'utf8');
  check('from', refused(open(built, { name, from: name })),
    'case 3: ' + name + ' existing builds not refused');
  check('from', shape(built) === before && readFileSync(built.logPath, 'utf8') === log,
    'case 3: ' + name + ' changed on refusal');
  const fresh = open(built, { name, from: name, fresh: true });
  // Restore the reference's last batch after the undo comparison above.
  const full = session();
  open(full, f.open);
  for (const ops of f.batches) call(full, 'world_build', { ops });
  check('from', !refused(fresh) && same(built, full),
    'case 3: ' + name + ' fresh hash/rev/count');
}
for (const extra of [{ game: 'town' }, { kit: 'property' }]) {
  check('from', refused(open(session(), { name: 'mixed', from: names[0], ...extra })),
    'case 3: from with ' + Object.keys(extra)[0] + ' not refused');
}
const unknown = open(session(), { name: 'unknown', from: 'unknown' });
check('from', refused(unknown), 'case 3: unknown from not refused');
check('from', names.every(name => JSON.stringify(unknown).includes(name)),
  'case 3: unknown refusal must name all three worlds');

for (const note of notes) console.log('info from: ' + note);
for (const failure of failures) console.log('FAIL ' + failure.rule + ': ' + failure.detail);
console.log('engine-from: ' + failures.length + ' failures');
process.exitCode = failures.length ? 1 : 0;
