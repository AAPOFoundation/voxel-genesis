// Reproduce dispatch seven's customer-visible defects through the real player and rules.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createPlayer } from '../viewer/player.mjs';
import { buildDynamicMesh } from '../viewer/geometry.mjs';
import { stats, moves, play, town } from '../src/games/town.mjs';
import { townNeeds } from '../src/copy.mjs';

const blank = () => ({ t: 8, coins: 30,
  lots: Array.from({ length: 36 }, () => ['.', 0, 0]) });
const listed = report => [...report.matchAll(/(build \w+ \d \d|grow \d \d) \d+c/g)]
  .map(match => match[1].split(' ').map(word => /^\d$/.test(word) ? +word : word));

/** Register before/after regressions for every requested fix. */
export async function runFeedbackTests({ run, session, core, E, hash, home }) {
  await run('dispatch7-run', () => {
    const folder = home();
    const watcher = session(folder);
    const player = createPlayer(E);
    watcher.subscribe(event => player.enqueue(event));
    const result = spawnSync(process.execPath,
      ['bin/voxel-genesis.mjs', 'run', 'fixtures/small-town.json'],
      { encoding: 'utf8', env: { ...process.env, VOXEL_GENESIS_HOME: folder }, windowsHide: true });
    assert.equal(result.status, 0, result.stderr);
    watcher.catchUp();
    assert.equal(player.needsState, false, 'new-world burst has its initial state');
    const busy = Array(watcher.world.rev).fill(0);
    for (let n = 0; player.busy && n < 20000; n++) {
      busy[player.world.rev]++;
      player.step(1 / 60);
    }
    assert.ok(busy.every(n => n > 0), 'real CLI run animates every batch');
    assert.equal(player.hash, hash(watcher.world));
  });
  await run('dispatch7-queue', () => {
    const fixture = JSON.parse(readFileSync('fixtures/small-town.json', 'utf8'));
    const s = session();
    s.call('world_open', fixture.open);
    const player = createPlayer(E);
    player.load(s.state());
    const hashes = [];
    for (const ops of fixture.batches) {
      s.call('world_build', { ops });
      hashes.push(hash(s.world));
      player.enqueue({ rev: s.world.rev, line: { ops }, hash: hash(s.world) });
    }
    assert.equal(player.needsState, false, 'arriving batches must queue');
    const busy = Array(hashes.length).fill(0);
    for (let n = 0; player.busy && n < 20000; n++) {
      busy[player.world.rev]++;
      const rev = player.world.rev;
      player.step(1 / 60);
      if (player.world.rev !== rev) assert.equal(player.hash, hashes[rev]);
      assert.equal(player.needsState, false);
    }
    assert.ok(busy.every(n => n > 0), 'every fixture batch has busy steps');
    assert.equal(player.busy, false);
    assert.equal(player.hash, hash(s.world));
  });
  await run('dispatch7-resync', () => {
    for (const reason of ['gap', 'undo', 'backlog', 'hash']) {
      const s = session();
      s.call('world_open', { name: 'fall', size: [8, 8, 8] });
      const player = createPlayer(E);
      player.load(s.state());
      const ops = [['drop', 'brick', 2, 2, 3]];
      s.call('world_build', { ops });
      player.enqueue({ rev: 1, line: { ops },
        hash: reason === 'hash' ? 'bad' : hash(s.world) });
      player.step(1 / 60);
      assert.ok(player.world.bodies.length > 0);
      if (reason === 'gap') player.enqueue({ rev: 3, line: { ops } });
      if (reason === 'undo') player.enqueue({ rev: 2, line: { undo: 1 } });
      if (reason === 'backlog') {
        for (let rev = 2; rev <= 14; rev++) player.enqueue({ rev, line: { ops } });
      }
      assert.equal(player.needsState, false, reason + ' must wait for the fall');
      for (let n = 0; player.busy && n < 5000; n++) player.step(1 / 60);
      assert.equal(player.world.bodies.length, 0);
      assert.equal(player.needsState, true, reason);
    }
  });
  await run('dispatch7-boundary', () => {
    for (const reduced of [false, true]) {
      const s = session();
      s.call('world_open', { name: 'boundary', size: [8, 8, 8] });
      const player = createPlayer(E);
      player.load(s.state());
      const add = x => {
        const ops = [['drop', 'brick', x, 2, 1]];
        s.call('world_build', { ops });
        player.enqueue({ rev: s.world.rev, line: { ops }, hash: hash(s.world) });
      };
      add(2);
      add(3);
      while (player.world.rev === 0) player.step(1 / 60);
      add(4);
      if (reduced) player.reduced(true);
      for (let n = 0; player.busy && n < 5000; n++) player.step(1 / 60);
      assert.equal(player.busy, false, 'queued work finishes across a motion toggle');
      assert.equal(player.needsState, false, 'arrivals between batches preserve order');
      assert.equal(player.hash, hash(s.world));
    }
  });
  await run('dispatch7-switch', () => {
    for (const overflow of [false, true]) {
      const s = session();
      const player = createPlayer(E);
      s.subscribe(event => player.enqueue(event));
      s.call('world_open', { name: 'old', size: [8, 8, 8] });
      s.call('world_build', { ops: [['drop', 'brick', 2, 2, 2]] });
      player.step(1 / 60);
      s.call('world_open', { name: 'new', size: [8, 8, 8] });
      for (let n = 0; n < (overflow ? 14 : 2); n++) {
        s.call('world_build', { ops: [['paint', 'path', 1, 1, 2, 2]] });
      }
      assert.equal(player.world.name, 'old', 'world switch waits for the old fall');
      assert.equal(player.needsState, false);
      for (let n = 0; player.busy && n < 5000; n++) player.step(1 / 60);
      assert.equal(player.world.bodies.length, 0);
      if (overflow) assert.equal(player.needsState, true, 'new-world backlog still resyncs');
      else {
        assert.equal(player.needsState, false);
        assert.equal(player.world.name, 'new');
        assert.equal(player.hash, hash(s.world));
      }
    }
  });
  await run('dispatch7-water', () => {
    for (const level of [0, 3]) {
      const s = session();
      s.call('world_open', { name: 'water', size: [8, 8, 12] });
      s.call('world_build', { ops: [['box', 'water', 1, level, 1, 4, level, 4]] });
      const player = createPlayer(E);
      player.load(s.state());
      const ops = [['drop', 'sun', 2, 2, 3]];
      const reply = s.call('world_build', { ops });
      assert.match(reply, /sank=3/);
      assert.ok(reply.includes('at=ops[0]:2,' + level + ',2'), reply);
      player.enqueue({ rev: s.world.rev, line: { ops }, hash: hash(s.world) });
      let shrinking = false;
      let wetFrames = 0;
      for (let n = 0; player.busy && n < 5000; n++) {
        player.step(1 / 60);
        const mesh = buildDynamicMesh(player.world);
        for (let i = 1; i < mesh.length; i += 8) {
          assert.ok(mesh[i] >= level, 'visible bodies stay at the water');
        }
        if (player.world.bodies.some(b => b.wet)) {
          wetFrames++;
          const ys = Array.from(mesh).filter((_, i) => i % 8 === 1);
          if (ys.length && Math.max(...ys) - Math.min(...ys) < .9) shrinking = true;
        }
      }
      assert.ok(wetFrames >= 10 && shrinking, 'slow sinking and shrinking are visible');
      assert.equal(player.needsState, false);
      assert.equal(player.hash, hash(s.world));
    }
  });
  await run('dispatch7-needs', () => {
    const g = blank();
    g.lots[2] = ['#', 1, 0];
    g.lots[8] = ['h', 1, 4];
    assert.ok(townNeeds(g, stats(g)).includes('a park by the home at 2 1'));
    const report = town.report({ game: g });
    const park = listed(report).find(op => op[1] === 'park');
    assert.ok(park, report);
    play(g, park);
    assert.ok(!townNeeds(g, stats(g)).some(need => need.includes('a park')));
    g.lots[9] = ['w', 1, 0];
    const quiet = town.report({ game: g });
    assert.match(quiet, /quiet.*2 1/);
    assert.ok(listed(quiet).some(op => {
      const next = structuredClone(g);
      play(next, op);
      return stats(next).Pn < stats(g).Pn;
    }), quiet);
    g.coins = 1;
    const cheap = town.report({ game: g });
    assert.ok(listed(cheap).some(op => {
      const next = structuredClone(g);
      play(next, op);
      return stats(next).Pn < stats(g).Pn;
    }), 'one coin can replace the noisy work with road: ' + cheap);
    g.coins = 30;
    g.lots[8] = ['h', 2, 8];
    g.lots[9] = ['.', 0, 0];
    const shortfalls = town.report({ game: g });
    for (const key of ['J', 'S']) {
      assert.ok(listed(shortfalls).some(op => {
        const next = structuredClone(g);
        play(next, op);
        return stats(next)[key] > stats(g)[key];
      }), shortfalls);
    }
    const full = blank();
    full.lots = full.lots.map(() => ['s', 1, 0]);
    full.lots[2] = ['#', 1, 0];
    full.lots[8] = ['h', 1, 4];
    full.coins = 3;
    const crowded = town.report({ game: full });
    assert.ok(listed(crowded).some(op => {
      const next = structuredClone(full);
      play(next, op);
      return stats(next).greens[8];
    }), 'a park remedy is disclosed when no adjacent free lot remains: ' + crowded);
  });
  await run('dispatch7-sleepers', () => {
    const g = blank();
    g.lots[7] = ['#', 1, 0];
    g.lots[1] = ['#', 1, 0];
    g.lots[15] = ['h', 1, 0];
    g.lots[28] = ['h', 1, 0];
    const report = town.report({ game: g });
    assert.match(report, /2 sleeping homes/);
    assert.match(report, /2 roads/);
    const road = listed(report).find(op => op[1] === 'road');
    assert.ok(road, report);
    play(g, road);
    play(g, ['turn']);
    const next = town.report({ game: g });
    play(g, listed(next).find(op => op[1] === 'road'));
    play(g, ['turn']);
    assert.equal(stats(g).awake[15], true, 'advertised two-road remedy wakes the home');
    const one = blank();
    one.lots[1] = ['#', 1, 0];
    one.lots[14] = ['h', 1, 0];
    one.lots[7] = ['#', 1, 0];
    const move = listed(town.report({ game: one })).find(op => op[1] === 'road');
    play(one, move);
    play(one, ['turn']);
    assert.equal(stats(one).awake[14], true, 'one-road remedy must wake after a turn');
  });
  await run('dispatch7-replacements', () => {
    const g = blank();
    g.lots[1] = ['#', 1, 0];
    g.lots[14] = ['h', 1, 0];
    g.lots[7] = ['p', 1, 0];
    assert.notDeepEqual(moves(g)[0].op, ['build', 'road', 1, 1], 'prefer a free route');
    for (const code of ['p', '*']) {
      const blocked = blank();
      blocked.lots = blocked.lots.map(() => ['~', 1, 0]);
      blocked.lots[0] = [code, 1, 0];
      blocked.lots[6] = ['h', 1, 0];
      const report = town.report({ game: blocked });
      assert.match(report, code === 'p' ? /replaces park/ : /replaces trees/);
    }
  });
  await run('dispatch7-prices', () => {
    const s = session();
    const opened = s.call('world_open', { name: 'prices', game: 'town' });
    const prices = 'home 4, shop 6, work 6, park 3, road 1';
    assert.equal(opened.how.split(prices).length - 1, 1);
    assert.equal(readFileSync('README.md', 'utf8').split(prices).length - 1, 1);
    assert.ok(Buffer.byteLength(JSON.stringify(opened)) <= 1200);
    s.call('world_build', { ops: [['build', 'home', 0, 0], ['build', 'park', 1, 0]] });
    assert.throws(() => s.call('world_build', { ops: [['build', 'work', 2, 0]] }),
      error => error.code === 'coins' && /work costs 6, you have 5\./.test(error.message));
  });
}
