// Extend frozen recipes with plain walls, deliberate windows and clean roofs.
import { PREFABS as BASE_ONE } from './prefabs-v1.mjs';
const box = (b, x, y, z, xx = x, yy = y, zz = z) => ['box', b, x, y, z, xx, yy, zz];
const windows = (xs, y = 1) => xs.map(x => box('blue', x, y, 0));
export const PREFABS = {
  ...BASE_ONE,
  cottage: { size: [5, 5, 5], ops: [
    box('plaster', 0, 0, 0, 4, 2, 4), box('roof', 0, 3, 0, 4, 3, 4),
    box('roof', 1, 4, 0, 3, 4, 4), box('timber', 2, 0, 0, 2, 1, 0), ...windows([1, 3])
  ] },
  house: { size: [5, 6, 8], ops: [
    box('plaster', 0, 0, 0, 4, 3, 5), box('tile', 0, 4, 0, 4, 4, 5),
    box('tile', 1, 5, 0, 3, 5, 5), box('tile', 3, 6, 4, 3, 7, 4),
    box('timber', 2, 0, 0, 2, 1, 0), ...windows([1, 3]), ...windows([1, 3], 3)
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
    box('blue', 0, 0, 0, 3, 11, 3), box('tile', 0, 5, 0, 3, 5, 3),
    box('timber', 1, 0, 0, 1, 1, 0),
    ...[3, 7, 9].flatMap(y => [box('slate', 1, y, 0), box('slate', 3, y, 2)])
  ] }
};
