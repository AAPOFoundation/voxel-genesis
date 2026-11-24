// Run frozen core and transport assertions with isolated local homes.
import { runCoreTests } from './core-cases.mjs';
import { runDoorTests } from './door-cases.mjs';
import { runTownTests } from './town-cases.mjs';
import { runKitTests } from './kit-parts.mjs';
import { runPlayTests } from './kit-play.mjs';
import { runStoryTests } from './kit-story.mjs';
import { runKitViewTests } from './kit-view.mjs';
import { runBundleTests } from './kit-bundles.mjs';
import { runPolishTests } from './polish.mjs';
import { runFeedbackTests } from './feedback-seven.mjs';
import { runKitFeedbackTests } from './kit-feedback.mjs';
import { runGameCheckTests } from './game-check.mjs';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, statSync,
  existsSync, rmSync } from 'node:fs';
import { resolve, join, relative, isAbsolute, sep } from 'node:path';
import { KINDS } from '../src/kit/kinds.mjs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
const E = createRequire(import.meta.url)('../vendor/voxel-engine.js');
const failures = [];
const check = (rule, ok, detail = '') => {
  if (!ok) {
    failures.push({ rule, detail });
  }
};
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const bytes = x => Buffer.byteLength(JSON.stringify(x));
const buildResult = value => {
  if (typeof value !== 'string') {
    return value;
  }
  const match = new RegExp(
    "^rev=(\\d+) hash=([0-9a-f]{8}) count=(\\d+) " +
    "fell=(\\d+) lost=(\\d+) sank=(\\d+) life=(\\d+) " +
    "changed=(\\d+)(?: at=\\S+)?(?: placed=\\d+/\\d+)?(?: note=bridge-ends-open)?$",
    ""
  ).exec(value);
  if (!match) {
    throw new Error('Invalid V3 build result');
  }
  return Object.fromEntries(
    ['rev', 'hash', 'count', 'fell', 'lost', 'sank', 'life', 'changed'].map(
      (key, i) => [key, key === 'hash' ? match[i + 1]: Number(match[i + 1])]
    )
  );
};
const test = async (rule, fn) => {
  try {
    await fn();
  } catch (e) {
    check(rule, false, e.message);
  }
};
mkdirSync('.agent-work/test-homes', { recursive: true });
const home = () => mkdtempSync(resolve('.agent-work/test-homes/run-'));
process.env.VOXEL_GENESIS_HOME = home();
process.env.VOXEL_GENESIS_PORT = '0';
const freeze = process.argv.includes('--freeze');
const filter = process.argv.find(s => s.startsWith('--only='))?.slice(7).split(',');
const run = async (rule, fn) => {
  if (!filter || filter.includes(rule)) {
    await test(rule, fn);
  }
};
let createCore;
let createToolSession;
let TOOLS;
let encode;
let decode;
let hash;
let PREFABS;
let createPlayer;
let startHttp;
let rules;
try {
  ({ createCore } = await import('../src/core/index.mjs'));
  ({ createToolSession, TOOLS } = await import('../src/session.mjs'));
  ({ encode, decode, hash } = await import('../src/core/codec.mjs'));
  ({ PREFABS } = await import('../src/core/prefabs.mjs'));
  ({ rules } = await import('../src/core/rules.mjs'));
} catch (e) {
  check('implementation', false, 'Required core/session is not present: ' + e.code);
}
if (createToolSession) {
  const core = createCore(E);
  const session = (h = home()) => createToolSession({ home: h, viewer: null });
  const newWorld = (size = [12, 12, 16]) => core.newWorld(
    { name: 'test', size, seed: 3 }
  );
  const build = (w, ops) => core.applyBatch(w, ops);
  function floating(w) {
    for (let x = 0; x < w.w; x++) {
      for (let z = 0; z < w.d; z++) {
        for (let y = 1; y < w.h; y++) {
          const t = w.type(x, y, z);
          if (
            t && !t.fixed && !w.solid(x, y - 1, z) && !(t.clings && w.supported(x, y, z))
          ) {
            return [x, y, z];
          }
        }
      }
    }
    return null;
  }
  const fixtures = {};
  for (const name of ['tiny-garden', 'small-town', 'hill-village']) {
    const p = 'fixtures/' + name + '.json';
    if (existsSync(p)) {
      fixtures[name] = JSON.parse(readFileSync(p));
    }
  }
  const play = (fixture, s = session()) => {
    const values = [s.call('world_open', fixture.open)];
    for (const ops of fixture.batches) {
      values.push(s.call('world_build', { ops }));
    }
    return { s, values, last: buildResult(values.at(- 1)) };
  };
  const context = {
    E,
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
    createToolSession,
    TOOLS,
    encode,
    decode,
    hash,
    PREFABS,
    rules
  };
  const recorded = await runCoreTests(context);
  const children = await runDoorTests(context);
  await runTownTests(context);
  await runKitTests(context);
  await runPlayTests(context);
  await runStoryTests(context);
  await runKitViewTests(context);
  await runBundleTests(context);
  await runPolishTests(context);
  await runFeedbackTests(context);
  await runKitFeedbackTests(context);
  await runGameCheckTests(context);
  await run(
    'usage-log',
    () => {
      const h = home();
      const s = session(h);
      s.call('world_open', { name: 'private-name' });
      s.call('world_look', {});
      try {
        s.call('world_undo', {});
      } catch {} const raw = readFileSync(join(h, 'usage.jsonl'), 'utf8');
      const rows = raw.trim().split('\n').map(JSON.parse);
      check(
        'usage-log',
        rows.length === 3 && rows.every(
          r => eq(Object.keys(r), ['t', 'door', 'tool', 'ms', 'in', 'out', 'err'])
        ),
        'exact keys'
      );
      check(
        'usage-log',
        !raw.includes('private-name') && !raw.includes('arguments'),
        'no content'
      );
      const old = statSync(join(h, 'usage.jsonl')).size;
      process.env.VOXEL_GENESIS_NO_LOG = '1';
      s.call('world_look', {});
      delete process.env.VOXEL_GENESIS_NO_LOG;
      check('usage-log', statSync(join(h, 'usage.jsonl')).size === old, 'opt out');
      const r = spawnSync(
        process.execPath,
        ['scripts/usage-summary.mjs'],
        { encoding: 'utf8', env: { ...process.env, VOXEL_GENESIS_HOME: h } }
      );
      check(
        'usage-log',
        r.status === 0 && ['world_open', 'world_look', 'world_undo'].every(
          t => r.stdout.includes(t)
        ),
        'summary'
      );
    }
  );
  await run(
    'rules-seam',
    () => {
      check(
        'rules-seam',
        rules.id === 'none@0' && rules.systems.length === 0 &&
        Object.keys(rules.ops).length === 0,
        'default'
      );
      let ticks = 0;
      const tick = () => ticks++;
      rules.systems.push(tick);
      rules.ops.test = {
        validate: () => {},
        expand: op => [op],
        apply: w => w.set(1, 1, 1, w.byName.brick)
      };
      try {
        const s = session();
        s.call('world_open', {});
        s.call('world_build', { ops: [['test']] });
        check(
          'rules-seam',
          ticks === 1 && s.world.type(1, 1, 1)?.name === 'brick' &&
          readFileSync(s.logPath, 'utf8').includes('["test"]'),
          'extension'
        );
      } finally {
        rules.systems.pop();
        delete rules.ops.test;
      }
    }
  );
  await run(
    'dispatch',
    async () => {
      await import('./dispatch.mjs');
    }
  );
  await run(
    'renderer',
    async () => {
      await import('./gl-renderer.mjs');
    }
  );
  for (const p of children) {
    p.kill();
  }
  for (const name of ['engine-next', 'engine-save', 'engine-undo', 'engine-from',
    'engine-png', 'engine-note', 'engine-size', 'engine-feed', 'engine-input',
    'input-cursor-door', 'engine-move', 'engine-bind', 'engine-cue']) {
    if (name === 'input-cursor-door') await run(name, () => {
      const h = home();
      try {
        const env = { ...process.env, VOXEL_GENESIS_HOME: h };
        const cli = (...args) => spawnSync(process.execPath,
          ['bin/voxel-genesis.mjs', ...args], { encoding: 'utf8', env, timeout: 30000 });
        const opened = cli('call', 'world_open', JSON.stringify(
          { name: 'door', size: [12, 12, 16], seed: 3, fresh: true }));
        check('input-cursor-door', opened.status === 0, 'open ' + opened.status);
        const dir = join(h, 'inputs');
        mkdirSync(dir, { recursive: true });
        const file = join(dir, 'door.jsonl');
        const row = n => JSON.stringify({ n, rev: 0, click: [n, 1, 1], place: null });
        writeFileSync(file, row(1) + '\n');
        const look = cli('call', 'world_look', '{"view":"input"}');
        check('input-cursor-door', look.status === 0, 'look ' + look.status);
        const build = ops => cli('call', 'world_build', JSON.stringify({ ops }));
        const first = build([['box', 'brick', 1, 1, 1, 1, 1, 1]]);
        let reply = '';
        try { reply = JSON.parse(first.stdout); } catch { reply = first.stdout; }
        const text = String(reply);
        check('input-cursor-door', first.status === 0 &&
          !text.split('\n').some(line => line.startsWith('input')),
        'read input still hinted: ' + text.slice(0, 80));
        writeFileSync(file, row(1) + '\n' + row(2) + '\n');
        const second = build([['box', 'brick', 2, 1, 2, 2, 1, 2]]);
        let again = '';
        try { again = JSON.parse(second.stdout); } catch { again = second.stdout; }
        const tail = String(again).trimEnd().split('\n').at(-1);
        check('input-cursor-door', second.status === 0 && tail === 'input 1 new',
          'next input reply ends ' + tail);
      } finally {
        const root = resolve('.agent-work');
        const target = resolve(h);
        const rel = relative(root, target);
        const inside = rel.length > 0 && !isAbsolute(rel) &&
          rel !== '..' && !rel.startsWith('..' + sep);
        if (inside) rmSync(target, { recursive: true, force: true });
      }
    });
    else await run(name, () => {
      const result = spawnSync(process.execPath, ['tests/' + name + '.mjs'], { encoding: 'utf8' });
      const last = (result.stdout || '').trimEnd().split('\n').at(-1);
      check(name, last === name + ': 0 failures', last ?? '');
    });
  }
  await run('kit-multi', () => {
    const s = session();
    s.call('world_open', { name: 'km' });
    const look = of => String(s.call('world_look', { view: 'kit', of }));
    const no = of => { try { look(of); } catch { return 1; } };
    const ks = Object.keys(KINDS);
    const six = ['place', 'store', 'input', 'goal', 'action', 'beat'];
    for (const k of ks) {
      check('kit-multi', look(k).length <= 900 && look(k).startsWith(k + ': '), k);
    }
    for (const [n, j] of [[6, ','], [4, '|']]) {
      const t = look(six.slice(0, n).join(j));
      check('kit-multi', t.length <= 2000, 'size');
      for (const k of six.slice(0, n)) {
        check('kit-multi', t.includes(look(k).split('\n').find(l => l.startsWith('fields '))), k);
        check('kit-multi', ('\n' + t).includes('\n' + k + ': '), k);
      }
    }
    check('kit-multi', no('store,nope') && no(ks.slice(0, 7).join(',')), 'refuse');
    const p = String(s.call('world_look', { view: 'kit' }));
    check('kit-multi', /^of .*,/m.test(p) && p.length <= 1200, 'plain');
  });
  await run('kit-click', async () => {
    const op = (n, o) => ['part', { part: n, ...o }];
    const fresh = (name, ops) => {
      const s = session(); s.call('world_open', { name }); s.call('world_build', { ops });
      const err = c => {
        try { s.call('world_build', { ops: [c] }); return ''; } catch (e) { return e.message; }
      };
      const one = of => String(s.call('world_look', { view: 'kit', ...(of && { of }) }));
      return { s, err, one };
    };
    const w = fresh('kc1', [op('place/pad', { at: [2, 2, 5, 5] }), op('store/coins', {}),
      op('action/go', { on: 'pad' }), op('input/tap', { at: 'pad', then: [['add', 'coins', 1]] })]);
    const msg = w.err(['do', 'tap']), click = /\["in","click",2,0,2\]/.exec(msg);
    check('kit-click', msg.includes('is an input, not an action') && click, msg);
    w.err(JSON.parse(click ? click[0] : '["in","click",9,9,9]'));
    check('kit-click', /play you coins 1\b/.test(w.one('play')), w.one('play'));
    check('kit-click', w.err(['do', 'nope']) === 'ops[0].do: unknown action; try go', 'nope');
    const m = fresh('kc2', [op('place/pad', { at: [1, 1, 3, 3] }), op('store/coins', {}),
      op('place/zone', { at: [4, 5, 7, 8], tags: ['hot'] }), op('input/ahot', { at: 'hot' }),
      op('input/anyin', {}), op('input/lone', { at: 'ghost' }),
      op('input/space', { on: 'key', key: 'space' })]);
    for (const [id, want] of [['ahot', '["in","click",4,0,5]'],
      ['anyin', '["in","click",1,0,1]'], ['space', '["in","key","space"]']]) {
      const e = m.err(['do', id]);
      check('kit-click', e.includes(want) && e.includes('is an input, not an action'), id + e);
      check('kit-click', m.err(JSON.parse(want)) === '', 'op ' + id);
    }
    check('kit-click', m.err(['do', 'lone']).includes('nothing reaches it'), 'ghost');
    const ks = Object.keys(KINDS).filter(k => k !== 'input');
    const top = [...ks].sort((a, b) => w.one(b).length - w.one(a).length).slice(0, 5);
    const i = w.one('input'), six = w.one(['input', ...top].join(',')).length, p = w.one();
    check('kit-click', i.includes('[in,click,x,y,z]') &&
      p.includes('do id [place]; in click x y z|key k') &&
      i.length <= 900 && six <= 2000 && p.length <= 1200, [i.length, six, p.length].join(' '));
    const sha = (await import('node:crypto')).createHash('sha256')
      .update(ks.map(k => w.one(k)).join('\n--\n')).digest('hex');
    check('kit-click', sha === '078a96afece1f1abeb26ea621c62ededc09a919022b4aec5a46b4ecfde5dbd4b',
      'others ' + sha);
  });
  if (freeze) {
    if (!failures.length && Object.keys(recorded).length === 3) {
      writeFileSync('fixtures/expected.json', JSON.stringify(recorded, null, 2) + '\n');
    }
  }
}
for (const f of failures) {
  console.log('FAIL ' + f.rule + ': ' + f.detail);
}
console.log('invariants: ' + failures.length + ' failures');
process.exitCode = failures.length ? 1: 0;
