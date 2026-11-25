// Own ordered viewer playback, motion preferences and hash resynchronisation.
import { createCore } from '../src/core/index.mjs';
import { decode, hash } from '../src/core/codec.mjs';
import { dressAgent, moverAgents } from './life.mjs';
export const MOTION = { turnSpeed:.6, carSpeed: 2, opGap: 120, autoRotate: false };
/** Create a DOM-free player that verifies each completed revision. */
export function createPlayer(E, { reduced = false, onChange = () => {} } = {}) {
  const core = createCore(E);
  let world = null;
  let pending = null;
  let queue = [];
  let nextState;
  let ops = [];
  let index = 0;
  let acc = 0;
  let gap = 0;
  let ticks = 0;
  let sawBody = false;
  let needsState = false;
  let active = false;
  let paused = false;
  let layers = [];
  let layerWait = 0;
  const random = E.rng(41);
  const plantable = (w, x, z) => w.inside(x, 0, z) && w.type(x, w.top(x, z), z)?.plantable === true;
  function agents() {
    world.agents = world.life.map(
      ([kind, block, x1, z1, x2, z2]) => {
        if (kind === 'pet') {
          return dressAgent(new E.HopAgent(
            {
              x: x1,
              z: z1,
              color: world.types[world.byName[block]].color,
              still: reduced,
              canStand: plantable
            }
          ), 'pet');
        }
        const path = [];
        const left = Math.min(x1, x2);
        const right = Math.max(x1, x2);
        const top = Math.min(z1, z2);
        const bottom = Math.max(z1, z2);
        const add = (x, z) => path.push([x, z, world.ground(x, z) + 1]);
        if (left === right) {
          for (let z = top; z <= bottom; z++) {
            add(left, z);
          }
          for (let z = bottom - 1; z > top; z--) {
            add(left, z);
          }
        } else if (top === bottom) {
          for (let x = left; x <= right; x++) {
            add(x, top);
          }
          for (let x = right - 1; x > left; x--) {
            add(x, top);
          }
        } else {
          for (let x = left; x < right; x++) {
            add(x, top);
          }
          for (let z = top; z < bottom; z++) {
            add(right, z);
          }
          for (let x = right; x > left; x--) {
            add(x, bottom);
          }
          for (let z = bottom; z > top; z--) {
            add(left, z);
          }
        }
        const car = new E.PathAgent(
          { path, speed: MOTION.carSpeed, color: world.types[world.byName[block]].color }
        );
        car.paused = reduced;
        return dressAgent(car, 'car');
      }
    );
    moverAgents(world, MOTION.carSpeed, undefined, () => reduced);
  }
  function finish() {
    world.bodies = [];
    world.rev = pending.rev;
    needsState ||= hash(world) !== pending.hash;
    pending = null;
    ops = [];
    active = false;
    agents();
    onChange();
    if (nextState !== undefined) {
      const queued = queue;
      api.load(nextState);
      queue = queued;
    }
  }
  function reveal() {
    for (const [i, value] of layers.shift() || []) {
      world.set(i % world.w, Math.floor(i / (world.w * world.d)),
        Math.floor(i / world.w) % world.d, value);
    }
    world.dirty = true;
  }
  function begin(op) {
    const staged = ['stamp', 'build', 'grow', 'auto', 'do', 'end'].includes(op[0]);
    const before = staged ? world.cells.slice() : null;
    core.startOp(world, op);
    if (op[0] === 'mover' || op[0] === 'move') {
      moverAgents(world, MOTION.carSpeed, world.moveResult, () => reduced);
      delete world.moveResult;
    }
    sawBody = world.bodies.length > 0;
    if (before) {
      const rows = new Map();
      for (let i = 0; i < world.cells.length; i++) {
        if (world.cells[i] === before[i]) continue;
        const y = Math.floor(i / (world.w * world.d));
        if (!rows.has(y)) rows.set(y, []);
        rows.get(y).push([i, world.cells[i]]);
      }
      layers = [...rows].sort((a, b) => a[0] - b[0]).map(([, cells]) => cells);
      world.cells.set(before);
      layerWait = 0;
    }
  }
  function startEvent(event) {
    pending = event;
    try {
      if (event.line.grow) {
        const moverAxis = world.moverAxis;
        world = core.grow(world, event.line.grow, event.line.shift);
        if (moverAxis) world.moverAxis = moverAxis;
        finish();
        return;
      }
      if (reduced) {
        world = core.applyBatch(world, event.line.ops).world;
        finish();
        return;
      }
      ops = core.expand(event.line.ops, world);
      index = 0;
      gap = 0;
      acc = 0;
      active = false;
    } catch {
      needsState = true;
      pending = null;
    }
  }
  const api = {
    get world() {
      return world;
    },
    get hash() {
      return world ? hash(world): null;
    },
    get busy() {
      return pending !== null || (!needsState && queue.length > 0);
    },
    get needsState() {
      return needsState && pending === null;
    },
    set paused(v) {
      paused = !!v;
    },
    get paused() {
      return paused;
    },
    load(s) {
      if (pending) {
        nextState = s;
        needsState = false;
        queue = s?.world === world.name ? queue.filter(event => event.rev > s.rev) : [];
        return;
      }
      nextState = undefined;
      layers = [];
      pending = null;
      queue = [];
      ops = [];
      active = false;
      gap = 0;
      acc = 0;
      needsState = false;
      if (!s) {
        world = null;
        onChange();
        return;
      }
      world = core.newWorld({
        name: s.world, size: s.size, seed: s.seed, rules: s.rules, set: s.set
      });
      if (s.movers) world.movers = JSON.parse(JSON.stringify(s.movers));
      if (s.kit) world.kit = JSON.parse(JSON.stringify(s.kit));
      if (s.feed) world.feed = s.feed.map(entry => ({ ...entry }));
      if (s.game) {
        world.game = JSON.parse(JSON.stringify(s.game));
      }
      world.cells.set(decode(s.rle, world.cells.length, world.setId));
      world.life = JSON.parse(JSON.stringify(s.life));
      world.opsApplied = s.opsApplied;
      world.rev = s.rev;
      agents();
      needsState = hash(world) !== s.hash;
      onChange();
    },
    enqueue(event) {
      if (event.reset && event.state) {
        api.load(event.state);
        return;
      }
      const last = queue.at(-1)?.rev ?? nextState?.rev ?? pending?.rev ?? world?.rev;
      if (!world || event.reset || event.line?.undo || event.rev !== last + 1 ||
        queue.length >= 12) {
        needsState = true;
        queue = [];
        nextState = undefined;
        return;
      }
      if (needsState) return;
      if (pending || queue.length) {
        queue.push(event);
        return;
      }
      startEvent(event);
    },
    step(dt) {
      if (!world || paused || (needsState && !pending) || reduced) {
        return;
      }
      if (!pending && queue.length) startEvent(queue.shift());
      if (pending) {
        acc += Math.min(.1, Math.max(0, dt));
        try {
          while (acc >= E.STEP && pending) {
            acc -= E.STEP;
            if (gap > 0) {
              gap -= E.STEP;
              continue;
            }
            if (!active) {
              if (index >= ops.length) {
                finish();
                break;
              }
              begin(ops[index++]);
              onChange();
              ticks = 0;
              active = true;
            }
            if (layers.length) {
              layerWait -= E.STEP;
              if (layerWait <= 0) {
                reveal();
                layerWait = .08;
              }
              continue;
            }
            sawBody ||= world.bodies.length > 0;
            core.tick(world);
            sawBody ||= world.bodies.length > 0;
            if (++ticks > 3600) {
              needsState = true;
              pending = null;
              break;
            }
            if (core.quiet(world) && world.bodies.length === 0 &&
              !world.agents.some(agent => agent.moving)) {
              core.finishOp(world, sawBody);
              active = false;
              gap = MOTION.opGap / 1000;
            }
          }
        } catch {
          needsState = true;
          pending = null;
        }
      } else {
        const old = world.random;
        world.random = random;
        for (const agent of world.agents) {
          agent.step(world, Math.min(.1, dt));
        }
        world.random = old;
      }
    },
    reduced(value) {
      reduced = !!value;
      if (world && reduced && (pending || queue.length)) {
        try {
          if (active) {
            while (layers.length) reveal();
            core.finishOp(world, sawBody);
            active = false;
          }
          while (index < ops.length) {
            core.startOp(world, ops[index++]);
            core.finishOp(world);
          }
          if (pending) finish();
          while (!needsState && queue.length) startEvent(queue.shift());
        } catch {
          needsState = true;
          pending = null;
        }
      }
      if (world) {
        world.bodies = [];
        agents();
      }
    },
    hidden() {
      needsState = true;
      queue = [];
      nextState = undefined;
    }
  };
  return api;
}
