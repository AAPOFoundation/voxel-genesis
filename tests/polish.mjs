// Check catalogue compatibility, toy geometry, camera framing and loopback discovery.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { request } from 'node:http';
import { startHttp, startAvailable } from '../src/http.mjs';
import { viewerLink } from '../src/viewer-link.mjs';
import { createPlayer } from '../viewer/player.mjs';
import { fitCamera } from '../viewer/camera.mjs';
import { decode } from '../src/core/codec.mjs';
import { SET_ID } from '../src/core/palette.mjs';
const load = name => JSON.parse(readFileSync('fixtures/' + name + '.json', 'utf8'));
const get = (port, path) => new Promise((resolve, reject) => {
  request({ host: '127.0.0.1', port, path }, res => {
    let text = '';
    res.on('data', chunk => text += chunk);
    res.on('end', () => resolve({ status: res.statusCode, text }));
  }).on('error', reject).end();
});
const call = (home, tool, value = '{}') => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, ['bin/voxel-genesis.mjs', 'call', tool, value], {
    env: { ...process.env, VOXEL_GENESIS_HOME: home }, windowsHide: true
  });
  let raw = '';
  child.stdout.on('data', chunk => raw += chunk);
  child.on('error', reject);
  child.on('close', code => {
    try {
      assert.equal(code, 0, raw);
      resolve(JSON.parse(raw));
    } catch (error) {
      reject(error);
    }
  });
});
/** Register regressions for the second taste review. */
export async function runPolishTests({ run, core, E, hash, session, home }) {
  await run('legacy-sets', () => {
    const expected = load('base-one-expected');
    for (const name of [...Object.keys(expected), 'town-game']) {
      const fixture = load(name);
      if (name === 'town-game') fixture.batches = load('base-two-expected').batches;
      const town = name === 'town-game';
      const record = town ? load('town-base-one-expected') : expected[name];
      const rules = town ? 'town@1' : 'none@0';
      const old = core.newWorld({ ...fixture.open, set: 'base@1', rules });
      const header = { v: 1, set: 'base@1', world: old.name,
        size: [old.w, old.d, old.h], seed: old.seed, rules };
      const lines = fixture.batches.map(ops => ({ ops }));
      const world = core.replay(header, lines).world;
      assert.equal(hash(world), record.hash, name + ' legacy hash');
      assert.equal(world.cells.filter(Boolean).length, record.count);
      const s = session();
      s.call('world_open', { name: old.name });
      writeFileSync(s.logPath, [header, ...lines].map(JSON.stringify).join('\n') + '\n');
      s.call('world_open', { name: old.name });
      assert.equal(hash(s.world), record.hash, 'legacy session reopen');
      assert.equal(s.state().set, 'base@1');
      const player = createPlayer(E, { reduced: true });
      player.load(s.state());
      assert.equal(player.needsState, false);
      assert.equal(player.hash, record.hash, 'legacy viewer snapshot');
      s.call('world_undo');
      s.call('world_build', { ops: fixture.batches.at(-1) });
      assert.equal(hash(s.world), record.hash, 'legacy undo and redo');
      assert.throws(() => s.call('world_build', { ops: [['box', 'tile', 0, 1, 0, 0, 1, 0]] }));
    }
    assert.throws(() => decode([17, 1], 1, 'base@1'));
    assert.deepEqual([...decode([20, 1], 1, SET_ID)], [20]);
    assert.throws(() => decode([21, 1], 1, SET_ID));
  });
  await run('prefab-craft', () => {
    let world = core.newWorld({ size: [24, 24, 16] });
    world = core.applyBatch(world, [['stamp', 'cottage', 1, 1, 0],
      ['stamp', 'house', 8, 1, 0], ['stamp', 'barn', 1, 10, 0]]).world;
    assert.equal(world.type(3, 1, 1).name, 'timber', 'front door');
    assert.equal(world.type(2, 2, 1).name, 'blue');
    assert.equal(world.type(4, 2, 1).name, 'blue');
    assert.equal(world.type(2, 1, 1).name, 'plaster', 'plain ground row');
    for (const [x, y, z] of [[8, 5, 1], [1, 5, 10], [11, 7, 5], [11, 8, 5]]) {
      const type = world.type(x, y, z);
      assert.equal(type.name, 'tile');
      assert.ok(!type.windows && !type.details?.length);
    }
    assert.equal(world.type(11, 8, 5).color, '#be5727', 'two-block chimney');
    for (const name of ['cottage', 'house', 'tower']) {
      for (const turns of [0, 1, 2, 3]) {
        const w = core.applyBatch(core.newWorld({ size: [16, 16, 16] }),
          [['stamp', name, 0, 0, turns]]).world;
        const [width, depth] = name === 'tower' ? [4, 4]
          : name === 'house' ? (turns % 2 ? [6, 5] : [5, 6]) : [5, 5];
        for (const face of [0, 1, 2, 3]) {
          let windows = 0;
          for (let x = 0; x < width; x++) for (let z = 0; z < depth; z++) {
            if ([z === 0, x === width - 1, z === depth - 1, x === 0][face]) {
              for (let y = 1; y < 12; y++) windows += w.get(x, y, z) === w.byName.blue;
            }
          }
          assert.ok(windows >= (name === 'tower' ? 6 : 1), name + ' face ' + face);
        }
      }
    }
  });
  await run('base-two-replay', () => {
    const old = load('base-two-expected');
    for (const name of ['tiny-garden', 'small-town', 'hill-village', 'town-game']) {
      const fixture = load(name);
      const game = name === 'town-game';
      const rules = game ? 'town@1' : 'none@0';
      const batches = game ? old.batches : fixture.batches;
      const header = { ...fixture.open, world: fixture.open.name, v: 1, set: 'base@2', rules };
      header.size ??= game ? [36, 36, 16] : [32, 32, 24];
      const expected = game ? old.town : old[name];
      const world = core.replay(header, batches.map(ops => ({ ops }))).world;
      assert.equal(hash(world), expected.hash, name + ' base@2');
      if (game) {
        let auto = core.newWorld({ ...fixture.open, rules, set: 'base@2' });
        for (let n = 0; n < 24; n++) {
          auto = core.applyBatch(auto,
            [...Array.from({ length: 6 }, () => ['auto']), ['turn']]).world;
        }
        assert.equal(hash(auto), expected.hash, 'legacy auto retains its old choices');
      }
    }
  });
  await run('build-hints', () => {
    const s = session();
    s.call('world_open', { size: [16, 16, 16] });
    const build = ops => s.call('world_build', { ops });
    assert.match(build([['scatter', 'tree', 0, 0, 2, 2, 8]]), /placed=1\/8/);
    assert.match(build([['scatter', 'tree', 0, 0, 2, 2, 8]]), /placed=0\/8/);
    assert.match(build([['rep', 2, 3, 0, 0, [['scatter', 'leaf', 5, 0, 5, 0, 1]]]]),
      /placed=2\/2/);
    for (const turns of [0, 1, 2, 3]) {
      const plain = core.newWorld({ size: [16, 16, 16] });
      const bridge = ['stamp', 'bridge', 4, 4, turns];
      assert.equal(core.applyBatch(plain, [bridge]).result.bridgeOpen, false);
      const wet = core.applyBatch(plain, [['paint', 'water', 0, 0, 15, 15]]).world;
      assert.equal(core.applyBatch(wet, [bridge]).result.bridgeOpen, true);
      const shore = turns % 2 ? [['paint', 'grass', 4, 3, 6, 3],
        ['paint', 'grass', 4, 10, 6, 10]] : [['paint', 'grass', 3, 4, 3, 6],
        ['paint', 'grass', 10, 4, 10, 6]];
      assert.equal(core.applyBatch(wet, [...shore, bridge]).result.bridgeOpen, false);
    }
    assert.match(build([['paint', 'water', 0, 0, 15, 15], ['stamp', 'bridge', 4, 4, 0]]),
      /note=bridge-ends-open/);
  });
  await run('camera-life', () => {
    const s = session();
    s.call('world_open', { game: 'town', seed: 7 });
    for (const ops of load('town-game').batches) s.call('world_build', { ops });
    const player = createPlayer(E, { reduced: true });
    player.load(s.state());
    const camera = { world: player.world, yaw: Math.PI - .7, pitch: .56 };
    assert.ok(Math.cos(camera.yaw) < 0, 'default view shows low z doors');
    for (const [width, height] of [[351, 575], [1280, 600]]) {
      fitCamera(camera, width, height);
      const original = camera.span;
      if (width === 351) {
        const across = 36 * (Math.abs(Math.cos(camera.yaw)) + Math.abs(Math.sin(camera.yaw)));
        assert.ok(across / original >= .85, 'phone width fill');
      }
      fitCamera(camera, width, height, 1 / 1.15);
      assert.ok(camera.span < original, 'first zoom in grows the world');
      fitCamera(camera, width, height, 2);
      assert.ok(camera.span > original, 'zoom out works');
      for (const zoom of [-20, .6, 1, 2, 20]) {
        fitCamera(camera, width, height, zoom);
        assert.ok(camera.span >= original * .6 && camera.span <= original * 2);
        assert.deepEqual([camera.focus[0], camera.focus[2]], [18, 18]);
      }
    }
    const car = player.world.agents.find(agent => agent.path);
    const pet = player.world.agents.find(agent => !agent.path);
    const parts = car.boxes(player.world);
    assert.equal(parts.length, 6);
    assert.equal(Math.max(parts[0].w, parts[0].d), 1);
    assert.deepEqual(parts[2].rgb, [61, 58, 54]);
    assert.equal(pet.boxes(player.world)[0].w, .6);
    player.step(1);
    assert.deepEqual(car.boxes(player.world), parts, 'reduced motion keeps cars still');
  });
  await run('layer-playback', () => {
    const s = session();
    s.call('world_open', { size: [16, 16, 16] });
    const player = createPlayer(E);
    player.load(s.state());
    const ops = [['stamp', 'cottage', 1, 1, 0]];
    s.call('world_build', { ops });
    player.enqueue({ rev: s.world.rev, line: { ops }, hash: hash(s.world) });
    player.step(1 / 60);
    const initial = player.world.cells.filter(Boolean).length;
    assert.ok(initial < s.world.cells.filter(Boolean).length, 'stamp is not presented whole');
    player.step(.1);
    assert.ok(player.world.cells.filter(Boolean).length > initial, 'next layer arrives');
    player.reduced(true);
    assert.equal(player.busy, false, 'motion preference finishes pending layers');
    assert.equal(player.needsState, false);
    assert.equal(player.hash, hash(s.world));
  });
  await run('viewer-discovery', async () => {
    const folder = home();
    const s = session(folder);
    s.call('world_open', { game: 'town', seed: 7 });
    assert.equal(await viewerLink(folder), null);
    const server = await startHttp({ session: s, port: 0 });
    try {
      assert.equal(await viewerLink(folder), s.viewer);
      assert.equal((await call(folder, 'world_open')).viewer, s.viewer);
      const input = join(folder, 'view.json');
      writeFileSync(input, JSON.stringify({ view: 'info' }));
      assert.ok((await call(folder, 'world_look', '@' + input)).includes(s.viewer));
      const port = server.address().port;
      for (const path of ['/', '/api/state', '/api/viewer', '/viewer.mjs', '/player.mjs',
        '/life.mjs', '/core/palette.mjs', '/core/palette-v1.mjs', '/core/prefabs-v1.mjs',
        '/core/bridge.mjs', '/games/town.mjs', '/copy.mjs', '/engine.js']) {
        assert.equal((await get(port, path)).status, 200, path + ' clean load');
      }
      assert.equal((await get(port, '/favicon.ico')).status, 204);
      const pending = ['/viewer.mjs'];
      const seen = new Set();
      while (pending.length) {
        const path = pending.pop();
        if (seen.has(path)) continue;
        seen.add(path);
        const result = await get(port, path);
        assert.equal(result.status, 200, 'module graph ' + path);
        for (const match of result.text.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
          pending.push(new URL(match[1], 'http://127.0.0.1:' + port + path).pathname);
        }
      }
      writeFileSync(join(folder, 'viewer.json'), JSON.stringify({ port, token: 'stale' }));
      assert.equal(await viewerLink(folder), null, 'different process cannot impersonate viewer');
    } finally {
      await server.stop();
    }
    assert.equal(await viewerLink(folder), null, 'closed viewer falls back');
    assert.equal((await call(folder, 'world_open')).viewer, 'run serve');
  });
  await run('viewer-discovery-fallback', async () => {
    const folder = home();
    const s = session(folder);
    const live = await startAvailable(s, 4747);
    assert.ok(live, 'one standard port available');
    const stale = await startHttp({ session: s, port: 0 });
    await stale.stop();
    const expected = 'http://127.0.0.1:' + live.address().port + '/';
    try {
      assert.equal(await viewerLink(folder), expected, 'closed recorded port scans');
      writeFileSync(join(folder, 'viewer.json'), '{bad json');
      assert.equal(await viewerLink(folder), expected, 'broken record scans');
      unlinkSync(join(folder, 'viewer.json'));
      assert.equal(await viewerLink(folder), expected, 'missing record scans');
      assert.equal((await call(folder, 'world_open')).viewer, expected);
      assert.equal(await viewerLink(home()), null, 'another data folder is ignored');
    } finally {
      await live.stop();
    }
    assert.equal(await viewerLink(folder), null, 'all closed viewers return no URL');
  });
}
