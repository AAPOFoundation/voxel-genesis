// Check live growth, queued playback, geometry, texture allocation and camera fitting.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createToolSession } from '../src/session.mjs';
import { createCore } from '../src/core/index.mjs';
import { hash } from '../src/core/codec.mjs';
import { packOf } from '../src/core/rules.mjs';
import { C, townHud } from '../src/copy.mjs';
import { createPlayer, MOTION } from '../viewer/player.mjs';
import { GLRenderer, buildMesh } from '../viewer/gl-renderer.mjs';
import { CachedCanvasRenderer } from '../viewer/canvas-renderer.mjs';
import { fitCamera } from '../viewer/camera.mjs';
const E = createRequire(import.meta.url)('../vendor/voxel-engine.js');
const core = createCore(E);
mkdirSync('.agent-work/viewer-grow', { recursive: true });
const home = () => mkdtempSync(resolve('.agent-work/viewer-grow/run-'));
const dimensions = w => [w.w, w.d, w.h];
function fakeGL() {
  const calls = [], uploads = [];
  let bound;
  return new Proxy({ calls, uploads, getParameter: () => 4,
    getShaderParameter: () => true, getProgramParameter: () => true,
    getAttribLocation: (_, n) => ['position', 'colour', 'face', 'owner'].indexOf(n),
    getUniformLocation: (_, n) => n, isContextLost: () => false,
    bindBuffer: (_, buffer) => { bound = buffer; },
    bufferData: (_, data) => uploads.push({ buffer: bound, data: data.slice() })
  }, { get: (o, k) => k in o ? o[k] : /^[A-Z_0-9]+$/.test(k) ? k :
    k.startsWith('create') ? () => ({}) : (...args) => calls.push([k, ...args]) });
}
function surface(gl) {
  const ctx = new Proxy({}, { get: () => () => {} });
  return { width: 640, height: 400, clientWidth: 640,
    getContext: type => type === 'webgl' ? gl : ctx,
    ownerDocument: { createElement: () => surface() } };
}
function inspectGL(renderer, gl) {
  const world = renderer.world;
  const mesh = gl.uploads.filter(u => u.buffer === renderer.staticBuffer).at(-1).data;
  assert.deepEqual(mesh, buildMesh(world), 'static geometry uses current dimensions');
  assert.equal(renderer.maskHeight, Math.ceil(world.cells.length / 256));
  assert.equal(renderer.maskBytes.length, 256 * renderer.maskHeight);
  const texture = gl.calls.filter(c => c[0] === 'texImage2D').at(-1);
  assert.equal(texture[4], 256);
  assert.equal(texture[5], renderer.maskHeight, 'GPU texture follows cell capacity');
}
// A size change invalidates caches even with the same world identity and revision.
const world = core.newWorld({ size: [8, 8, 8] });
const gl = fakeGL(), canvas = surface(gl);
const renderer = GLRenderer.create(canvas, world);
const canvasWorld = core.newWorld({ size: [8, 8, 8] });
const cached = new CachedCanvasRenderer(E, surface(), canvasWorld);
for (const size of [[8, 8, 8], [12, 8, 8], [12, 10, 8], [12, 10, 12]]) {
  if (dimensions(world).join() !== size.join()) {
    const grown = core.grow(world, size);
    Object.assign(world, { w: grown.w, d: grown.d, h: grown.h, cells: grown.cells });
  }
  world.dirty = false;
  Object.assign(canvasWorld, { w: world.w, d: world.d, h: world.h,
    cells: world.cells, dirty: false });
  const uploads = gl.uploads.filter(u => u.buffer === renderer.staticBuffer).length;
  const rebuilds = cached.rebuilds;
  fitCamera(renderer, 640, 400);
  renderer.render();
  cached.render();
  assert.equal(gl.uploads.filter(u => u.buffer === renderer.staticBuffer).length, uploads + 1);
  assert.equal(cached.rebuilds, rebuilds + 1, 'canvas cache follows each dimension');
  inspectGL(renderer, gl);
  renderer.render();
  cached.render();
  assert.equal(cached.rebuilds, rebuilds + 1, 'unchanged dimensions reuse canvas cache');
}
cached.dispose();
renderer.dispose();
// Run the real browser controller with local DOM and GL doubles.
const source = readFileSync('viewer/viewer.mjs', 'utf8').replace(/^import .*;\r?\n/gm, '');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
for (const reduced of [false, true]) {
  for (const canvasOnly of [false, true]) {
    const session = createToolSession({ home: home() });
    session.call('world_open', { name: 'viewer-grow', size: [8, 8, 8] });
    const context = fakeGL(), nodes = new Map(), events = [];
    let eventSource, frame, fetches = 0;
    const makeCanvas = () => ({ ...surface(context), style: {},
      cloneNode: () => makeCanvas(), replaceWith: fresh => { currentCanvas = fresh; },
      addEventListener() {}, setPointerCapture() {},
      getBoundingClientRect: () => ({ width: 640, height: 400 }) });
    let currentCanvas = makeCanvas();
    const document = { hidden: false, addEventListener() {},
      createElement: () => ({}), querySelector(key) {
        if (key === '#world') return currentCanvas;
        if (!nodes.has(key)) nodes.set(key, { setAttribute() {}, replaceChildren() {} });
        return nodes.get(key);
      } };
    const args = { createPlayer, MOTION, C, townHud, packOf, GLRenderer,
      CachedCanvasRenderer, fitCamera, document, window: { AapoVoxel: E },
      matchMedia: () => ({ matches: reduced, addEventListener() {} }),
      location: { search: canvasOnly ? '?renderer=canvas' : '' },
      fetch: async path => {
        assert.equal(path, '/api/state');
        fetches++;
        return { ok: true, json: async () => session.state() };
      }, EventSource: class { constructor() { eventSource = this; } close() {} },
      requestAnimationFrame: fn => { frame = fn; }, devicePixelRatio: 1 };
    const controller = await new AsyncFunction(...Object.keys(args), source +
      '\nreturn { player, renderer: () => renderer, load };')(...Object.values(args));
    session.subscribe(event => {
      events.push(event);
      eventSource.onmessage({ data: JSON.stringify(event) });
    });
    let now = 0;
    const paint = () => frame(now += 16);
    const drain = () => {
      for (let i = 0; i < 2000 && controller.player.busy; i++) paint();
      paint();
      assert.equal(controller.player.busy, false);
      assert.equal(controller.player.needsState, false);
      assert.equal(controller.player.hash, hash(session.world));
    };
    const verify = size => {
      const r = controller.renderer();
      assert.deepEqual(dimensions(r.world), size);
      const fitted = { world: r.world, yaw: r.yaw, pitch: r.pitch };
      fitCamera(fitted, 640, 400);
      assert.deepEqual(r.focus, fitted.focus, 'live camera refits the grown world');
      assert.equal(r.span, fitted.span);
      if (!canvasOnly) inspectGL(r, context);
    };
    paint();
    const initialSpan = controller.renderer().span;
    // Queue a grow behind an animated build, then build in the new space.
    session.call('world_build', { ops: [['drop', 'brick', 2, 5, 2]] });
    session.call('world_open', { name: 'viewer-grow', size: [16, 12, 10], grow: true });
    assert.equal(events.filter(e => e.line?.grow).length, 1, 'one published growth revision');
    session.call('world_build', { ops: [['box', 'rock', 15, 1, 11, 15, 9, 11]] });
    drain();
    verify([16, 12, 10]);
    assert.ok(controller.renderer().span > initialSpan);
    assert.equal(fetches, 1, 'grow playback needs no snapshot resynchronisation');
    if (!canvasOnly) {
      const r = controller.renderer(), w = r.world;
      w.set(15, 9, 11, w.byName.brick);
      r.render();
      const index = (9 * w.d + 11) * w.w + 15;
      assert.equal(r.maskBytes[index], 255, 'new space fits the enlarged mask');
      assert.ok(r.patchCount > 0);
    }
    // Undo loads a smaller snapshot; growth can follow again in the same viewer.
    session.call('world_undo', { steps: 2 });
    await controller.load();
    drain();
    verify([8, 8, 8]);
    session.call('world_open', { name: 'viewer-grow', size: [8, 8, 12], grow: true });
    drain();
    verify([8, 8, 12]);
    controller.renderer().dispose();
  }
}
// A mover that last walked along z keeps its facing through immediate and queued growth.
for (const queued of [false, true]) {
  const session = createToolSession({ home: home() }), player = createPlayer(E);
  session.call('world_open', { name: 'mover-grow', size: [16, 16, 16] });
  session.call('world_build', { ops: [['mover', 'dog', 'brick', 2, 2]] });
  player.load(session.state());
  session.subscribe(event => player.enqueue(event));
  const drain = () => {
    for (let i = 0; i < 2000 && player.busy; i++) player.step(.05);
    assert.equal(player.busy, false);
    assert.equal(player.needsState, false);
    assert.equal(player.hash, hash(session.world));
  };
  const body = () => player.world.agents.find(a => a.moverId === 'dog').boxes(player.world)[0];
  session.call('world_build', { ops: [['move', 'dog', 2, 5]] });
  drain();
  assert.equal(player.world.moverAxis.dog, 0);
  const before = body();
  assert.ok(before.d > before.w, 'the settled mover faces along z');
  if (queued) session.call('world_build', { ops: [['move', 'dog', 2, 6]] });
  session.call('world_open', { name: 'mover-grow', size: [32, 32, 16], grow: true });
  drain();
  assert.deepEqual(dimensions(player.world), [32, 32, 16]);
  assert.equal(player.world.moverAxis?.dog, 0, 'grow preserves the last walked axis');
  assert.deepEqual([body().w, body().d], [before.w, before.d], 'grow preserves mover facing');
}
console.log('viewer-grow: 0 failures (playback, geometry, GL mask, canvas and camera)');
