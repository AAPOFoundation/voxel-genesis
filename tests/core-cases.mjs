// Check canonical physics, replay, atomicity and fixture expectations.
import { readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
/** Run the frozen core assertions with the shared suite harness. */
export async function runCoreTests(context) {
  const {
    run,
    check,
    eq,
    bytes,
    buildResult,
    core,
    session,
    newWorld,
    build,
    floating,
    fixtures,
    play,
    home,
    freeze,
    TOOLS,
    encode,
    decode,
    hash,
    PREFABS
  } = context;
  await run(
    'physics-facts',
    () => {
      let a = build(newWorld(), [['drop', 'brick', 2, 2, 3]]);
      check(
        'physics-facts',
        [1, 2, 3].every(y => a.world.type(2, y, 2)?.name === 'brick'),
        'three drops'
      );
      const count = a.result.count;
      a = build(a.world, [['clear', 2, 1, 2, 2, 1, 2]]);
      check(
        'physics-facts',
        a.result.fell >= 1 && a.result.count === count - 1 &&
        a.world.top(2, 2) === 2,
        'support removal'
      );
      a = build(newWorld(), [['paint', 'water', 2, 2, 2, 2], ['drop', 'brick', 2, 2, 1]]);
      check(
        'physics-facts',
        a.result.sank === 1 && a.result.count === 144,
        'water at base'
      );
      a = build(
        newWorld(),
        [['box', 'trunk', 2, 1, 2, 2, 2, 2], ['box', 'leaf', 3, 2, 2, 3, 2, 2]]
      );
      check('physics-facts', a.world.type(3, 2, 2)?.name === 'leaf', 'leaf beside trunk');
      a = build(a.world, [['clear', 2, 2, 2, 2, 2, 2]]);
      check(
        'physics-facts',
        a.result.lost >= 1 && !a.world.get(3, 2, 2),
        'leaf without trunk'
      );
      a = build(newWorld(), [['box', 'brick', 1, 6, 1, 2, 6, 2]]);
      check(
        'physics-facts',
        a.world.top(1, 1) === 1 && a.result.fell === 4 && !floating(a.world),
        'loose box'
      );
      a = build(newWorld(), [['box', 'deck', 1, 5, 1, 5, 5, 1]]);
      check(
        'physics-facts',
        a.world.top(3, 1) === 5 && a.result.fell === 0,
        'fixed span'
      );
    }
  );
  await run(
    'prefabs',
    () => {
      for (const [name, p] of Object.entries(PREFABS)) {
        for (let turns = 0; turns < 4; turns++) {
          const w = turns % 2 ? p.size[1]: p.size[0];
          const d = turns % 2 ? p.size[0]: p.size[1];
          let a = build(newWorld([24, 24, 32]), [['stamp', name, 2, 2, turns]]);
          check(
            'prefabs',
            a.result.fell === 0 && a.result.lost === 0 && !floating(a.world),
            name + ' flat ' + turns
          );
          for (let x = 0; x < 24; x++) {
            for (let z = 0; z < 24; z++) {
              if (x < 2 || x >= 2 + w || z < 2 || z >= 2 + d) {
                check('prefabs', a.world.top(x, z) === 0, name + ' footprint');
              }
            }
          }
          a = build(
            newWorld([24, 24, 32]),
            [['box', 'earth', 2, 1, 2, 2, 2, 2], ['stamp', name, 2, 2, turns]]
          );
          check(
            'prefabs',
            a.result.fell === 0 && a.world.type(w > 1 ? 3: 2, 1, w > 1 ? 2: 3)?.name === 'rock',
            name + ' slope footing'
          );
        }
      }
    }
  );
  await run(
    'rejects',
    () => {
      const s = session();
      s.call('world_open', { name: 'negative', size: [12, 12, 12], seed: 3 });
      for (const c of JSON.parse(readFileSync('fixtures/negative.json'))) {
        const before = s.state();
        const size = statSync(s.logPath).size;
        let error = '';
        try {
          s.call(c.tool, c.arguments);
        } catch (e) {
          error = e.message;
        }
        check(
          'rejects',
          error.includes(c.error) && Buffer.byteLength(error) <= 200,
          JSON.stringify(c.arguments).slice(0, 100) + ' -> ' +
          error
        );
        check(
          'rejects',
          eq(before, s.state()) && statSync(s.logPath).size === size,
          'mutation on rejection'
        );
      }
    }
  );
  await run(
    'atomic',
    () => {
      const s = session();
      s.call('world_open', { size: [12, 12, 12] });
      const before = s.state();
      const size = statSync(s.logPath).size;
      const ops = Array.from({ length: 49 }, () => ['box', 'brick', 1, 1, 1, 1, 1, 1]);
      ops.push(['box', 'brick', 99, 1, 1, 99, 1, 1]);
      let rejected = false;
      try {
        s.call('world_build', { ops });
      } catch {
        rejected = true;
      }
      check(
        'atomic',
        rejected && eq(s.state(), before) && statSync(s.logPath).size === size,
        '50th op'
      );
    }
  );
  const recorded = {};
  await run(
    'determinism',
    () => {
      check(
        'determinism',
        Object.keys(fixtures).length === 3,
        'three build fixtures required'
      );
      const expected = existsSync('fixtures/expected.json') ?
      JSON.parse(readFileSync('fixtures/expected.json')): {};
      for (const [name, f] of Object.entries(fixtures)) {
        const a = play(f);
        const b = play(f);
        const { hash, count, rev } = a.last;
        recorded[name] = { hash, count, rev };
        check('determinism', eq(a.values, b.values), name + ' repeated');
        if (!freeze) {
          check(
            'determinism',
            eq(recorded[name], expected[name]),
            name + ' frozen result'
          );
        }
      }
    }
  );
  await run(
    'batch-split',
    () => {
      const f = fixtures['small-town'];
      if (!f) {
        throw new Error('small-town fixture required');
      }
      const ops = f.batches.flat();
      const hashes = [f.batches, [ops], ops.map(o => [o])].map(
        batches => play({ ...f, batches }).last.hash
      );
      check('batch-split', new Set(hashes).size === 1, hashes.join(' '));
    }
  );
  await run(
    'settled',
    () => {
      for (const [name, f] of Object.entries(fixtures)) {
        let w = core.newWorld(f.open);
        for (const ops of f.batches) {
          w = build(w, ops).world;
          check(
            'settled',
            !w.dirty && !w.bodies.some(b => b.settle) && floating(w) === null,
            name
          );
        }
      }
    }
  );
  await run(
    'round-trip',
    () => {
      const h = home();
      const s = session(h);
      s.call('world_open', { name: 'round' });
      const before = s.state();
      const ops = [['drop', 'brick', 2, 2, 3]];
      const later = buildResult(s.call('world_build', { ops }));
      const result = spawnSync(
        process.execPath,
        ['bin/voxel-genesis.mjs', 'call', 'world_open', '{}'],
        { encoding: 'utf8', env: { ...process.env, VOXEL_GENESIS_HOME: h } }
      );
      check(
        'round-trip',
        result.status === 0 && JSON.parse(result.stdout).hash === later.hash,
        'new process reopen'
      );
      check(
        'round-trip',
        eq(Array.from(decode(encode(s.world.cells))), Array.from(s.world.cells)),
        'RLE cells'
      );
      const undone = buildResult(s.call('world_undo', {}));
      const redone = buildResult(s.call('world_build', { ops }));
      check(
        'round-trip',
        undone.hash === before.hash && undone.rev > later.rev &&
        redone.hash === later.hash && redone.rev > undone.rev,
        'undo monotonic'
      );
      s.call('world_open', { fresh: true });
      check('round-trip', existsSync(join(h, 'worlds/round.bak.jsonl')), 'backup');
    }
  );
  await run(
    'size-caps',
    () => {
      check(
        'size-caps',
        bytes({ jsonrpc: '2.0', id: 2, result: { tools: TOOLS } }) <= 2500,
        'tools/list ' + bytes({ jsonrpc: '2.0', id: 2, result: { tools: TOOLS } })
      );
      for (const f of Object.values(fixtures)) {
        const { s, values } = play(f);
        check('size-caps', bytes(values[0]) <= 1200, 'open');
        for (const v of values.slice(1)) {
          check('size-caps', bytes(v) <= 400, 'build');
        }
        for (const view of ['top', 'height', 'side', 'info']) {
          check('size-caps', bytes(s.call('world_look', { view })) <= 3000, view);
        }
        check('size-caps', bytes(s.call('world_undo', {})) <= 200, 'undo');
      }
    }
  );
  return recorded;
}
