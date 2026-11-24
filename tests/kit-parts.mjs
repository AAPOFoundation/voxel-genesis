// Exercise parts through the public door, with independent defaults and isolated saves.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, statSync, mkdirSync, copyFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createPlayer } from '../viewer/player.mjs';

const load = name => JSON.parse(readFileSync('fixtures/kit/' + name + '.json', 'utf8'));
const bytes = value => Buffer.byteLength(typeof value === 'string' ? value : JSON.stringify(value));
const defaults = {
  place: { at: null, grid: null, tags: [], groups: {}, props: {}, says: '' },
  scene: { ops: [], says: '' },
  store: { start: 0, min: 0, max: null, per: 'player', says: '', show: true },
  player: { says: '', colour: '', bot: '' },
  board: { places: '', props: { owner: '' }, calc: {}, mark: 'ring', ground: 'grass' },
  action: { on: 'place', when: [], cost: {}, then: [], says: '', value: 1, max: 0 },
  dice: { sides: 6 }, deck: { draw: 'round', cards: [] },
  turn: { order: [], moves: 0, last: 0, end: [], says: 'turn' },
  goal: { when: [], score: null, says: '', win: true, ends: true },
  bot: { moves: 1, rules: [] }, advisor: { top: 5 },
  beat: { chapter: '', after: '', when: [], goal: '', says: '', then: [] },
  voice: { says: '', colour: 'amber' }, talk: { voice: '', on: '', lines: [], asks: [] },
  tune: { bpm: 84, scale: [0, 2, 4, 7, 9], root: 60,
    voices: [{ wave: 'triangle', oct: 0, vol: 5, steps: '' }] },
  mood: { tune: '', when: [], rank: 0 }
};
const sections = { world: 'place', play: 'store', story: 'beat', talk: 'voice', music: 'tune' };

/** Join the existing invariant runner without changing any frozen assertion. */
export async function runKitTests({ run, core, E, session, hash, home }) {
  const fresh = () => {
    const s = session();
    s.call('world_open', { name: 'parts', size: [40, 40, 16] });
    return s;
  };
  const build = (s, ...ops) => s.call('world_build', { ops });
  const add = (s, part) => build(s, ['part', part]);
  const modules = async () => ({
    ...await import('../src/kit/canon.mjs'), ...await import('../src/kit/kinds.mjs'),
    ...await import('../src/kit/expr.mjs'), ...await import('../src/kit-files.mjs')
  });
  await run('kit-fill', async () => {
    const { KINDS, canonPart, evaluate } = await modules();
    assert.equal(Object.keys(KINDS).length, 18);
    for (const [kind, fields] of Object.entries(defaults)) {
      const result = canonPart({ part: kind + '/x' });
      assert.deepEqual(result.part, { part: kind + '/x', ...fields });
      assert.deepEqual(result.warnings, []);
      assert.deepEqual(KINDS[kind].defaults, fields);
      assert.equal(canonPart(KINDS[kind].example).warnings.length, 0);
    }
    const w = core.newWorld();
    assert.equal(evaluate(['/', 7, 2], w), 3);
    assert.equal(evaluate(['and', ['>=', 5, 3], ['not', 0]], w), 1);
    const warnings = [];
    assert.equal(evaluate('missing', w, {}, warnings), 0);
    assert.equal(warnings.length, 1);
    for (const [op, expected] of [['=', 0], ['!=', 1], ['<', 0], ['<=', 0],
      ['>', 1], ['>=', 1], ['and', 1], ['or', 1], ['+', 9], ['-', 5],
      ['*', 14], ['/', 3], ['%', 1], ['min', 2], ['max', 7]]) {
      assert.equal(evaluate([op, 7, 2], w), expected, op);
    }
    const town = core.newWorld({ rules: 'town@1', seed: 7 });
    assert.equal(evaluate('town.coins', town), town.game.coins);
  });
  await run('kit-same', async () => {
    const { canonBundle, contentHash } = await modules();
    const groups = load('same');
    assert.ok(groups.length >= 10);
    for (const group of groups) {
      assert.ok(group.length >= 3 && group.length <= 5);
      const parts = group.map(value => canonBundle(value).bundle.parts);
      for (const part of parts) {
        assert.equal(JSON.stringify(part), JSON.stringify(parts[0]));
        assert.equal(contentHash(part), contentHash(parts[0]));
        assert.deepEqual(canonBundle(part).bundle.parts, part);
      }
    }
  });
  await run('kit-unknown', async () => {
    const { canonPart } = await modules();
    const extra = { a: [3, 'Keep_CASE'], b: { nested: true } };
    for (const part of [{ part: 'store/cash', extra }, { part: 'future/x', extra }]) {
      const s = fresh(), plain = fresh();
      add(s, part);
      if (part.part.startsWith('store/')) add(plain, { part: 'store/cash' });
      assert.equal(canonPart(part).warnings.length, 1);
      assert.deepEqual(s.world.kit.s, plain.world.kit?.s ?? {});
      assert.deepEqual(s.world.kit.parts[part.part].extra, extra);
      build(s, ['edit', part.part, 'extra.a.0', 4]);
      assert.match(s.call('world_look', { view: 'kit', of: part.part }), /Keep_CASE/);
      const reopened = session(s.home);
      reopened.call('world_open');
      assert.equal(hash(reopened.world), hash(s.world));
    }
  });
  await run('kit-reject', async () => {
    await modules();
    const cases = load('negative');
    assert.ok(cases.length >= 25);
    for (const item of cases) {
      const s = fresh();
      const before = [hash(s.world), s.world.rev, statSync(s.logPath).size];
      assert.throws(() => build(s, ...item.ops), error => {
        assert.ok(bytes(error.message) <= 200, item.name);
        assert.match(error.message, /ops\[0\].*:.*;/, item.name);
        assert.match(error.message, new RegExp(item.path), item.name);
        return true;
      }, item.name);
      assert.deepEqual([hash(s.world), s.world.rev, statSync(s.logPath).size], before);
    }
    assert.throws(() => core.applyBatch(core.newWorld(), [['kit', 'tide']]));
  });
  await run('kit-patch', async () => {
    await modules();
    const s = fresh(), full = fresh();
    add(s, { part: 'action/buy', cost: { cash: 30 } });
    const op = ['edit', 'action/buy', 'cost.cash', 20];
    assert.ok(bytes({ ops: [op] }) <= 80);
    build(s, op);
    add(full, { part: 'action/buy', cost: { cash: 20 } });
    assert.equal(hash(s.world), hash(full.world));
    build(s, ['edit', 'action/buy', 'cost', null]);
    assert.deepEqual(s.world.kit.parts['action/buy'].cost, {});
    add(s, { part: 'talk/hello', lines: ['COPY-DRAFT: Hello.'] });
    build(s, ['edit', 'talk/hello', 'lines.+', 'COPY-DRAFT: Welcome.']);
    build(s, ['edit', 'talk/hello', 'lines.0', 'COPY-DRAFT: Good day.']);
    assert.equal(s.world.kit.parts['talk/hello'].lines.length, 2);
    add(s, { part: 'store/cash', start: 10 });
    s.world.kit.s.store.cash.you = 7;
    add(s, { part: 'store/cash', start: 20, max: 5 });
    assert.equal(s.world.kit.s.store.cash.you, 5);
    assert.throws(() => build(s, ['edit', 'action/buy', 'cosh.cash', 1]), /cost/);
    const snapshot = s.state();
    snapshot.kit.parts['talk/hello'].lines.push('changed');
    assert.equal(s.world.kit.parts['talk/hello'].lines.length, 2);
  });
  await run('kit-attach', async () => {
    await modules();
    const names = Object.keys(sections);
    for (const a of names) for (const b of ['', ...names.filter(name => name > a)]) {
      const s = fresh();
      for (let i = 0; i < 30; i++) build(s, ['box', 'brick', i, 1, 0, i, 1, 0]);
      for (const kind of Object.values(sections)) add(s, { part: kind + '/kept' });
      const before = structuredClone(s.world.kit);
      const cells = s.world.cells.slice();
      for (const section of [a, b].filter(Boolean)) {
        add(s, { part: sections[section] + '/swap' });
        add(s, { part: sections[section] + '/swap', says: 'COPY-DRAFT' });
        build(s, ['cut', section]);
      }
      for (const section of names.filter(name => ![a, b].includes(name))) {
        const id = sections[section] + '/kept';
        assert.deepEqual(s.world.kit.parts[id], before.parts[id]);
        assert.deepEqual(s.world.kit.s[id], before.s[id]);
      }
      assert.deepEqual(s.world.cells, cells);
    }
    const s = fresh();
    add(s, { part: 'scene/step', ops: [['box', 'brick', 1, 1, 1, 1, 1, 1]] });
    assert.ok(s.world.get(1, 1, 1));
    build(s, ['cut', 'scene/step']);
    assert.ok(s.world.get(1, 1, 1));
    add(s, { part: 'place/lots', grid: { at: [1, 1], cell: [3, 3], gap: 1,
      cols: 2, rows: 2 }, groups: { shore: [0, 0, 1, 0] }, props: { price: { shore: 5 } } });
    assert.match(s.call('world_look', { view: 'kit', of: 'world' }), /lots-4/);
  });
  await run('kit-solo', async () => {
    await modules();
    for (const [section, kind] of Object.entries(sections)) {
      const s = fresh();
      assert.ok(bytes(add(s, { part: kind + '/solo' })) <= 700);
      assert.ok(bytes(s.call('world_look', { view: 'kit', of: section })) <= 900);
      assert.equal(Object.keys(s.world.kit.parts).length, 1);
    }
  });
  await run('kit-mix', async () => {
    const { createKitFiles, contentHash } = await modules();
    const fixture = load('mix'), project = home();
    mkdirSync(join(project, 'voxel-kit'));
    for (const bundle of fixture.bundles) writeFileSync(
      join(project, 'voxel-kit', bundle.id + '.json'), JSON.stringify(bundle));
    const files = createKitFiles({ cwd: project });
    const s = fresh();
    build(s, ...files.resolve(fixture.ops));
    assert.deepEqual(files.check(s.world), []);
    assert.equal(contentHash(s.world.kit.parts['tune/stroll']),
      contentHash(files.part('b:tune/stroll')));
  });
  await run('kit-replay', async () => {
    await modules();
    const ops = [['part', { part: 'store/cash', start: 5 }],
      ['part', { part: 'voice/pip' }], ['edit', 'store/cash', 'max', 20]];
    const one = fresh(), split = fresh();
    build(one, ...ops);
    for (const op of ops) build(split, op);
    assert.equal(hash(one.world), hash(split.world));
    const reopened = session(one.home);
    reopened.call('world_open');
    assert.equal(hash(one.world), hash(reopened.world));
    const script = join(home(), 'script.json');
    writeFileSync(script, JSON.stringify({ open: { size: [40, 40, 16] }, batches: [ops] }));
    const child = spawnSync(process.execPath, ['bin/voxel-genesis.mjs', 'run', script], {
      encoding: 'utf8', env: { ...process.env, VOXEL_GENESIS_HOME: home() }
    });
    assert.equal(child.status, 0, child.stderr);
    assert.equal(JSON.parse(child.stdout).hash, hash(one.world));
    for (const reduced of [false, true]) {
      const s = fresh(), player = createPlayer(E, { reduced });
      player.load(s.state());
      for (const op of ops) {
        build(s, op);
        player.enqueue({ rev: s.world.rev, line: s.lines.at(-1), hash: hash(s.world) });
        for (let i = 0; i < 4000 && player.busy; i++) player.step(1 / 60);
        assert.equal(player.hash, hash(s.world));
        assert.equal(player.needsState, false);
      }
    }
  });
  await run('kit-undo', async () => {
    await modules();
    const s = fresh();
    const ops = [['kit', [{ part: 'store/cash' }]], ['part', { part: 'voice/pip' }],
      ['edit', 'store/cash', 'start', 4], ['cut', 'talk']];
    for (const op of ops) {
      const before = hash(s.world);
      build(s, op);
      const after = hash(s.world);
      s.call('world_undo');
      assert.equal(hash(s.world), before);
      build(s, op);
      assert.equal(hash(s.world), after);
    }
  });
  await run('kit-frozen', async () => {
    await modules();
    for (const game of [undefined, 'town']) {
      const s = session();
      s.call('world_open', game ? { game } : {});
      const before = hash(s.world);
      assert.equal(s.work.kit, 0);
      add(s, { part: 'voice/pip' });
      build(s, ['cut', '*']);
      assert.equal(hash(s.world), before);
      assert.equal(s.world.kit, undefined);
    }
  });
  await run('kit-custom', async () => {
    const { createKitFiles } = await modules();
    const cwd = resolve('fixtures/kit/project');
    const files = createKitFiles({ cwd });
    assert.equal(files.catalogue().custom, 1);
    const prior = process.env.VOXEL_GENESIS_KIT;
    try {
      process.env.VOXEL_GENESIS_KIT = join(cwd, 'voxel-kit');
      assert.equal(createKitFiles().catalogue().custom, 1);
      const s = session();
      const reply = s.call('world_open', { kit: 'tide' });
      assert.ok(bytes(reply) <= 1600);
      assert.equal(s.world.rev, 1);
      const saved = hash(s.world);
      assert.throws(() => s.call('world_open', { kit: 'tide' }), /fresh/);
      const records = s.lines;
      assert.equal(typeof records[0].ops[0][1], 'object');
      const h = JSON.parse(readFileSync(s.logPath, 'utf8').split('\n')[0]);
      assert.equal(hash(core.replay(h, records).world), saved);
      for (const reduced of [false, true]) {
        const player = createPlayer(E, { reduced });
        player.load(s.state());
        assert.equal(player.hash, saved);
      }
      const project = home();
      mkdirSync(join(project, 'voxel-kit'));
      copyFileSync(join(cwd, 'voxel-kit/tide.json'), join(project, 'voxel-kit/tide.json'));
      const local = createKitFiles({ folder: join(project, 'voxel-kit') });
      const resolved = local.resolve([['kit', 'tide']]);
      const base = core.newWorld();
      const first = core.applyBatch(base, resolved).world;
      writeFileSync(join(project, 'voxel-kit/tide.json'), '{}');
      assert.equal(hash(core.applyBatch(base, resolved).world), hash(first));
      const builtins = join(project, 'builtins');
      mkdirSync(builtins);
      const data = JSON.stringify({ kit: 1, id: 'tide', parts: [{ part: 'voice/pip' }] });
      writeFileSync(join(builtins, 'tide.json'), data);
      writeFileSync(join(project, 'voxel-kit/tide.json'), data);
      assert.ok(createKitFiles({ cwd: project, builtins }).check()
        .some(issue => issue.path.endsWith('.id') && issue.problem.includes('clashes')));
      const rows = readFileSync(join(s.home, 'usage.jsonl'), 'utf8')
        .trim().split('\n').map(JSON.parse);
      assert.equal(rows[0].kit, 'open:custom');
    } finally {
      if (prior === undefined) delete process.env.VOXEL_GENESIS_KIT;
      else process.env.VOXEL_GENESIS_KIT = prior;
    }
  });
  await run('kit-check', async () => {
    const { createKitFiles } = await modules();
    const project = home();
    mkdirSync(join(project, 'voxel-kit'));
    writeFileSync(join(project, 'voxel-kit/bad.json'), JSON.stringify(
      { kit: 1, id: 'bad', parts: [{ part: 'dice/odd', sides: [] }] }));
    const files = createKitFiles({ cwd: project });
    const issues = files.check();
    assert.equal(issues.length, 1);
    assert.ok(['path', 'problem', 'fix'].every(key => issues[0][key]));
    const child = spawnSync(process.execPath, ['bin/voxel-genesis.mjs', 'kit', 'check', project],
      { encoding: 'utf8' });
    assert.deepEqual(JSON.parse(child.stdout), issues);
    const { createToolSession } = await import('../src/session.mjs');
    const checker = createToolSession({ home: home(), cwd: project });
    const report = checker.call('world_look', { view: 'kit', of: 'check' });
    for (const issue of issues) {
      assert.ok([issue.path, issue.problem, issue.fix].every(value => report.includes(value)));
    }
    const s = fresh();
    add(s, { part: 'mood/quiet', tune: 'lost' });
    assert.match(s.call('world_look', { view: 'kit', of: 'check' }), /lost.*part/);
    add(s, { part: 'beat/goal', when: [['>=', 'cash', 1]] });
    assert.match(s.call('world_look', { view: 'kit', of: 'check' }), /reads 0/);
  });
  await run('kit-caps', async () => {
    const { KINDS } = await modules();
    const s = fresh();
    assert.ok(bytes(s.call('world_look', { view: 'kit' })) <= 1200);
    for (const kind of Object.keys(KINDS)) {
      assert.ok(bytes(s.call('world_look', { view: 'kit', of: kind })) <= 900, kind);
      assert.ok(bytes(add(s, { part: kind + '/x' })) <= 700);
      assert.ok(bytes(s.call('world_look', { view: 'kit', of: kind + '/x' })) <= 700);
    }
    assert.ok(bytes(s.call('world_look', { view: 'kit', of: 'check' })) <= 1200);
    const s2 = session();
    assert.ok(bytes(s2.call('world_look', { view: 'kit' })) <= 1200);
    const many = fresh();
    const parts = Array.from({ length: 96 }, (_, i) => ({ part: 'voice/p' + i }));
    build(many, ['kit', parts.slice(0, 48)], ['kit', parts.slice(48)]);
    const before = hash(many.world);
    assert.throws(() => add(many, { part: 'voice/extra' }), /96 parts/);
    assert.equal(hash(many.world), before);
    assert.throws(() => build(fresh(), ['kit', Array.from({ length: 10 }, (_, i) =>
      ({ part: 'future/p' + i, padding: 'a'.repeat(900) }))]), /8192 bytes/);
    const large = fresh();
    for (let i = 0; i < 16; i++) add(large,
      { part: 'future/p' + i, padding: 'a'.repeat(950) });
    assert.throws(() => add(large, { part: 'future/extra', padding: 'a'.repeat(950) }), /16384/);
  });
  await run('kit-usage', async () => {
    await modules();
    const s = fresh();
    add(s, { part: 'store/private-id', says: 'COPY-DRAFT: Private wording.' });
    s.call('world_look', { view: 'kit' });
    const rows = readFileSync(join(s.home, 'usage.jsonl'), 'utf8').trim().split('\n');
    assert.equal(Object.keys(JSON.parse(rows[0])).length, 7);
    assert.equal(Object.keys(JSON.parse(rows[1])).length, 8);
    assert.equal(JSON.parse(rows[1]).kit, 'part:store');
    assert.equal(JSON.parse(rows[2]).kit, 'view:catalogue');
    assert.ok(!rows.join('').includes('private-id'));
    assert.ok(!rows.join('').includes('Private wording'));
  });
}
