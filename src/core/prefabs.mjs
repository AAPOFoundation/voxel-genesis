// Extend frozen recipes with plain walls, deliberate windows and clean roofs.
import { failure } from '../errors.mjs';
import { PREFABS as BASE_TWO } from './prefabs-v2.mjs';
import { PREFABS as BASE_ONE } from './prefabs-v1.mjs';
const box = (b, x, y, z, xx = x, yy = y, zz = z) => ['box', b, x, y, z, xx, yy, zz];
const windows = (xs, y = 1) => xs.map(x => box('blue', x, y, 0));
export const PREFABS = {
  ...BASE_ONE,
  cottage: { size: [5, 5, 5], ops: [
    box('plaster', 0, 0, 0, 4, 2, 4), box('roof', 0, 3, 0, 4, 3, 4),
    box('roof', 1, 4, 0, 3, 4, 4), box('timber', 2, 0, 0, 2, 1, 0), ...windows([1, 3]),
    box('blue', 0, 1, 2), box('blue', 4, 1, 2), box('blue', 2, 1, 4)
  ] },
  house: { size: [5, 6, 8], ops: [
    box('plaster', 0, 0, 0, 4, 3, 5), box('tile', 0, 4, 0, 4, 4, 5),
    box('tile', 1, 5, 0, 3, 5, 5), box('tile', 3, 6, 4, 3, 7, 4),
    box('timber', 2, 0, 0, 2, 1, 0), ...windows([1, 3]), ...windows([1, 3], 3),
    ...[1, 3].flatMap(y => [box('blue', 0, y, 2), box('blue', 4, y, 2),
      box('blue', 2, y, 5)])
  ] },
  shop: { size: [6, 5, 5], ops: [
    box('amber', 0, 0, 0, 5, 2, 4), box('roof', 0, 3, 0, 5, 3, 4),
    box('roof', 1, 4, 1, 4, 4, 3), box('timber', 2, 0, 0, 3, 1, 0),
    ...[0, 2, 4].map(x => box('plaster', x, 2, 0)), ...windows([1, 4])
  ] },
  barn: { ...BASE_ONE.barn, ops: BASE_ONE.barn.ops.map(op =>
    [op[0], op[1] === 'brick' ? 'tile' : op[1] === 'slate' ? 'blue' : op[1], ...op.slice(2)]) },
  workshop: { ...BASE_ONE.workshop, ops: [
    box('timber', 0, 0, 0, 4, 2, 4), box('blue', 0, 3, 0, 4, 3, 4),
    box('tile', 3, 4, 3, 3, 5, 3), box('tile', 2, 0, 0, 2, 1, 0), ...windows([1, 3])
  ] },
  market: { ...BASE_ONE.market, ops: [
    box('amber', 0, 0, 0, 5, 3, 5), box('roof', 0, 4, 0, 5, 4, 5),
    box('roof', 1, 5, 1, 4, 5, 4), box('plaster', 2, 6, 2, 3, 6, 3),
    box('timber', 2, 0, 0, 3, 1, 0), ...windows([1, 4]),
    ...[0, 2, 4].map(x => box('plaster', x, 2, 0))
  ] },
  tower: { ...BASE_ONE.tower, ops: [
    box('plaster', 0, 0, 0, 3, 11, 3), box('tile', 0, 5, 0, 3, 5, 3),
    box('tile', 0, 11, 0, 3, 11, 3),
    box('timber', 1, 0, 0, 1, 1, 0),
    ...[3, 7, 9].flatMap(y => [box('blue', 1, y, 0, 2, y, 0),
      box('blue', 1, y, 3, 2, y, 3), box('blue', 0, y, 1, 0, y, 2),
      box('blue', 3, y, 1, 3, y, 2)])
  ] }
};
/** Keep existing worlds on their original recipes. */
export const prefabsOf = world => world.setId === 'base@1' ? BASE_ONE
  : world.setId === 'base@2' ? BASE_TWO : PREFABS;
/** Return rotated prefab cells with clearing and rock footings. */
export function stampCells(world, name, x, z, turns) {
  const prefab = prefabsOf(world)[name];
  const [ow, od, h] = prefab.size;
  const width = turns % 2 ? od: ow;
  const depth = turns % 2 ? ow: od;
  if (x < 0 || z < 0 || x + width > world.w || z + depth > world.d) {
    throw failure('bounds');
  }
  let base = 0;
  for (let xx = x; xx < x + width; xx++) {
    for (let zz = z; zz < z + depth; zz++) {
      base = Math.max(base, world.ground(xx, zz) + 1);
    }
  }
  if (base + h > world.h) {
    throw failure('bounds');
  }
  const cells = [];
  for (let xx = x; xx < x + width; xx++) {
    for (let zz = z; zz < z + depth; zz++) {
      for (let y = world.ground(xx, zz) + 1; y < base; y++) {
        cells.push([xx, y, zz, world.byName.rock]);
      }
      for (let y = base; y < base + h; y++) {
        cells.push([xx, y, zz, 0]);
      }
    }
  }
  const rotate = (u, v) => turns === 0 ? [u, v]: turns === 1 ?
  [od - 1 - v, u]: turns === 2 ? [ow - 1 - u, od - 1 - v]: [v, ow - 1 - u];
  for (const [, b, x1, y1, z1, x2, y2, z2] of prefab.ops) {
    for (let u = x1; u <= x2; u++) {
      for (let y = y1; y <= y2; y++) {
        for (let v = z1; v <= z2; v++) {
          const [xx, zz] = rotate(u, v);
          cells.push([x + xx, base + y, z + zz, world.byName[b]]);
        }
      }
    }
  }
  return cells;
}
