// Own bounded movers and the shared deterministic column walk.
import { failure } from '../errors.mjs';
import { normalId } from '../kit/canon.mjs';
// Repetition leaves notes and removals intact; mover columns shift only in x and z.
export const SHIFTS = {
  note: op => op,
  mover: (op, dx, dy, dz) => {
    if (op.length !== 5) return op;
    if (dy) throw failure('shift');
    return [op[0], op[1], op[2], op[3] + dx, op[4] + dz];
  }
};
// A column needs a solid top and room above it.
function height(world, x, z) {
  if (!world.inside(x, 0, z)) return -1;
  const y = world.top(x, z);
  return y + 1 < world.h && world.solid(x, y, z) && !world.get(x, y + 1, z) ? y : -1;
}
function walk(cells, state, others) {
  for (let i = 1; i < cells.length; i++) {
    const [x, z] = cells[i];
    const other = others.find(mover => mover.x === x && mover.z === z);
    if (other) return { cells: cells.slice(0, i), state: 'bump', other: other.id };
  }
  return { cells, state };
}
// P2: BFS ties follow +x, +z, -x, -z; nearest means Manhattan distance.
export const path = function path(world, from, to, others) {
  const size = world.w * world.d, start = from[1] * world.w + from[0];
  const parents = new Int32Array(size).fill(-1), tops = new Int16Array(size).fill(-2);
  const queue = new Int32Array(size);
  const distance = (x, z) => Math.abs(x - to[0]) + Math.abs(z - to[1]);
  const initial = height(world, ...from);
  if (initial < 0) return { cells: [[...from]], state: 'blocked' };
  queue[0] = start;
  parents[start] = start;
  tops[start] = initial;
  let head = 0, tail = 1, best = start, nearest = distance(...from);
  while (head < tail) {
    const id = queue[head++], x = id % world.w, z = Math.floor(id / world.w);
    const d = distance(x, z);
    if (d < nearest) { best = id; nearest = d; }
    if (d === 0) break;
    for (const [dx, dz] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
      const nx = x + dx, nz = z + dz, next = nz * world.w + nx;
      if (!world.inside(nx, 0, nz) || parents[next] !== -1) continue;
      if (tops[next] === -2) tops[next] = height(world, nx, nz);
      if (tops[next] < 0 || Math.abs(tops[next] - tops[id]) > 1) continue;
      parents[next] = id;
      queue[tail++] = next;
    }
  }
  const cells = [];
  for (let id = best; ; id = parents[id]) {
    cells.push([id % world.w, Math.floor(id / world.w)]);
    if (id === start) break;
  }
  return walk(cells.reverse(), nearest === 0 ? 'moved' : 'blocked', others);
};

const idOf = value => {
  try { return normalId(value); } catch { throw failure('moverId'); }
};
const cell = (world, x, z) => {
  if (![x, z].every(Number.isSafeInteger) || !world.inside(x, 0, z)) {
    throw failure('moverCell');
  }
};
const builtin = (validate, apply) => ({ validate, expand: op => [op], apply });
export const MOVER_OPS = {
  mover: builtin((world, op) => {
    if (![2, 5].includes(op.length)) throw failure('moverForm');
    const id = idOf(op[1]);
    if (op.length === 2) return;
    if (typeof op[2] !== 'string' || !Object.hasOwn(world.byName, op[2])) {
      throw failure('moverBlock');
    }
    cell(world, op[3], op[4]);
    if (height(world, op[3], op[4]) < 0) throw failure('moverStand');
    if (!Object.hasOwn(world.movers ?? {}, id) &&
      Object.keys(world.movers ?? {}).length >= 16) throw failure('moverCap');
  }, (world, op) => {
    const id = idOf(op[1]);
    if (op.length === 2) {
      if (world.movers) {
        delete world.movers[id];
        if (!Object.keys(world.movers).length) delete world.movers;
      }
      return;
    }
    world.movers ??= {};
    world.movers[id] = { block: op[2], x: op[3], z: op[4] };
  }),
  move: builtin((world, op) => {
    if (op.length !== 4) throw failure('moveForm');
    const id = idOf(op[1]);
    if (!Object.hasOwn(world.movers ?? {}, id)) throw failure('moverMissing');
    cell(world, op[2], op[3]);
  }, (world, op) => {
    const id = idOf(op[1]), mover = world.movers[id];
    const others = Object.entries(world.movers).filter(([key]) => key !== id)
      .map(([id, mover]) => ({ id, ...mover }));
    const route = path(world, [mover.x, mover.z], op.slice(2), others);
    [mover.x, mover.z] = route.cells.at(-1);
    world.moveResult = { id, ...route };
  })
};
