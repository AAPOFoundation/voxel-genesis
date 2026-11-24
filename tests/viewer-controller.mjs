// Verify geometry, GL command lifetimes, playback and viewer control wiring.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GLRenderer } from '../viewer/gl-renderer.mjs';
import { createPlayer, MOTION } from '../viewer/player.mjs';
import { fitCamera } from '../viewer/camera.mjs';
import { C, townHud } from '../src/copy.mjs';
import { packOf } from '../src/core/rules.mjs';
import { encode, hash } from '../src/core/codec.mjs';
/** Run the browser controller against DOM and renderer doubles. */
export async function runViewerTests({ core, E, fakeGL }) {
  // Execute the viewer controller with a small DOM double, keeping the real renderer selector.
  const viewerSource = readFileSync('viewer/viewer.mjs', 'utf8').replace(
    /^import .*;\r?\n/gm,
    ''
  );
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  for (const scenario of ['webgl', 'forced', 'unavailable', 'compile', 'lost', 'reduced',
    'step', 'step-reduced']) {
    const context = fakeGL({ compile: scenario !== 'compile' });
    const posts = [];
    const nodes = new Map();
    let canvasNow;
    let frame;
    let canvasRenders = 0;
    let lastYaw;
    let events;
    const makeCanvas = () => (
      {
        width: 1280,
        height: 800,
        listeners: {},
        getContext: () => scenario === 'unavailable' ? null: context,
        cloneNode: () => makeCanvas(),
        replaceWith: fresh => {
          canvasNow = fresh;
        },
        addEventListener(type, fn) {
          this.listeners[type] = fn;
        },
        getBoundingClientRect: () => ({ width: 1280, height: 800 }),
        setPointerCapture() {}
      }
    );
    canvasNow = makeCanvas();
    const document = {
      hidden: false,
      createElement: () => ({}),
      addEventListener() {},
      querySelector(key) {
        if (key === '#world') {
          return canvasNow;
        }
        if (!nodes.has(key)) {
          nodes.set(key, { setAttribute() {},
            replaceChildren(...children) {
              this.textContent = children.map(n => n.textContent).join('');
            }
          });
        }
        return nodes.get(key);
      }
    };
    const world = core.newWorld({ size: [8, 8, 8] });
    const state = {
      world: world.name,
      size: [8, 8, 8],
      seed: world.seed,
      rev: 0,
      hash: hash(world),
      rle: encode(world.cells),
      life: [],
      opsApplied: 0
    };
    class CanvasRenderer {
      constructor(canvas, world) {
        Object.assign(this, { canvas, world, yaw:.7, span: 12 });
      }
      render() {
        canvasRenders++;
        lastYaw = this.yaw;
      }
    }
    const fetch = async (path, options) => {
      if (path === '/bench') {
        posts.push(JSON.parse(options.body));
        return { ok: true };
      }
      assert.equal(path, '/api/state');
      return { ok: true, json: async () => state };
    };
    class CachedCanvasRenderer extends CanvasRenderer {
      constructor(engine, canvas, world) {
        super(canvas, world);
        this.pitch =.56;
      }
    } const args = {
      createPlayer,
      MOTION,
      C,
      townHud,
      packOf,
      GLRenderer,
      fitCamera,
      CachedCanvasRenderer,
      document,
      window: { AapoVoxel: { ...E, Renderer: CanvasRenderer } },
      matchMedia: () => ({ matches: scenario.endsWith('reduced'),
        addEventListener() {} }),
      location: {
        search: '?bench=1' + (
          ['forced', 'reduced'].includes(scenario) || scenario.startsWith('step')
            ? '&renderer=canvas' + (scenario.startsWith('step') ? '&step=1' : '') :
          ''
        )
      },
      fetch,
      EventSource: class { constructor() { events = this; } close() {} },
      requestAnimationFrame: fn => {
        frame = fn;
      },
      devicePixelRatio: 1
    };
    const controller = await new AsyncFunction(
      ...Object.keys(args), viewerSource + '\nreturn { load, zoom: () => zoom };'
    )(...Object.values(args));
    if (scenario.startsWith('step')) {
      const step = args.window.genesisStep;
      assert.equal(frame, undefined, 'step mode never schedules animation frames');
      const start = canvasRenders;
      assert.deepEqual(step(0), { busy: false, bodies: 0, rev: 0 });
      assert.equal(canvasRenders, start + 1, 'one paint per requested step');
      const ops = [['drop', 'brick', 2, 2, 2]];
      const next = core.applyBatch(world, ops).world;
      events.onmessage({ data: JSON.stringify({ rev: 1, line: { ops }, hash: hash(next) }) });
      const falling = step(1 / 60);
      if (scenario === 'step') {
        assert.ok(falling.busy && falling.bodies > 0, 'fall visible without animation frames');
      } else assert.deepEqual(falling, { busy: false, bodies: 0, rev: 1 });
      assert.deepEqual(step(10), { busy: false, bodies: 0, rev: 1 });
      const stamp = [['stamp', 'cottage', 0, 0, 0]];
      const built = core.applyBatch(next, stamp).world;
      events.onmessage({ data: JSON.stringify(
        { rev: 2, line: { ops: stamp }, hash: hash(built) }
      ) });
      if (scenario === 'step') {
        assert.equal(step(.1).busy, true, 'a stamp takes more than one frame');
        nodes.get('#pause').onclick({ currentTarget: { setAttribute() {} } });
        assert.equal(step(1).busy, true, 'pause holds layers');
        nodes.get('#pause').onclick({ currentTarget: { setAttribute() {} } });
      }
      assert.deepEqual(step(10), { busy: false, bodies: 0, rev: 2 });
      assert.equal(frame, undefined);
      continue;
    }
    assert.equal(controller.zoom(), 1);
    nodes.get('#zoom-in').onclick();
    assert.ok(controller.zoom() < 1, 'first zoom button works');
    nodes.get('#zoom-out').onclick();
    assert.equal(controller.zoom(), 1);
    if (scenario === 'lost') {
      canvasNow.listeners.webglcontextlost({ preventDefault() {} });
    }
    for (let i = 1; i <= 603; i++) {
      frame(i * 16);
    }
    const expected = scenario === 'webgl' ? 'webgl': 'canvas';
    assert.equal(posts.length, 1, scenario + ' posts once');
    assert.equal(posts[0].renderer, expected);
    assert.equal(posts[0].frames, 600);
    assert.equal(posts[0].w, 1280);
    assert.equal(posts[0].h, 800);
    assert.equal(canvasRenders > 0, expected === 'canvas');
    assert.equal(typeof canvasNow.onpointerdown, 'function', 'fallback keeps controls');
    if (scenario === 'reduced') {
      assert.equal(lastYaw, Math.PI - .7, 'bench respects reduced motion');
    }
    assert.equal(nodes.get('#hud').hidden, true, 'plain world hides HUD');
    let townWorld = core.newWorld({ rules: 'town@1', seed: 7 });
    const fixture = JSON.parse(readFileSync('fixtures/town-game.json', 'utf8'));
    for (const ops of fixture.batches) townWorld = core.applyBatch(townWorld, ops).world;
    Object.assign(state, {
      size: [36, 36, 16], seed: 7, rev: 24, rules: 'town@1', game: townWorld.game,
      rle: encode(townWorld.cells), life: townWorld.life,
      opsApplied: townWorld.opsApplied, hash: hash(townWorld)
    });
    await controller.load();
    frame(10000);
    assert.equal(nodes.get('#hud').hidden, false, scenario + ' shows town HUD');
    assert.equal(nodes.get('#hud-turn').textContent, 'Turn 24 of 24');
    assert.equal(nodes.get('#hud-people').textContent, '56 people');
    assert.equal(nodes.get('#hud-happy').textContent, 'Happy 100');
    assert.equal(nodes.get('#hud-coins').textContent, '59 coins');
    assert.equal(nodes.get('#hud-goal').value, 168);
    assert.equal(nodes.get('#hud-label').textContent, '168 hearts, goal 120');
    assert.match(nodes.get('#hud-end').textContent, /Two stars.*The helper made 168/);
  }

}
