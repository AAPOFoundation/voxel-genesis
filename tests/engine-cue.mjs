// Frozen checks: the page shows which places can be tapped.
// Run alone: node tests/engine-cue.mjs.
// Judgements, each the least specific reading that still proves the behaviour:
// - Target: viewer/tap.mjs, served at /tap.mjs, exports tappable(world, hit) and
//   tapMarks(world, { reduced, time }). hit is a pick result { x, y, z } or null; y is ignored,
//   as the server matches by x and z. tappable gives true or false and agrees with bindingFor
//   (src/kit/inputs.mjs) on every column of four viewer worlds: bound by id and by tag, empty
//   `at`, key input only, no kit.
// - A mark has numeric x and z centres, like renderer extras. A mark or vertex is over a place
//   within its cells plus half a cell. time is seconds. Under reduced the marks are not empty
//   and the same at any time. Animation without reduced is not asserted.
// - Both renderers draw marks: a first render of the bound world records other calls than the
//   same places with only a key input; differing GL vertices lie over bound places.
//   CachedCanvasRenderer takes a fourth argument { reduced }, like GLRenderer.create. Under
//   reduced, two renders 300 ms apart record the same calls.
// - Cursor, by source: the `canvas` CSS block drops `cursor: pointer`; viewer.mjs imports
//   tappable from ./tap.mjs and sets style.cursor.
// - Served: every module reached by relative import from /viewer.mjs answers 200, /tap.mjs too.
// - Unhashed, pinned on 9a26feb: the bound world hash and src/core/ops.mjs (LF). The GET /tools
//   body was re-pinned on 2026-11-18 to include kit ops in the tool text. Fixture
//   hashes stay with bind-replay and kit-frozen-five. Viewer work leaves the viewer world hash
//   equal to the server's.
import { readFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const failures = [], notes = [];
const check = (rule, ok, detail = '') =>
  ok || !failures.push({ rule, detail: String(detail).replaceAll('\n', ' / ') });
const info = (topic, text) => notes.push(topic + ': ' + text);
const test = (rule, fn) => Promise.resolve().then(fn).catch(error =>
  check(rule, false, String(error.message).split('\n')[0].slice(0, 160)));
const only = process.argv.find(arg => arg.startsWith('--only='))?.slice(7).split(',');
const run = (rule, fn) => !only || only.includes(rule) ? test(rule, fn) : null;
const WORK = resolve('.agent-work/engine-cue'), home = () => mkdtempSync(join(WORK, 'run-'));
mkdirSync(WORK, { recursive: true });
Object.assign(process.env, { VOXEL_GENESIS_HOME: home(), VOXEL_GENESIS_PORT: '0' });
process.env.VOXEL_GENESIS_NO_LOG = '1';
delete process.env.VOXEL_GENESIS_KIT;
process.on('unhandledRejection', error => info('unhandled', String(error?.message ?? error)));
const [{ createToolSession }, { hash }, { startHttp }, { bindingFor }, { createPlayer },
  { GLRenderer }, { CachedCanvasRenderer }] = await Promise.all(['src/session', 'src/core/codec',
  'src/http', 'src/kit/inputs', 'viewer/player', 'viewer/gl-renderer', 'viewer/canvas-renderer']
  .map(path => import('../' + path + '.mjs')));
const E = createRequire(import.meta.url)('../vendor/voxel-engine.js');
let tap = {};
try { tap = await import('../viewer/tap.mjs'); } catch (error) {
  info('tap', String(error.message).split('\n')[0].slice(0, 120));
}
const { tappable, tapMarks } = tap;
const str = value => JSON.stringify(value);
const sha = text => createHash('sha256').update(text).digest('hex');
const pause = ms => new Promise(done => setTimeout(done, ms));
const served = async body => {
  const server = await startHttp({ port: 0, session: createToolSession({ home: home() }) });
  try { return await body('http://127.0.0.1:' + server.address().port); } finally {
    server.closeAllConnections?.(); await server.stop();
  }
};

// Worlds: lot is bound by id, farm by its tag, yard is unbound, space is a key binding.
const part = (id, more = {}) => ['part', { part: id, ...more }];
const PLACES = [part('place/lot', { at: [2, 2, 5, 5] }), part('place/yard', { at: [8, 8, 11, 11] }),
  part('place/farm', { at: [2, 9, 4, 12], tags: ['crop'] })];
const KEY = part('input/jump', { on: 'key', key: 'space', then: [] });
const BOUND = [part('input/tap', { at: 'lot', then: [] }),
  part('input/grow', { at: 'crop', then: [] })];
function made(name, ...ops) {
  const s = createToolSession({ home: home() }), p = createPlayer(E);
  s.call('world_open', { name, size: [16, 16, 12], seed: 3, fresh: true });
  if (ops.length) s.call('world_build', { ops });
  p.load(s.state());
  return { s, p, w: p.world };
}
const worlds = () => ({ bound: made('bound', ...PLACES, ...BOUND, KEY),
  keyed: made('keyed', ...PLACES, KEY), bare: made('bare'),
  open: made('open', ...PLACES, part('input/any', { then: [] })) });
const over = (world, ids, x, z) => ids.some(id => {
  const [x1, z1, x2, z2] = world.kit.s.place[id].at;
  return x >= x1 - .5 && x <= x2 + 1.5 && z >= z1 - .5 && z <= z2 + 1.5;
});

// Renderer doubles record every call, numbers rounded, objects as 'o'.
const flat = a => Array.isArray(a) || ArrayBuffer.isView(a) ? Array.from(a, flat) :
  typeof a === 'number' ? Math.round(a * 1000) / 1000 : a && typeof a === 'object' ? 'o' : a;
const record = (log, base = {}) => new Proxy(base, {
  get: (o, k) => k in o ? o[k] : /^[A-Z_0-9]+$/.test(k) ? k : String(k).startsWith('create') ?
    () => ({}) : (...args) => log.push([k, ...args.map(flat)]),
  set: (o, k, v) => (log.push([k, flat(v)]), true) });
function glOf(world, reduced) {
  const log = [], gl = record(log, { getParameter: () => 4, getShaderParameter: () => true,
    getProgramParameter: () => true, isContextLost: () => false, getUniformLocation: (_, n) => n,
    getAttribLocation: (_, n) => ['position', 'colour', 'face', 'owner'].indexOf(n) });
  return { log, r: GLRenderer.create({ width: 640, height: 400, getContext: () => gl }, world,
    { reduced }) };
}
function canvasOf(world, reduced) {
  const log = [], context = record(log), canvas = { width: 640, height: 400,
    getContext: () => context, ownerDocument: { createElement: () => ({ getContext: () =>
      context }) } };
  return { log, r: new CachedCanvasRenderer(E, canvas, world, { reduced }) };
}
const vertices = log => log.filter(c => c[0] === 'bufferData').flatMap(c =>
  Array.from({ length: Math.floor(c[2].length / 8) }, (_, i) => c[2].slice(i * 8, i * 8 + 8)));
function extra(a, b) {
  const left = new Map();
  for (const v of b) left.set(str(v), (left.get(str(v)) ?? 0) + 1);
  return a.filter(v => !(left.get(str(v)) > 0 && left.set(str(v), left.get(str(v)) - 1)));
}

// cue-tappable: a viewer-side pure function tells a tappable cell by the server's match rule.
await run('cue-tappable', () => {
  if (!check('cue-tappable', typeof tappable === 'function', 'no tappable export')) return;
  const { bound, keyed, bare, open } = worlds();
  for (const [{ w, s }, x, y, z, want] of [[bound, 3, 0, 3, true], [bound, 3, 4, 3, true],
    [bound, 3, 0, 10, true], [bound, 9, 0, 9, false], [bound, 0, 0, 0, false],
    [bound, 14, 0, 14, false], [keyed, 3, 0, 3, false], [bare, 3, 0, 3, false],
    [open, 9, 0, 9, true], [open, 14, 0, 1, false]]) {
    const got = tappable(w, { x, y, z });
    check('cue-tappable', got === want, s.world.name + ' ' + [x, y, z] + ' gave ' + got);
  }
  check('cue-tappable', tappable(bound.w, null) === false, 'a null hit is not false');
  for (const [name, { s, w }] of Object.entries({ bound, keyed, bare, open })) {
    const off = [];
    for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) {
      const want = Boolean(bindingFor(s.world, { click: [x, 0, z] }));
      if (tappable(w, { x, y: 0, z }) !== want) off.push(x + ',' + z);
    }
    check('cue-tappable', !off.length, name + ' differs from the server at ' + off.slice(0, 6));
  }
});

// cue-mark: both renderers mark tappable places and no other; reduced motion is still.
await run('cue-mark', async () => {
  const { bound, keyed, bare } = worlds(), ids = ['lot', 'farm'];
  for (const reduced of [false, true]) {
    const [a, b, c, d] = [glOf(bound.w, reduced), glOf(keyed.w, reduced),
      canvasOf(bound.w, reduced), canvasOf(keyed.w, reduced)];
    [a, b, c, d].forEach(({ r }) => r.render());
    for (const [kind, one, two] of [['GL', a, b], ['canvas', c, d]]) {
      check('cue-mark', str(one.log) !== str(two.log), kind + ' reduced ' + reduced +
        ': bound places draw as if unbound');
    }
    const stray = extra(vertices(a.log), vertices(b.log))
      .filter(v => !over(bound.w, ids, v[0], v[2]));
    check('cue-mark', !stray.length, 'GL: ' + stray.length + ' vertices off bound places');
    [a, b, c, d].forEach(({ r }) => r.dispose());
  }
  for (const [kind, make] of [['GL', glOf], ['canvas', canvasOf]]) {
    const { r, log } = make(bound.w, true), frame = async () => {
      log.length = 0; await pause(300); r.render(); return str(log);
    };
    r.render();
    check('cue-mark', await frame() === await frame(), kind + ': a reduced frame changed');
    r.dispose();
  }
  if (!check('cue-mark', typeof tapMarks === 'function', 'no tapMarks export')) return;
  for (const reduced of [false, true]) {
    const marks = tapMarks(bound.w, { reduced, time: 0 }) ?? [];
    check('cue-mark', marks.length && marks.every(m => Number.isFinite(m?.x) &&
      Number.isFinite(m?.z) && over(bound.w, ids, m.x, m.z)) && ids.every(id =>
      marks.some(m => over(bound.w, [id], m.x, m.z))), 'reduced ' + reduced + ' marks ' +
      str(marks).slice(0, 120));
  }
  for (const [name, { w }] of Object.entries({ keyed, bare })) {
    const marks = tapMarks(w, { reduced: false, time: 0 });
    check('cue-mark', Array.isArray(marks) && !marks.length, name + ' got ' + str(marks));
  }
  const still = [0, 1.3, 4.7].map(time => str(tapMarks(bound.w, { reduced: true, time })));
  check('cue-mark', still.every(m => m === still[0]), 'reduced marks move with time');
});

// cue-cursor: the canvas cursor is a pointer only over a tappable cell, default elsewhere.
await run('cue-cursor', () => {
  const css = readFileSync('viewer/index.html', 'utf8').match(/(^|\n)canvas\s*\{([^}]*)\}/)?.[2];
  check('cue-cursor', css !== undefined && !/cursor\s*:\s*pointer/.test(css),
    'the canvas CSS block sets cursor: pointer everywhere');
  const viewer = readFileSync('viewer/viewer.mjs', 'utf8');
  check('cue-cursor', /import\s*\{[^}]*\btappable\b[^}]*\}\s*from\s*['"]\.\/tap\.mjs['"]/
    .test(viewer), 'viewer.mjs does not import tappable from ./tap.mjs');
  check('cue-cursor', /style\.cursor\s*=|setProperty\(\s*['"]cursor['"]/.test(viewer),
    'viewer.mjs never sets the cursor');
});

// cue-served: the new module is served, and every module the viewer imports answers 200.
await run('cue-served', async () => {
  const seen = new Map();
  await served(async base => {
    for (const todo = ['/viewer.mjs']; todo.length && seen.size < 80;) {
      const path = todo.shift();
      if (seen.has(path)) continue;
      const res = await fetch(base + path), body = await res.text();
      seen.set(path, res.status);
      for (const [, spec] of body.matchAll(/(?:from|import)\s*\(?\s*['"](\.\.?\/[^'"]+)['"]/g)) {
        todo.push(new URL(spec, base + path).pathname);
      }
    }
  });
  const bad = [...seen].filter(([, status]) => status !== 200);
  check('cue-served', !bad.length, 'not served: ' + str(bad));
  check('cue-served', seen.get('/tap.mjs') === 200, '/viewer.mjs never reaches /tap.mjs');
});

// cue-unhashed: the cue is viewer-side; hashes, tool bytes and core ops do not move.
await run('cue-unhashed', async () => {
  const { s, p, w } = worlds().bound;
  check('cue-unhashed', hash(s.world) === 'ab0cf615' && s.world.rev === 1, 'bound world ' +
    hash(s.world) + ' rev ' + s.world.rev + ', pinned ab0cf615 rev 1');
  const tools = await served(async base => (await fetch(base + '/tools')).text());
  check('cue-unhashed', sha(tools).startsWith('969da21953de66b5db2692bfe61500f6d8'),
    'GET /tools body moved (' + tools.length + ' bytes, pinned 2328)');
  const ops = readFileSync('src/core/ops.mjs', 'utf8').replaceAll('\r\n', '\n');
  check('cue-unhashed', sha(ops).startsWith('a01d801f179c6dc5810e4ab84327c282f3'),
    'src/core/ops.mjs changed');
  for (const make of [glOf, canvasOf]) {
    const { r } = make(w, false);
    r.render(); r.render(); r.dispose();
  }
  for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) tappable?.(w, { x, y: 0, z });
  tapMarks?.(w, { reduced: false, time: 2 });
  check('cue-unhashed', hash(w) === hash(s.world) && p.hash === hash(s.world),
    'viewer work moved the viewer hash to ' + hash(w));
  check('cue-unhashed', typeof tappable === 'function' && typeof tapMarks === 'function',
    'viewer/tap.mjs is missing, so the viewer side is unproven');
});

for (const note of notes) console.log('info ' + note);
for (const failure of failures) console.log('FAIL ' + failure.rule + ': ' + failure.detail);
console.log('engine-cue: ' + failures.length + ' failures');
process.exitCode = failures.length ? 1 : 0;
