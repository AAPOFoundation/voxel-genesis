// Own deterministic worlds, atomic operation batches and settled replay.
import { failure, opError } from '../errors.mjs';
import { definePalette, SET_ID } from './palette.mjs';
import { OPS, expand } from './ops.mjs';
import { MOVER_OPS } from './movers.mjs';
import { PACKS, packOf } from './rules.mjs';
import { summary, mix } from './codec.mjs';
import { openBridgeEnds } from './bridge.mjs';
import { kitOps, kitStep } from '../kit/parts.mjs';
import { INPUT_OPS } from '../kit/inputs.mjs';
/** Create a pure core bound to one engine implementation. */
export function createCore(engine) {
  const work = { replays: 0, applies: 0, ticks: 0, kit: 0 };
  const kit = kitOps(startOp, finishOp);
  const registry = world => ({ ...OPS, ...kit, ...MOVER_OPS, ...INPUT_OPS,
    ...PACKS[world?.rulesId ?? 'none@0'].ops });
  function newWorld({
    name = 'my-world', size, seed = 1, rules: id = 'none@0', set = SET_ID
  } = {}) {
    if (!Object.hasOwn(PACKS, id)) {
      throw failure('rules');
    }
    const pack = PACKS[id];
    size ??= pack.size ?? [32, 32, 24];
    if (pack.size && JSON.stringify(size) !== JSON.stringify(pack.size)) {
      throw failure('townSize');
    }
    if (
      !Array.isArray(size) || size.length !== 3 || size.some(
        (n, i) => !Number.isInteger(n) || n < 8 || n > (i === 2 ? 32: 48)
      )
    ) {
      throw failure('size');
    }
    const [width, depth, height] = size;
    const world = new engine.World({ w: width, d: depth, h: height, seed });
    definePalette(world, set);
    Object.assign(
      world,
      { name, seed, life: [], rulesId: id, setId: set, opsApplied: 0, rev: 0 }
    );
    world.systems.push(...packOf(world).systems);
    // Record contact for presentation and reporting without changing the pinned physics.
    world.on('splash', body => {
      const x = Math.floor(body.x), z = Math.floor(body.z);
      const below = Math.min(world.h - 1, Math.floor(body.y - body.size / 2));
      for (let y = below; y >= 0; y--) {
        if (!world.type(x, y, z)?.liquid) continue;
        body.waterCell = [x, y, z];
        body.wetAge = body.age;
        break;
      }
    });
    for (let x = 0; x < width; x++) {
      for (let z = 0; z < depth; z++) {
        world.set(x, 0, z, world.byName.grass);
      }
    }
    pack.start?.(world, engine);
    return world;
  }
  function clone(world) {
    const copy = newWorld({
      name: world.name, size: [world.w, world.d, world.h], seed: world.seed,
      rules: world.rulesId, set: world.setId
    });
    copy.cells.set(world.cells);
    copy.life = JSON.parse(JSON.stringify(world.life));
    if (world.movers) copy.movers = JSON.parse(JSON.stringify(world.movers));
    if (world.feed) copy.feed = world.feed.map(entry => ({ ...entry }));
    if (world.kit) copy.kit = JSON.parse(JSON.stringify(world.kit));
    if (world.game) {
      copy.game = JSON.parse(JSON.stringify(world.game));
    }
    copy.opsApplied = world.opsApplied;
    copy.rev = world.rev;
    copy.time = world.time;
    return copy;
  }
  const quiet = world => !world.dirty && !world.bodies.some(b => b.settle);
  function tick(world) {
    work.ticks++;
    world.tick(engine.STEP);
  }
  function settle(world, observed) {
    let n = 0;
    if (observed && world.bodies.length) observed.sawBody = true;
    while (!quiet(world)) {
      if (n++>= 3600) {
        throw failure('settle');
      }
      tick(world);
      if (observed && world.bodies.length) observed.sawBody = true;
    }
    world.bodies = [];
    return n;
  }
  function finishOp(world, sawBody = false) {
    const observed = { sawBody };
    const ticks = settle(world, observed);
    if (!observed.sawBody || !world.kit) return ticks;
    work.kit++;
    kitStep(world, engine);
    return ticks + settle(world);
  }
  function startOp(world, op) {
    const reg = registry(world);
    const handler = reg[op[0]];
    if (!handler) {
      throw failure('op');
    }
    handler.validate(world, op);
    work.applies++;
    world.random = engine.rng(mix(world.seed, world.opsApplied));
    handler.apply(world, op, engine);
    if (world.kit) {
      work.kit++;
      kitStep(world, engine);
    }
    world.opsApplied++;
    world.dirty = true;
  }
  function applyBatch(world, ops) {
    const flat = expand(ops, registry(world));
    const candidate = clone(world);
    const stats = { placed: 0, removed: 0, fell: 0, lost: 0, sank: 0 };
    let writes = 0;
    let collapsing = false;
    let source = 'ops[0]';
    const at = [];
    const moves = new Map();
    let scatter = null;
    let bridgeOpen = false;
    const spot = body => {
      if (at.length < 3) {
        const place = source + ':' + [body.x, body.y, body.z].map(Math.floor).join(',');
        if (!at.includes(place)) {
          at.push(place);
        }
      }
    };
    const originalSet = candidate.set;
    const originalSpawn = candidate.spawn;
    const originalCollapse = candidate.collapse;
    const originalMove = candidate.move;
    candidate.set = function (x, y, z, id) {
      if (++writes > 20000) {
        throw failure('writes');
      }
      const old = this.get(x, y, z);
      if (old !== id) {
        if (old) {
          stats.removed++;
        }
        if (id) {
          stats.placed++;
        }
      }
      return originalSet.call(this, x, y, z, id);
    };
    candidate.collapse = function () {
      collapsing = true;
      try {
        return originalCollapse.call(this);
      } finally {
        collapsing = false;
      }
    };
    candidate.spawn = function (o) {
      if (collapsing) {
        stats.fell++;
        spot(o);
      }
      if (!o.settle) {
        stats.lost++;
        spot(o);
      }
      return originalSpawn.call(this, o);
    };
    candidate.move = function (b, h) {
      let landed = false;
      const on = () => {
        landed = true;
      };
      this.on('settle', on);
      let done;
      try {
        done = originalMove.call(this, b, h);
      } finally {
        this.handlers.settle.pop();
      }
      if (done && b.settle) {
        if (b.wet) {
          stats.sank++;
          const [x, y, z] = b.waterCell;
          spot({ x, y, z });
        } else if (!landed) {
          stats.lost++;
          spot(b);
        }
      }
      return done;
    };
    for (const op of flat) {
      source = op.source;
      try {
        startOp(candidate, op);
        if (op[0] === 'scatter') {
          scatter ??= [0, 0];
          candidate.scatterResult.forEach((n, i) => scatter[i] += n);
          delete candidate.scatterResult;
        }
        if (op[0] === 'stamp' && op[1] === 'bridge') {
          bridgeOpen ||= openBridgeEnds(candidate, op);
        }
        finishOp(candidate);
        if (candidate.moveResult) {
          moves.set(candidate.moveResult.id, candidate.moveResult);
          delete candidate.moveResult;
        }
      } catch (error) {
        throw opError(error, source, op);
      }
    }
    delete candidate.set;
    delete candidate.spawn;
    delete candidate.collapse;
    delete candidate.move;
    return {
      world: candidate,
      result: {
        ok: true,
        rev: world.rev + 1,
        ops: flat.length,
        ...stats,
        life: candidate.life.length,
        changed: candidate.cells.reduce((n, id, i) => n + Number(id !== world.cells[i]), 0),
        at,
        scatter,
        bridgeOpen,
        moves: [...moves.values()],
        ...summary(candidate),
        warn: []
      }
    };
  }
  function replay(header, lines) {
    work.replays++;
    let builds = [];
    for (const [index, line] of lines.entries()) {
      if (line.ops) {
        builds.push({ ops: line.ops, rev: index + 1 });
      } else if (Number.isInteger(line.undo) && line.undo > 0 && line.undo <= builds.length) {
        builds.splice(- line.undo);
      } else {
        throw failure('save');
      }
    }
    let world = newWorld({
      name: header.world, size: header.size, seed: header.seed, rules: header.rules, set: header.set
    });
    for (const { ops, rev } of builds) {
      world.rev = rev - 1;
      world = applyBatch(world, ops).world;
    }
    world.rev = lines.length;
    return { world, builds: builds.map(build => build.ops) };
  }
  return {
    work,
    newWorld,
    applyBatch,
    settle,
    finishOp,
    replay,
    startOp,
    tick,
    quiet,
    expand: (ops, world) => expand(ops, registry(world))
  };
}
