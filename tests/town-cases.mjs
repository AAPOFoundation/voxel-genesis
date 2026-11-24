// Verify town rules, immutable fixtures, atomic refusals and browser playback.
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createPlayer } from '../viewer/player.mjs';
import { SERVER_INSTRUCTIONS, TOOL_COPY } from '../src/copy.mjs';

/** Register town checks alongside the existing invariant cases. */
export async function runTownTests({ run, core, E, session, hash, floating, home }) {
  const open = s => s.call('world_open', { name: 'town-game', game: 'town', seed: 7 });
  const build = (s, ops) => s.call('world_build', { ops });
  const load = name => JSON.parse(readFileSync('fixtures/' + name + '.json', 'utf8'));
  const game = () => import('../src/games/town.mjs');
  const bot = () => import('../scripts/town-bot.mjs');
  function rejects(s, code, tool, args) {
    const before = [hash(s.world), s.world.rev, statSync(s.logPath).size];
    assert.throws(() => s.call(tool, args), error => {
      assert.equal(error.code, code);
      assert.ok(Buffer.byteLength(error.message) <= 200);
      return true;
    });
    assert.deepEqual([hash(s.world), s.world.rev, statSync(s.logPath).size], before);
  }
  await run('town-seam', async () => {
    const s = session();
    s.call('world_open', { name: 'plain' });
    assert.equal(JSON.parse(readFileSync(s.logPath, 'utf8').split('\n')[0]).rules, 'none@0');
    rejects(s, 'op', 'world_build', { ops: [['turn']] });
    rejects(s, 'noGame', 'world_look', { view: 'town' });
    open(s);
    assert.equal(JSON.parse(readFileSync(s.logPath, 'utf8').split('\n')[0]).rules, 'town@1');
    const before = structuredClone(s.world.game);
    build(s, [['box', 'brick', 0, 1, 0, 0, 1, 0]]);
    assert.deepEqual(s.world.game, before);
    assert.equal(s.state().rules, 'town@1');
    assert.deepEqual(s.state().game, before);
  });
  await run('town-rules', async () => {
    const { stats, town } = await game();
    const s = session();
    open(s);
    assert.deepEqual(Object.keys(s.world.game), ['t', 'coins', 'lots']);
    assert.equal(s.world.game.t, 1);
    assert.equal(s.world.game.coins, 12);
    assert.deepEqual(s.world.game.lots.flatMap(([code], i) => code === '.' ? [] : [[i, code]]),
      [[4, '#'], [10, '#'], [16, '#'], [28, '*'], [29, '~'], [31, '*']]);
    const inspect = () => {
      const st = stats(s.world.game);
      return [s.world.game.coins, st.P, st.C, st.hearts, st.happy];
    };
    build(s, [['build', 'home', 3, 0], ['build', 'home', 3, 1], ['turn']]);
    assert.deepEqual(inspect(), [8, 4, 8, 8, 66]);
    build(s, [['build', 'work', 2, 0], ['turn']]);
    assert.deepEqual(inspect(), [6, 6, 8, 5, 27]);
    assert.equal(stats(s.world.game).asleep, 1);
    assert.equal(stats(s.world.game).Pn, 3);
    build(s, [['turn']]);
    assert.deepEqual(inspect(), [10, 8, 8, 4, 16]);
    assert.match(town.report(s.world), /4 more jobs.*more shops.*a park by the home at 3 0/);

    assert.equal(s.call('world_look', { view: 'town', at: [-1, -1, -1, -1], z: -1 }),
      s.call('world_look', { view: 'town' }));
  });
  await run('town-idle', async () => {
    const { stats } = await game();
    const s = session();
    open(s);
    for (let t = 0; t < 24; t++) build(s, [['turn']]);
    assert.equal(s.world.game.coins, 84);
    assert.equal(stats(s.world.game).hearts, 0);
    assert.equal(stats(s.world.game).stars, 0);
    assert.match(s.call('world_look', { view: 'town' }),
      /No stars yet.*0 hearts, goal 120.*The helper made 168/);
    for (const op of [['build', 'home', 0, 0], ['grow', 0, 0], ['auto'], ['turn']]) {
      rejects(s, 'over', 'world_build', { ops: [op] });
    }
  });
  await run('town-advice', async () => {
    const { startGame, moves, play, stats, town } = await game();
    for (let seed = 1; seed <= 12; seed++) {
      const g = startGame(seed, E.rng);
      while (g.t <= 24) {
        for (let n = 0; n < 6; n++) {
          const choices = moves(g);
          for (const move of choices) {
            assert.ok(move.cost <= g.coins);
            assert.doesNotThrow(() => play(structuredClone(g), move.op));
          }
          const report = town.report({ game: g });
          const listed = [...report.matchAll(/(build \w+ \d \d|grow \d \d) \d+c/g)];
          const kinds = listed.map(m => m[1].startsWith('grow') ? 'grow' : m[1].split(' ')[1]);
          if (new Set(choices.map(m => m.op[0] === 'grow' ? 'grow' : m.op[1])).size > 1) {
            assert.ok(kinds.every(k => kinds.filter(n => n === k).length <= 2));
          }
          if (!choices.length) break;
          play(g, choices[0].op);
        }
        play(g, ['turn']);
      }
      assert.ok(stats(g).hearts >= 120, 'greedy seed ' + seed);
      assert.deepEqual(moves(g), []);
    }
    for (const coins of [0, 1, 5]) {
      const g = startGame(7, E.rng);
      g.lots[16] = ['h', 1, 0];
      g.lots[10] = ['.', 0, 0];
      g.coins = coins;
      const report = town.report({ game: g });
      assert.match(report, /road to sleeping home at 4 2/);
      assert.ok(moves(g).every(m => m.cost <= coins));
      if (!coins) play(g, ['turn']);
      for (let n = 0; !stats(g).awake[16] && n < 2; n++) {
        const move = moves(g)[0];
        assert.equal(move.op[1], 'road');
        play(g, move.op);
      }
      assert.equal(stats(g).awake[16], true, 'sleeping home receives a waking move');
    }
    const g = startGame(7, E.rng);
    play(g, ['build', 'home', 3, 0]);
    play(g, ['turn']);
    assert.doesNotMatch(town.report({ game: g }), /more jobs|more shops/);
    g.lots[4] = ['#', 1, 0];
    g.lots[3] = ['w', 1, 0];
    g.lots[9] = ['h', 2, 8];
    g.lots[15] = ['h', 2, 8];
    g.coins = 8;
    assert.ok(moves(g).some(m => m.op.join() === 'grow,3,0'),
      'workshop growth can meet a shortfall without adding another noisy neighbour');
  });
  await run('town-bot', async () => {
    const { botBatches } = await bot();
    const { stats } = await game();
    const batches = botBatches(7);
    assert.equal(batches.length, 24);
    assert.equal(batches.flat().filter(op => op[0] !== 'turn').length, 42);
    assert.deepEqual(batches[0], [['build', 'home', 4, 3], ['grow', 4, 3], ['turn']]);
    assert.deepEqual(batches, load('town-game').batches);
    const s = session();
    open(s);
    for (const ops of batches) build(s, ops);
    const st = stats(s.world.game);
    assert.deepEqual([st.hearts, st.P, st.happy, s.world.game.coins, st.stars],
      [168, 56, 100, 59, 2]);
    const auto = session();
    open(auto);
    for (let t = 0; t < 24; t++) {
      build(auto, [...Array.from({ length: 6 }, () => ['auto']), ['turn']]);
    }
    assert.equal(hash(auto.world), hash(s.world));
    for (let seed = 1; seed <= 5; seed++) {
      const s = session();
      s.call('world_open', { game: 'town', seed });
      for (const ops of botBatches(seed)) build(s, ops);
      assert.ok(stats(s.world.game).hearts >= 120, 'seed ' + seed);
    }
  });
  await run('town-determinism', async () => {
    const fixture = load('town-game');
    const expected = load('town-expected');
    const { stats } = await game();
    for (let n = 0; n < 2; n++) {
      const s = session();
      open(s);
      for (const ops of fixture.batches) {
        const reply = build(s, ops);
        assert.match(reply, /fell=0 lost=0 sank=0/);
        assert.equal(floating(s.world), null);
        assert.ok(core.quiet(s.world));
        assert.ok(s.world.life.length <= 10);
      }
      const st = stats(s.world.game);
      assert.deepEqual({ hash: hash(s.world), count: s.world.cells.filter(Boolean).length,
        rev: s.world.rev, hearts: st.hearts, people: st.P, happy: st.happy,
        coins: s.world.game.coins, stars: st.stars }, expected);
    }
    const s = session();
    open(s);
    build(s, fixture.batches.flat());
    assert.equal(hash(s.world), expected.hash);
    const child = spawnSync(process.execPath,
      ['bin/voxel-genesis.mjs', 'run', 'fixtures/town-game.json'],
      { encoding: 'utf8', env: { ...process.env, VOXEL_GENESIS_HOME: home() } });
    assert.equal(child.status, 0, child.stderr);
    assert.ok(child.stdout.includes(expected.hash));
  });
  await run('town-undo', async () => {
    const s = session();
    open(s);
    const batches = load('town-game').batches.slice(0, 3);
    build(s, batches[0]);
    const earlier = hash(s.world);
    for (const ops of batches.slice(1)) build(s, ops);
    const later = hash(s.world);
    assert.ok(s.call('world_undo', { steps: 2 }).includes(earlier));
    assert.ok(s.call('world_look', { view: 'town' }).includes('town turn 2/24'));
    for (const ops of batches.slice(1)) build(s, ops);
    assert.equal(hash(s.world), later);
  });
  await run('town-rejects', async () => {
    const s = session();
    open(s);
    for (const [code, op] of [
      ['pond', ['build', 'home', 5, 4]], ['lot', ['build', 'home', 6, 0]],
      ['kind', ['build', 'other', 0, 0]], ['same', ['build', 'road', 4, 0]],
      ['gameRep', ['rep', 1, 0, 0, 0, [['turn']]]],
      ['gameRep', ['rep', 1, 0, 0, 0, [['grow', 3, 0]]]],
      ['gameRep', ['rep', 1, 0, 0, 0, [['auto']]]]
    ]) rejects(s, code, 'world_build', { ops: [op] });
    build(s, [['build', 'park', 0, 0]]);
    rejects(s, 'grow', 'world_build', { ops: [['grow', 0, 0]] });
    rejects(s, 'coins', 'world_build',
      { ops: [['build', 'shop', 3, 0], ['build', 'shop', 3, 1]] });
    rejects(s, 'townSize', 'world_open', { game: 'town', size: [12, 12, 16] });
    s.call('world_open', { name: 'plain' });
    rejects(s, 'game', 'world_open', { game: 'town' });
    const repeated = session();
    open(repeated);
    build(repeated, [['rep', 2, 0, 0, 1, [['build', 'home', 3, 0]]]]);
    assert.equal(repeated.world.game.lots[9][0], 'h');
  });
  await run('town-caps', async () => {
    const s = session();
    const size = value => Buffer.byteLength(
      typeof value === 'string' ? value : JSON.stringify(value)
    );
    assert.ok(size(open(s)) <= 1200);
    let bytes = 0;
    for (const ops of load('town-game').batches) {
      const reply = build(s, ops);
      assert.ok(size(reply) <= 500, 'build bytes ' + size(reply));
      assert.ok(size(s.call('world_look', { view: 'town' })) <= 900);
      bytes += size({ ops }) + size(reply);
    }
    assert.ok(bytes / 24 <= 450, 'mean bytes ' + bytes / 24);
    assert.equal(TOOL_COPY.length, 4);
    assert.ok(size({ jsonrpc: '2.0', id: 1, result: { tools: TOOL_COPY } }) +
      size(SERVER_INSTRUCTIONS) <= 2500);
  });
  await run('town-viewer', async () => {
    const { town } = await game();
    for (const reduced of [false, true]) {
      const s = session();
      open(s);
      let updates = 0;
      const player = createPlayer(E, { reduced, onChange: () => updates++ });
      player.load(s.state());
      assert.equal(updates, 1, 'load updates the HUD');
      for (let frame = 0; frame < 120; frame++) player.step(1 / 60);
      assert.equal(updates, 1, 'idle frames do no HUD work');
      assert.equal(player.hash, hash(s.world));
      for (const ops of load('town-game').batches) {
        build(s, ops);
        const before = updates;
        player.enqueue({ rev: s.world.rev, line: { ops }, hash: hash(s.world) });
        for (let frame = 0; player.busy && frame < 10000; frame++) player.step(1 / 60);
        assert.equal(player.needsState, false);
        assert.equal(player.busy, false);
        assert.equal(player.hash, hash(s.world));
        assert.deepEqual(town.hud(player.world), town.hud(s.world));
        assert.ok(updates > before, 'playback updates the HUD');
      }
    }
  });
}
