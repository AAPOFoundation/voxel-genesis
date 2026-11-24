// COPY-DRAFT: play contracts, with independently calculated opening balances.
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fitCamera } from '../viewer/camera.mjs';
import { createPlayer } from '../viewer/player.mjs';

const bytes = value => Buffer.byteLength(typeof value === 'string' ? value : JSON.stringify(value));
const load = name => JSON.parse(readFileSync('fixtures/kit/' + name + '.json', 'utf8'));
const first = [
  [['do', 'acquire', 'lot-11'], ['do', 'lease', 'lot-11'], ['do', 'renovate', 'lot-11']],
  [['do', 'renovate', 'lot-11'], ['do', 'insure', 'lot-11'], ['do', 'acquire', 'lot-15']],
  [['do', 'lease', 'lot-15'], ['do', 'renovate', 'lot-15'], ['do', 'insure', 'lot-15']]
];
// Before engine code: zero-based rolls are 5, 8, 1 of weight 8: storm, boom, calm.
// Q1: 100-20-5-15+12=72; storm removes the uninsured level, worth becomes 20.
// Q2: 72-15-8-20+12=41; boom adds 5 to prices, worth becomes 45+25=70.
// Q3: 41-5-15-8+26=39; two protected level-two lots are worth 45 each.
const opening = [
  { cash: [72, 83], worth: [20, 20], news: 'storm',
    owned: [['lot-11', 'you', 1], ['lot-12', 'rival', 1]] },
  { cash: [41, 74], worth: [70, 50], news: 'boom',
    owned: [['lot-11', 'you', 2], ['lot-12', 'rival', 1],
      ['lot-15', 'you', 1], ['lot-16', 'rival', 1]] },
  { cash: [39, 67], worth: [90, 80], news: 'calm',
    owned: [['lot-10', 'rival', 1], ['lot-11', 'you', 2], ['lot-12', 'rival', 1],
      ['lot-15', 'you', 2], ['lot-16', 'rival', 1]] }
];

/** Run the ten play contracts through the same core and public door as other suites. */
export async function runPlayTests({ run, core, E, session, hash }) {
  const fresh = () => {
    const s = session();
    s.call('world_open', { name: 'play', size: [40, 40, 16], seed: 7 });
    return s;
  };
  const property = () => {
    const s = session();
    s.call('world_open', { name: 'property-game', kit: 'property', seed: 7 });
    return s;
  };
  const build = (s, ...ops) => s.call('world_build', { ops });
  const parts = (s, ...items) => build(s, ['kit', items]);
  let games;
  const allGames = async () => {
    const { botGame } = await import('../scripts/kit-bot.mjs');
    games ??= Array.from({ length: 12 }, (_, i) => botGame(i + 1));
    return games;
  };
  await run('play-rules', () => {
    const s = property();
    for (let i = 0; i < 3; i++) {
      build(s, ...first[i], ['end']);
      const state = s.world.kit.s, places = Object.values(state.place);
      const actual = {
        cash: ['you', 'rival'].map(id => state.store.cash[id]),
        worth: ['you', 'rival'].map(id => places.filter(p => p.owner === id)
          .reduce((sum, p) => sum + p.worth, 0)),
        news: state.last.news.id,
        owned: places.filter(p => p.owner).map(p => [p.id, p.owner, p.level])
      };
      assert.deepEqual(actual, opening[i]);
    }
  });
  await run('play-bot', async () => {
    const { botGame } = await import('../scripts/kit-bot.mjs');
    const results = await allGames();
    assert.deepEqual(results[6].expected, load('expected').property);
    assert.ok(results.every(result => result.batches.length === 12));
    assert.ok(results.filter(result => result.expected.winner === 'you').length >= 10);
    for (let seed = 1; seed <= 12; seed++) {
      const idle = botGame(seed, true);
      assert.equal(idle.batches.length, 12);
      assert.equal(idle.expected.winner, 'rival');
    }
    const child = spawnSync(process.execPath,
      ['bin/voxel-genesis.mjs', 'run', 'fixtures/kit/property-game.json'], { encoding: 'utf8' });
    assert.equal(child.status, 0, child.stderr);
    assert.ok(child.stdout.includes(results[6].expected.hash));
  });
  await run('play-dice', () => {
    const s = fresh();
    parts(s, { part: 'dice/cube' },
      { part: 'action/roll', then: [['roll', 'cube']] });
    const counts = Array(6).fill(0), before = hash(s.world);
    for (let n = 0; n < 600; n++) {
      build(s, ['do', 'roll']);
      const mixed = Math.imul((7 ^ 0x51ed) ^ 0x9e3779b9, n + 1) >>> 0;
      const expected = 1 + Math.floor(E.rng(mixed)() * 6);
      assert.equal(s.world.kit.s.roll, expected);
      counts[expected - 1]++;
      if (n === 0) {
        const rolled = hash(s.world);
        s.call('world_undo');
        assert.equal(hash(s.world), before);
        build(s, ['do', 'roll']);
        assert.equal(hash(s.world), rolled);
        build(s, ['paint', 'path', 0, 0, 0, 0]);
      }
    }
    assert.ok(counts.every(n => n >= 70 && n <= 130), String(counts));
    const a = fresh(), b = fresh();
    for (const item of [a, b]) parts(item, { part: 'dice/cube' },
      { part: 'action/roll', then: [['roll', 'cube']] });
    build(a, ['do', 'roll'], ['do', 'roll']);
    build(b, ['do', 'roll']);
    build(b, ['do', 'roll']);
    assert.equal(hash(a.world), hash(b.world));
  });
  await run('play-advice', async () => {
    const { advice, moveIssue } = await import('../src/kit/advise.mjs');
    for (const result of await allGames()) {
      assert.equal(result.adviceFailures, 0);
      assert.ok(result.adviceChecked > 0);
    }
    const s = property();
    build(s, ['do', 'acquire', 'lot-11']);
    const options = advice(s.world);
    assert.ok(options.length);
    for (const move of options) {
      assert.equal(moveIssue(s.world, move.op), null);
      assert.match(move.text, /\d/);
      core.applyBatch(s.world, [move.op]);
      if (move.op[1] === 'renovate') assert.match(move.text, /replaces/);
    }
    const empty = fresh();
    parts(empty, { part: 'store/cash' });
    assert.doesNotMatch(empty.call('world_look', { view: 'kit', of: 'play' }), /^can /m);
  });
  await run('play-rival', () => {
    const a = property(), b = property();
    const reply = build(a, ['end']);
    build(b, ['end']);
    assert.equal(hash(a.world), hash(b.world));
    for (const part of [{ part: 'store/cash' }, { part: 'turn/round' },
      { part: 'player/you' }]) {
      const s = fresh();
      parts(s, part);
      build(s, ['end']);
    }
    const s = property();
    const initial = s.state();
    const events = [];
    s.subscribe(event => events.push(event));
    build(s, ...first[0], ['end']);
    for (const reduced of [true, false]) {
      const player = createPlayer(E, { reduced });
      player.load(initial);
      for (const event of events) player.enqueue(event);
      for (let n = 0; n < 20000 && player.busy; n++) player.step(1 / 60);
      assert.equal(hash(player.world), hash(s.world));
      assert.equal(player.needsState, false);
    }
    assert.match(reply, /rival.*acquire.*20.*lease.*5/);
  });
  await run('play-compound', () => {
    const s = property();
    build(s, ['do', 'acquire', 'lot-11'], ['do', 'renovate', 'lot-11']);
    const reply = build(s, ['do', 'redevelop', 'lot-11']);
    assert.match(reply, /fell=0 lost=0 sank=0/);
    assert.equal(s.world.kit.s.place['lot-11'].level, 3);
    assert.equal(s.world.bodies.length, 0);
    for (let x = 21; x <= 28; x++) for (const z of [21, 28]) {
      assert.equal(s.world.get(x, 0, z), s.world.byName.tile);
    }
  });
  await run('play-marks', () => {
    const s = property();
    build(s, ['do', 'acquire', 'lot-11']);
    const w = s.world;
    for (let x = 21; x <= 28; x++) for (let z = 21; z <= 28; z++) {
      if ([21, 28].includes(x) || [21, 28].includes(z)) {
        assert.equal(w.get(x, 0, z), w.byName.tile);
      }
    }
    assert.notEqual(w.kit.parts['player/you'].colour, w.kit.parts['player/rival'].colour);
    const top = s.call('world_look', { view: 'top', at: [21, 21, 28, 28] }).split('\n');
    assert.equal(top[1], w.types[w.byName.tile].glyph.repeat(8));
    assert.equal(top[8], top[1]);
    for (const [width, height, minimum] of [[1280, 800, 8], [375, 812, 4]]) {
      const camera = { world: w, yaw: Math.PI / 4, pitch: Math.PI / 6 };
      fitCamera(camera, width, height);
      assert.ok(width / camera.span / Math.sqrt(2) >= minimum);
    }
    build(s, ['do', 'divest', 'lot-11']);
    assert.equal(s.world.get(21, 0, 21), w.byName.grass);
  });
  await run('play-rejects', async () => {
    const s = property();
    const refused = (op, pattern) => {
      const before = hash(s.world), rev = s.world.rev, logSize = statSync(s.logPath).size;
      assert.throws(() => build(s, op), error => {
        assert.ok(bytes(error.message) <= 200);
        assert.match(error.message, pattern);
        assert.match(error.message, /;/);
        return true;
      });
      assert.equal(hash(s.world), before);
      assert.equal(s.world.rev, rev);
      assert.equal(statSync(s.logPath).size, logSize);
    };
    refused(['do', 'acquir', 'lot-11'], /acquire/);
    refused(['do', 'acquire', 'lot-99'], /place/);
    refused(['do', 'renovate', 'lot-11'], /when.*place.owner/);
    build(s, ['do', 'acquire', 'lot-1'], ['do', 'acquire', 'lot-2']);
    refused(['do', 'acquire', 'lot-3'], /costs 30, you have 20/);
    build(s, ['do', 'lease', 'lot-1']);
    refused(['do', 'lease', 'lot-2'], /moves/);
    for (let n = 0; n < 12; n++) build(s, ['end']);
    refused(['end'], /over/);
  });
  await run('play-parts', () => {
    const s = fresh();
    parts(s, { part: 'store/coins', start: 3 });
    assert.equal(s.world.kit.s.store.coins.you, 3);
    parts(s, { part: 'action/save', cost: { coins: 2 }, then: [['add', 'coins', 4]] });
    build(s, ['do', 'save']);
    assert.equal(s.world.kit.s.store.coins.you, 5);
    const dice = fresh();
    parts(dice, { part: 'dice/cube' });
    build(dice, ['end']);
    const tiny = fresh();
    parts(tiny, { part: 'place/spot', at: [1, 1, 8, 8] }, { part: 'board/token', mark: 'post' },
      { part: 'action/walk', then: [['go'], ['flag', 'found', 1],
        ['ops', [['paint', 'path', 1, 1, 2, 2]]]] });
    build(tiny, ['do', 'walk', 'spot']);
    assert.equal(tiny.world.kit.s.at.you, 'spot');
    assert.equal(tiny.world.kit.s.flag.found, 1);
    assert.ok(tiny.world.get(1, 2, 1));
    const attached = property();
    build(attached, ['do', 'acquire', 'lot-11']);
    build(attached, ['edit', 'board/lots', 'props.visits', 0]);
    assert.equal(attached.world.kit.s.place['lot-11'].owner, 'you');
    assert.equal(attached.world.kit.s.place['lot-11'].visits, 0);
    const cells = attached.world.cells.slice();
    build(attached, ['cut', 'play']);
    assert.deepEqual(attached.world.cells, cells);
    assert.equal(attached.world.kit.s.store, undefined);
    assert.equal(attached.world.kit.s.turn, undefined);
    assert.equal(attached.world.kit.s.place['lot-11'].owner, undefined);
  });
  await run('play-caps', async () => {
    for (const result of await allGames()) {
      assert.equal(result.batches.length, 12);
      assert.ok(Math.max(...result.replyBytes) <= 700);
      assert.ok(result.bytes.reduce((a, b) => a + b, 0) / 12 <= 520);
    }
    const s = property();
    assert.ok(bytes(s.call('world_look', { view: 'kit', of: 'play' })) <= 900);
    const sizes = [];
    for (const ops of load('property-game').batches) {
      const reply = build(s, ...ops);
      assert.match(reply, /play quarter/);
      assert.match(reply, /can /);
      assert.ok(bytes(reply) <= 700);
      sizes.push(bytes({ ops }) + bytes(reply));
    }
    assert.ok(sizes.reduce((a, b) => a + b, 0) / 12 <= 520);
    const opened = session();
    const reply = opened.call('world_open', { name: 'property-open', kit: 'property', seed: 7 });
    assert.ok(bytes(reply) <= 1600);
    assert.match(JSON.stringify(reply), /play quarter/);
  });
}
