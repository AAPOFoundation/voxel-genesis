// Frozen engine move checks.
// Run alone: node tests/engine-move.mjs. Not imported by the four suites until wave 5 merges.
// Judgements, each the least specific reading that still proves the behaviour:
// - Kit id rules are canon's normalId: `9lives` and a 25-letter id are bad on any reading. A bad
//   cell is one outside the world, for `mover` and for `move`. A refusal is a thrown call; its
//   fix is any of the catalogue's fix verbs (use, choose, try, pick, keep, omit, remove, wait).
//   The 17th mover only has to be refused within 200 bytes with state unchanged. Replacing a
//   mover at the cap of 16 is accepted. Which cell a removed mover frees is not asserted.
// - Paths are not asserted cell by cell. The obstacle field is a 6-high wall no mover climbs and
//   a closed pen; the target behind the wall needs a detour through the gap, which neither
//   L-shaped order finds. A mover standing on the target is the bump case: the walker ends one
//   cell (Chebyshev) from it. A blocked mover ends outside the pen on ground level, anywhere.
// - A reply line starts with the quoted form (`moved ID x,z`, `bump ID OTHER x,z`,
//   `blocked ID x,z`) and x,z is the mover's stored cell; text after it is free. The three-line
//   and 120-byte caps apply to the mover lines joined by newlines.
// - Replay is core replay of the saved log; run is `bin/voxel-genesis.mjs run FILE` in a fresh
//   home.
// - The viewer draws movers as world.agents (both renderers draw only those). An agent's place is
//   the centre of its first box less half a cell; it is tracked by nearest centre each frame.
//   Car speed: an open six-cell walk takes between 6 / (1.25 c) and 6 / (0.5 c) seconds,
//   c = MOTION.carSpeed, never moves more than half a cell a frame at 60 fps, passes the cells
//   between, and stays at the target for five seconds after (non-looping). Reduced motion: the
//   agent is at the target straight after enqueue, with no step.
// - Kit names are read through readName with no warning; places never overlap, so "first" is
//   not asserted. String literals do not exist in expressions, so beats test x, z and a
//   non-empty place. J6 is one world_build adding the mover and the beat and walking to a place
//   already built; bytes are arguments JSON plus reply text, as J4 and J5 counted.
// - Tool bytes are capped at 2,400 (initial mover budget), measured as lint kit-budget does.
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
const failures = [], notes = [];
const check = (rule, ok, detail = '') =>
  ok || !failures.push({ rule, detail: String(detail).replaceAll('\n', ' / ') });
const info = (topic, text) => notes.push(topic + ': ' + text);
const test = (rule, fn) => Promise.resolve().then(fn).catch(error =>
  check(rule, false, String(error.message).split('\n')[0].slice(0, 160)));
const only = process.argv.find(arg => arg.startsWith('--only='))?.slice(7).split(',');
const run = (rule, fn) => !only || only.includes(rule) ? test(rule, fn) : null;
const WORK = resolve('.agent-work/engine-move'), home = () => mkdtempSync(join(WORK, 'run-'));
mkdirSync(WORK, { recursive: true });
Object.assign(process.env, { VOXEL_GENESIS_HOME: home(), VOXEL_GENESIS_PORT: '0' });
process.env.VOXEL_GENESIS_NO_LOG = '1';
delete process.env.VOXEL_GENESIS_KIT;
process.on('unhandledRejection', error => info('unhandled', String(error?.message ?? error)));
const [{ createToolSession }, { hash }, { createCore }, { createPlayer, MOTION }, { readName },
  { readLog }, { TOOL_COPY, SERVER_INSTRUCTIONS }] = await Promise.all(['../src/session.mjs',
  '../src/core/codec.mjs', '../src/core/index.mjs', '../viewer/player.mjs',
  '../src/kit/expr.mjs', '../src/save-log.mjs', '../src/copy.mjs'].map(path => import(path)));
const E = createRequire(import.meta.url)('../vendor/voxel-engine.js');
const session = (h = home()) => createToolSession({ home: h });
const build = (s, ...ops) => s.call('world_build', { ops });
const small = name => ({ name, size: [16, 16, 12], seed: 3, fresh: true });
const text = reply => typeof reply === 'string' ? reply : JSON.stringify(reply);
const bytes = value => Buffer.byteLength(value);
const load = name => JSON.parse(readFileSync('fixtures/' + name + '.json', 'utf8'));
const stable = value => JSON.stringify(value, (key, item) =>
  item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(
    Object.entries(item).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : item);
const refusal = fn => {
  try { fn(); return null; } catch (error) { return String(error.message); }
};
const FIX = /\b(use|choose|try|pick|keep|omit|remove|wait)\b/i;
const moverLines = reply => reply.split('\n').filter(line => /^(moved|bump|blocked) /.test(line));
const cell = m => m ? m.x + ',' + m.z : 'none';
const starts = (reply, head) => moverLines(reply).some(line => line === head ||
  line.startsWith(head + ' '));
// The obstacle field: a wall at x 8 (z 0 to 10, gap at z 11 to 15) and a closed pen round 13,2.
const WALLS = [['box', 'brick', 8, 1, 0, 8, 6, 10], ['box', 'brick', 11, 1, 0, 15, 6, 4],
  ['clear', 12, 1, 1, 14, 6, 3]];
const inPen = m => m.x >= 11 && m.x <= 15 && m.z <= 4;
const field = name => {
  const s = session();
  s.call('world_open', small(name));
  build(s, ...WALLS, ['mover', 'dog', 'brick', 3, 5]);
  return s;
};
const mover = (s, id) => s.world.movers?.[id];

// mover-ops: add, replace and remove; the 17th mover and bad ids, blocks and cells are refused
// in 200 bytes with a fix, and leave the world as it was.
await run('mover-ops', () => {
  const s = session(), movers = () => stable(s.world.movers ?? {});
  s.call('world_open', small('ops'));
  build(s, ['mover', 'dog', 'brick', 2, 2]);
  check('mover-ops', movers() === stable({ dog: { block: 'brick', x: 2, z: 2 } }),
    'add gave ' + movers());
  build(s, ['mover', 'dog', 'cream', 5, 6]);
  check('mover-ops', movers() === stable({ dog: { block: 'cream', x: 5, z: 6 } }),
    'replace gave ' + movers());
  build(s, ['mover', 'dog']);
  check('mover-ops', !mover(s, 'dog'), 'remove left ' + movers());
  build(s, ['mover', 'dog', 'brick', 2, 2]);
  const state = () => (s.catchUp(), JSON.stringify([readFileSync(s.logPath, 'utf8'),
    s.world.rev, hash(s.world), movers()]));
  const refuse = (label, ops, fix = true) => {
    const before = state(), said = refusal(() => build(s, ...ops));
    if (!check('mover-ops', said !== null, label + ' was accepted')) return;
    check('mover-ops', bytes(said) <= 200 && (!fix || FIX.test(said)), label + ': ' + said);
    check('mover-ops', state() === before, label + ' changed the world');
  };
  refuse('id 9lives', [['mover', '9lives', 'brick', 3, 3]]);
  refuse('a 25-letter id', [['mover', 'x'.repeat(25), 'brick', 3, 3]]);
  refuse('block brikc', [['mover', 'cat', 'brikc', 3, 3]]);
  refuse('cell 16,3', [['mover', 'cat', 'brick', 16, 3]]);
  refuse('cell -1,3', [['mover', 'cat', 'brick', -1, 3]]);
  refuse('a move to 3,99', [['move', 'dog', 3, 99]]);
  build(s, ...Array.from({ length: 15 }, (_, i) => ['mover', 'm' + i, 'brick', i, 8]));
  check('mover-ops', Object.keys(s.world.movers ?? {}).length === 16, '16 movers: ' + movers());
  refuse('a 17th mover', [['mover', 'cat', 'brick', 3, 12]], false);
  build(s, ['mover', 'm0', 'cream', 3, 12]);
  check('mover-ops', Object.keys(s.world.movers).length === 16 &&
    stable(mover(s, 'm0')) === stable({ block: 'cream', x: 3, z: 12 }),
  'replace at the cap gave ' + movers());
  build(s, ['mover', 'm1'], ['mover', 'cat', 'brick', 4, 12]);
  check('mover-ops', Object.keys(s.world.movers).length === 16 && !mover(s, 'm1') &&
    cell(mover(s, 'cat')) === '4,12', 'remove then add at the cap gave ' + movers());
});

// mover-path: round a wall to the target, a stop before another mover, blocked with no route.
await run('mover-path', () => {
  const s = field('path'), go = (...ops) => text(build(s, ...ops));
  const arrive = go(['move', 'dog', 12, 8]), dog = mover(s, 'dog');
  check('mover-path', cell(dog) === '12,8', 'dog behind the wall ended at ' + cell(dog));
  check('mover-path', starts(arrive, 'moved dog 12,8'), 'arrival reply: ' + arrive);
  const bump = go(['mover', 'cat', 'brick', 2, 14], ['mover', 'hen', 'cream', 6, 14],
    ['move', 'hen', 2, 14]);
  const hen = mover(s, 'hen'), far = hen ? Math.max(Math.abs(hen.x - 2), Math.abs(hen.z - 14))
    : -1;
  check('mover-path', far === 1 && cell(mover(s, 'cat')) === '2,14',
    'hen walking onto cat ended at ' + cell(hen) + ', cat at ' + cell(mover(s, 'cat')));
  check('mover-path', starts(bump, 'bump hen cat ' + cell(hen)), 'bump reply: ' + bump);
  const shut = go(['move', 'dog', 13, 2]), penned = mover(s, 'dog');
  check('mover-path', penned && !inPen(penned) && s.world.top(penned.x, penned.z) === 0,
    'dog walking into the closed pen ended at ' + cell(penned));
  check('mover-path', starts(shut, 'blocked dog ' + cell(penned)), 'blocked reply: ' + shut);
});

// mover-report: moved, bump and blocked lines, three at most, 120 bytes or fewer.
await run('mover-report', () => {
  const s = session(), zs = [1, 3, 5, 7, 9];
  const long = (word, z) => (word + z).padEnd(24, 'x');
  s.call('world_open', small('report'));
  build(s, ...zs.flatMap(z => [['mover', long('walker', z), 'brick', 1, z],
    ['mover', long('stopper', z), 'cream', 14, z]]));
  const quiet = text(build(s, ['box', 'brick', 5, 1, 12, 5, 1, 12]));
  check('mover-report', moverLines(quiet).length === 0, 'a build with no move: ' + quiet);
  const many = text(build(s, ...zs.map(z => ['move', long('walker', z), 14, z])));
  const lines = moverLines(many), size = bytes(lines.join('\n'));
  info('mover-report', 'five bumps gave ' + lines.length + ' lines, ' + size + ' bytes');
  check('mover-report', lines.length >= 1 && lines.length <= 3 && size <= 120,
    'five bumps: ' + lines.length + ' lines, ' + size + ' bytes: ' + many);
  check('mover-report', lines.every(line => {
    const [word, id, other] = line.split(' '), m = mover(s, id);
    return m && line.startsWith(word + ' ' + id + ' ' +
      (word === 'bump' ? other + ' ' : '') + cell(m));
  }), 'a line does not name its mover and stored cell: ' + lines.join(' | '));
  const one = text(build(s, ['move', long('walker', 1), 5, 1]));
  check('mover-report', moverLines(one).length === 1 &&
    starts(one, 'moved ' + long('walker', 1) + ' 5,1'), 'one open move: ' + one);
});

// mover-hash: no mover, no hash change for every frozen record; movers survive undo, replay,
// reopen and run with one hash.
await run('mover-hash', () => {
  const core = createCore(E), plain = load('expected'), two = load('base-two-expected');
  const names = [...Object.keys(plain), 'town-game'];
  const live = (open, batches, label, want, s = session()) => {
    s.call('world_open', open);
    batches.forEach(ops => build(s, ...ops));
    check('mover-hash', hash(s.world) === want.hash && s.world.rev === want.rev,
      label + ' ' + hash(s.world) + ' rev ' + s.world.rev);
  };
  for (const name of names) live({ ...load(name).open, fresh: true }, load(name).batches, name,
    plain[name] ?? load('town-expected'));
  for (const [set, records] of [
    ['base@1', { ...load('base-one-expected'), 'town-game': load('town-base-one-expected') }],
    ['base@2', { ...two, 'town-game': two.town }]]) {
    for (const name of names) {
      const f = load(name), game = name === 'town-game', world = core.replay({ v: 1, set,
        world: f.open.name, seed: f.open.seed ?? 1, rules: game ? 'town@1' : 'none@0',
        size: f.open.size ?? (game ? [36, 36, 16] : [32, 32, 24]) },
      (game ? two.batches : f.batches).map(ops => ({ ops }))).world;
      check('mover-hash', hash(world) === records[name].hash, set + ' ' + name + ' ' + hash(world));
    }
  }
  const kit = load('kit/expected');
  for (const [id, f] of Object.keys(kit).map(id => [id, load('kit/' + id + '-game')])) {
    live(f.open, f.batches, 'kit ' + id, kit[id]);
  }
  // Movers join the hash and survive undo, reopen, replay and run.
  const bare = session();
  bare.call('world_open', small('hash'));
  build(bare, ...WALLS);
  const s = field('hash'), first = hash(s.world);
  check('mover-hash', first !== hash(bare.world), 'adding a mover left the hash unchanged');
  build(s, ['move', 'dog', 12, 8]);
  const moved = hash(s.world), where = stable(s.world.movers);
  check('mover-hash', moved !== first, 'a move left the hash unchanged');
  build(s, ['box', 'cream', 2, 1, 2, 2, 1, 2]);
  s.call('world_undo');
  check('mover-hash', hash(s.world) === moved && stable(s.world.movers) === where,
    'undo of a later build gave ' + hash(s.world) + ' ' + stable(s.world.movers));
  const again = session(s.home);
  again.call('world_open', { name: 'hash' });
  check('mover-hash', hash(again.world) === moved && stable(again.world.movers) === where,
    'reopen gave ' + hash(again.world) + ' ' + stable(again.world.movers));
  const { h, records } = readLog(s.logPath), replayed = core.replay(h, records).world;
  check('mover-hash', hash(replayed) === moved, 'replay gave ' + hash(replayed));
  const dir = home(), file = join(dir, 'hash.run.json');
  writeFileSync(file, JSON.stringify({ open: small('hash'),
    batches: [[...WALLS, ['mover', 'dog', 'brick', 3, 5]], [['move', 'dog', 12, 8]]] }));
  const r = spawnSync(process.execPath, ['bin/voxel-genesis.mjs', 'run', file], { encoding: 'utf8',
    env: { ...process.env, VOXEL_GENESIS_HOME: home() }, timeout: 60000 });
  let out = null;
  try { out = JSON.parse(String(r.stdout).trim().split('\n').at(-1)); } catch { out = null; }
  check('mover-hash', out?.hash === moved, 'run gave ' + String(r.stdout).slice(0, 120));
  s.call('world_undo');
  check('mover-hash', hash(s.world) === first && cell(mover(s, 'dog')) === '3,5',
    'undo of the move gave ' + hash(s.world) + ', dog at ' + cell(mover(s, 'dog')));
});

// mover-player: playback matches the server after every move line in both motion modes; a walk
// goes at car speed and stops; reduced motion places the mover at once.
const centres = p => (p.world?.agents ?? []).map(agent => agent.boxes(p.world)[0])
  .filter(Boolean).map(box => [box.x - .5, box.z - .5]);
const near = (a, [x, z]) => Math.hypot(a[0] - x, a[1] - z);
await run('mover-player', () => {
  for (const reduced of [false, true]) {
    const s = field('player'), p = createPlayer(E, { reduced }), mode = reduced ? 'reduced '
      : 'full ';
    build(s, ['mover', 'fox', 'cream', 0, 15]);
    const compare = label => check('mover-player', !p.needsState && p.hash === hash(s.world) &&
      stable(p.world.movers ?? null) === stable(s.world.movers ?? null),
    mode + label + ': ' + p.hash + ' vs ' + hash(s.world));
    const send = (...ops) => {
      build(s, ...ops);
      p.enqueue({ rev: s.world.rev, line: s.lines.at(-1), hash: hash(s.world) });
    };
    p.load(s.state());
    compare('load');
    const from = [0, 15], to = [6, 15];
    let pos = from, jump = 0, left = 0, arrived = null, stay = true, mid = false;
    const track = () => {
      const list = centres(p);
      if (!list.length) return;
      const next = list.reduce((a, b) => near(a, pos) <= near(b, pos) ? a : b);
      jump = Math.max(jump, near(next, pos));
      pos = next;
    };
    send(['move', 'fox', 6, 15]);
    if (reduced) {
      track();
      check('mover-player', near(pos, to) <= .25, 'reduced: fox not placed at once, at ' + pos);
    } else {
      for (let i = 1; i <= 3600; i++) {
        p.step(1 / 60);
        track();
        const t = i / 60;
        if (near(pos, from) <= .25) left = t;
        if (arrived === null && near(pos, to) <= .25) arrived = t;
        if (arrived !== null && near(pos, to) > .25) stay = false;
        mid ||= near(pos, from) >= 1 && near(pos, to) >= 1;
        if (arrived !== null && t - arrived >= 5 && !p.busy) break;
      }
      const c = MOTION.carSpeed, speed = arrived === null ? 0 : 6 / (arrived - left);
      info('mover-player', 'fox walked 6 cells in ' + (arrived === null ? 'never'
        : (arrived - left).toFixed(2) + ' s') + ', car speed ' + c);
      check('mover-player', arrived !== null && mid, 'full: fox never walked to 6,15, at ' + pos);
      check('mover-player', arrived === null || speed >= .5 * c && speed <= 1.25 * c,
        'full: fox averaged ' + speed.toFixed(2) + ' cells a second, car speed ' + c);
      check('mover-player', jump <= .5, 'full: fox jumped ' + jump.toFixed(2) + ' cells a frame');
      check('mover-player', stay, 'full: fox left the target after arriving (it loops)');
    }
    for (let i = 0; i < 20000 && p.busy; i++) p.step(1 / 60);
    compare('walk');
    for (const ops of [[['move', 'dog', 12, 8]], [['mover', 'cat', 'brick', 2, 14],
      ['mover', 'hen', 'cream', 6, 14], ['move', 'hen', 2, 14]], [['move', 'dog', 13, 2]],
    [['mover', 'hen']]]) {
      send(...ops);
      if (reduced) compare('at once, rev ' + s.world.rev);
      for (let i = 0; i < 20000 && p.busy; i++) p.step(1 / 60);
      compare('rev ' + s.world.rev);
    }
  }
});

// mover-names: mover.ID.x, .z and .place read the mover; a beat on arrival completes in the
// move's own reply. J6 is measured inside it.
await run('mover-names', () => {
  // J6: walk a character to a place and finish a beat on arrival, one world_build.
  const j = session();
  j.call('world_open', small('j6'));
  build(j, ['part', { part: 'place/pond', at: [10, 10, 12, 12] }]);
  const args = { ops: [['mover', 'dog', 'cream', 2, 2], ['part', { part: 'beat/pond',
    says: 'The dog is at the pond.', when: [['!=', 'mover.dog.place', '']] }],
  ['move', 'dog', 11, 11]] };
  let said = null;
  try { said = text(j.call('world_build', args)); } finally {
    info('J6', '1 call, ' + (said === null ? 'refused' : bytes(JSON.stringify(args)) +
      bytes(said) + ' bytes') + ' (cap 1 call, 400 bytes)');
  }
  const cost = bytes(JSON.stringify(args)) + bytes(said);
  check('mover-names', cost <= 400, 'J6 costs ' + cost + ' bytes, cap 400');
  check('mover-names', j.world.kit?.s?.beat?.pond === 1 && /^story 1\/1 complete/m.test(said) &&
    cell(mover(j, 'dog')) === '11,11', 'J6 did not finish the beat: ' + said);
  const s = session(), warnings = [];
  const read = name => readName(name, s.world, {}, warnings);
  const names = () => ['x', 'z', 'place'].map(key => read('mover.dog.' + key)).join(' ');
  s.call('world_open', small('names'));
  build(s, ['part', { part: 'place/pond', at: [10, 10, 12, 12] }],
    ['part', { part: 'place/barn', at: [1, 1, 3, 3] }], ['mover', 'dog', 'cream', 2, 2],
    ['part', { part: 'beat/arrive', goal: 'Walk the dog to the pond.', says: 'Done.',
      when: [['=', 'mover.dog.x', 11], ['=', 'mover.dog.z', 11],
        ['!=', 'mover.dog.place', '']] }]);
  check('mover-names', names() === '2 2 barn', 'at the barn the names read ' + names());
  check('mover-names', !s.world.kit?.s?.beat?.arrive, 'the beat completed before the move');
  const reply = text(build(s, ['move', 'dog', 11, 11]));
  check('mover-names', names() === '11 11 pond', 'at the pond the names read ' + names());
  check('mover-names', s.world.kit?.s?.beat?.arrive === 1 && /^story 1\/1 complete/m.test(reply),
    'the beat did not complete in the move reply: ' + reply);
  build(s, ['move', 'dog', 6, 6]);
  check('mover-names', names() === '6 6 ', 'outside any place the names read ' + names());
  check('mover-names', warnings.length === 0, 'names warned: ' + warnings.join(' | '));
});

// mover-budget: the mover ops join the world_build description, 640 characters or fewer (600
// until 11-18); four tools, tool list plus instructions 2,400 bytes or fewer (raised 11-14).
await run('mover-budget', () => {
  const tools = TOOL_COPY, says = tools.find(tool => tool.name === 'world_build')?.description;
  const size = bytes(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { tools } })) +
    bytes(SERVER_INSTRUCTIONS);
  info('mover-budget', size + ' bytes (cap 2,400), world_build ' + says?.length +
    ' characters (cap 640)');
  check('mover-budget', tools.length === 4 && tools.every(tool => /^world_/.test(tool.name)),
    tools.length + ' tools');
  check('mover-budget', typeof says === 'string' && says.length <= 640,
    'world_build description is ' + says?.length + ' characters');
  check('mover-budget', size <= 2480, 'tool list plus instructions ' + size + ' bytes');
  check('mover-budget', says?.includes('[mover,id,block,x,z]; [move,id,x,z]'),
    'the world_build description does not list [mover,id,block,x,z]; [move,id,x,z]');
});

await run('pet-move', () => {
  const old = readFileSync('src/copy.mjs', 'utf8');
  const form = old.match(/moverForm: '([^']*)'/)?.[1];
  const fresh = name => (s => (s.call('world_open', small(name)), s))(session());
  const NEW = 'move: no such mover; pets do not walk. Put [mover,id,block,x,z] before it.';
  const state = s => (s.catchUp(), JSON.stringify([s.world.rev, hash(s.world), s.world.life]));
  const turn = (ops, at) => {
    const s = fresh('pet'), before = state(s), said = refusal(() => build(s, ...ops));
    check('pet-move', said === 'ops[' + at + '].moverMissing ' + JSON.stringify(ops[at]) + ': ' +
      NEW, 'said ' + said);
    check('pet-move', state(s) === before, 'changed the world');
  };
  turn([['pet', 'cream', 2, 2], ['move', 'dog', 8, 8]], 1);
  turn([['move', 'ghost', 3, 3]], 0);
  const s = fresh('pet-ok');
  build(s, ['mover', 'dog', 'cream', 2, 2], ['move', 'dog', 8, 8]);
  check('pet-move', cell(mover(s, 'dog')) === '8,8', 'dog at ' + cell(mover(s, 'dog')));
  const bad = refusal(() => build(s, ['mover', 'dog', 'cream']));
  check('pet-move', bad === 'ops[0].moverForm ["mover","dog","cream"]: ' + form, 'form ' + bad);
  build(s, ['mover', 'dog']);
  check('pet-move', !mover(s, 'dog'), 'remove left ' + cell(mover(s, 'dog')));
});

for (const note of notes) console.log('info ' + note);
for (const failure of failures) console.log('FAIL ' + failure.rule + ': ' + failure.detail);
console.log('engine-move: ' + failures.length + ' failures');
process.exitCode = failures.length ? 1 : 0;
