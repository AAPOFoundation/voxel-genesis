// Verify geometry, GL command lifetimes, playback and viewer control wiring.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { request } from 'node:http';
import { buildMesh, buildDynamicMesh, GLRenderer } from '../viewer/gl-renderer.mjs';
import { createCore } from '../src/core/index.mjs';
import { createPlayer, MOTION } from '../viewer/player.mjs';
import { fitCamera } from '../viewer/camera.mjs';
import { C, townHud } from '../src/copy.mjs';
import { packOf } from '../src/core/rules.mjs';
import { encode, hash } from '../src/core/codec.mjs';
import { createToolSession } from '../src/session.mjs';
import { startHttp } from '../src/http.mjs';
const E = createRequire(import.meta.url)('../vendor/voxel-engine.js');
const core = createCore(E);
const w = new E.World({ w: 8, d: 8, h: 8 });
w.rev = 0;
w.defineBlock('rock', { color: '#d2bd97', fixed: true });
w.set(2, 0, 2, 1);
assert.equal(buildMesh(w).length / 8, 30, 'five exposed faces on one cell');
w.set(3, 0, 2, 1);
assert.equal(buildMesh(w).length / 8, 48, 'adjacent interior faces culled');
w.set(3, 1, 2, 1);
assert.equal(buildMesh(w).length / 8, 72, 'covered top culled');
const before = Array.from(w.cells);
const mesh = buildMesh(w);
assert.ok(mesh.every(Number.isFinite));
assert.deepEqual(Array.from(w.cells), before, 'mesh is pure');
assert.deepEqual(mesh, buildMesh(w), 'geometry is deterministic');
assert.equal(buildDynamicMesh(w).length, 0);
w.bodies.push({ x: 2, y: 3, z: 2, type: 1, size: 1, life: 0 });
assert.equal(buildDynamicMesh(w).length / 8, 30);
assert.equal(buildDynamicMesh(w, { reduced: true }).length, 0);
w.bodies = [];
// Command-recording GL double checks buffer lifetimes, not GPU output or shader compilation.
function fakeGL({ compile = true, link = true, vertexTextures = 4 } = {}) {
  const calls = [];
  const uploads = [];
  let serial = 0;
  let bound = null;
  const impl = {
    calls,
    uploads,
    getParameter: () => vertexTextures,
    getShaderParameter: () => compile,
    getProgramParameter: () => link,
    getAttribLocation: (_, n) => ['position', 'colour', 'face', 'owner'].indexOf(n),
    getUniformLocation: (_, n) => n,
    isContextLost: () => false,
    bindBuffer: (target, buffer) => {
      bound = buffer;
    },
    bufferData: (target, data, usage) => uploads.push(
      { buffer: bound, data: data.slice(), usage }
    )
  };
  return new Proxy(
    impl,
    {
      get: (o, k) => k in o ? o[k]: /^[A-Z_0-9]+$/.test(k) ? k:
      k.startsWith('create') ? () => ({ id:++serial }): (...args) =>
      calls.push([k,...args])
    }
  );
}
const gl = fakeGL();
const canvas = { width: 1280, height: 800, getContext: () => gl };
const r = GLRenderer.create(canvas, w);
assert.ok(r);
const originalSet = w.set;
r.render();
const staticBuffer = r.staticBuffer;
const staticUploads = () => gl.uploads.filter(u => u.buffer === staticBuffer).length;
assert.equal(staticUploads(), 1);
r.yaw += 1;
r.span *=.8;
r.render();
assert.equal(staticUploads(), 1, 'turn and zoom reuse static mesh');
w.set(2, 0, 2, 0);
r.render();
assert.equal(staticUploads(), 1, 'playback updates a delta, not the static mesh');
assert.ok(r.changed.has((0 * w.d + 2) * w.w + 2));
assert.ok(r.changed.has((0 * w.d + 2) * w.w + 3), 'exposed neighbour is redrawn');
assert.ok(r.patchCount > 0);
assert.ok(gl.calls.some(c => c[0] === 'texSubImage2D'));
w.rev++;
r.render();
assert.equal(staticUploads(), 2);
assert.equal(r.patchCount, 0);
assert.equal(r.changed.size, 0);
r.dispose();
assert.equal(w.set, originalSet, 'dispose restores set');
assert.equal(GLRenderer.create({ getContext: () => null }, w), null);
for (const options of [{ compile: false }, { link: false }, { vertexTextures: 0 }]) {
  assert.equal(GLRenderer.create({ getContext: () => fakeGL(options) }, w), null);
}
for (const name of ['tiny-garden', 'small-town', 'hill-village']) {
  for (const reduced of [false, true]) {
    const f = JSON.parse(readFileSync('fixtures/' + name + '.json'));
    let server = core.newWorld(f.open);
    const player = createPlayer(E, { reduced });
    const state = {
      world: server.name,
      size: f.open.size,
      seed: server.seed,
      rev: 0,
      hash: hash(server),
      rle: encode(server.cells),
      life: server.life,
      opsApplied: 0
    };
    player.load(state);
    const context = fakeGL();
    const renderer = GLRenderer.create(
      { ...canvas, getContext: () => context },
      player.world,
      { reduced }
    );
    renderer.render();
    // Avoid retaining every upload from a full animated fixture.
    context.bufferData = () => {};
    context.texSubImage2D = () => {};
    context.drawArrays = () => {};
    for (let i = 0; i < f.batches.length; i++) {
      server = core.applyBatch(server, f.batches[i]).world;
      server.rev = i + 1;
      player.enqueue(
        { rev: server.rev, line: { ops: f.batches[i] }, hash: hash(server) }
      );
      for (let n = 0; n < 50000 && player.busy; n++) {
        player.step(.041);
        renderer.world = player.world;
        renderer.render();
        context.calls.length = 0;
      }
      renderer.world = player.world;
      renderer.render();
      assert.equal(
        player.hash,
        hash(server),
        name + ' render instrumentation preserves playback hash'
      );
      assert.equal(player.needsState, false);
      assert.equal(player.busy, false);
      assert.equal(renderer.cachedRev, server.rev);
      if (reduced) {
        const a = buildDynamicMesh(player.world, { reduced: true });
        player.step(3);
        assert.deepEqual(buildDynamicMesh(player.world, { reduced: true }), a);
      }
    }
    renderer.dispose();
  }
}
await (await import('./viewer-controller.mjs')).runViewerTests({ core, E, fakeGL });
mkdirSync('.agent-work/renderer-tests', { recursive: true });
const home = mkdtempSync(resolve('.agent-work/renderer-tests/run-'));
const session = createToolSession({ home });
session.call('world_open', {});
const http = await startHttp({ port: 0, session });
const send = (path, value) => new Promise(
  (resolve, reject) => {
    const body = value === undefined ? null: JSON.stringify(value);
    const req = request(
      {
        host: '127.0.0.1',
        port: http.address().port,
        path,
        method: body ? 'POST': 'GET',
        headers: body ? { 'content-type': 'application/json' }:
        {}
      },
      res => {
        let raw = '';
        res.on('data', c => raw += c);
        res.on('end', () => resolve({ status: res.statusCode, raw }));
      }
    );
    req.on('error', reject);
    req.end(body);
  }
);
try {
  const module = await send('/gl-renderer.mjs');
  assert.equal(module.status, 200);
  assert.ok(module.raw.includes('export class GLRenderer'));
  const townModule = await send('/games/town.mjs');
  assert.equal(townModule.status, 200);
  assert.ok(townModule.raw.includes("id: 'town@1'"));
  for (const renderer of ['canvas', 'webgl']) {
    const result = await send(
      '/bench',
      { renderer, p50: 1, p95: 2, gapP95: 16, frames: 600, w: 1280, h: 800, dpr: 1 }
    );
    assert.equal(result.status, 200);
    assert.equal(JSON.parse(readFileSync(join(home, 'bench.json'))).renderer, renderer);
  }
  assert.equal(
    (
      await send(
        '/bench',
        {
          renderer: 'other',
          p50: 1,
          p95: 2,
          gapP95: 16,
          frames: 600,
          w: 1280,
          h: 800,
          dpr: 1
        }
      )
    ).status,
    400
  );
} finally {
  await http.stop();
}
console.log(
  (
    "gl-renderer: 0 failures (geometry, GL commands, playback, " +
    "viewer controller and HTTP; no GPU context)"
  )
);
