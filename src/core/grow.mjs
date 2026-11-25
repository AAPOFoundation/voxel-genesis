// Enlarge a plain world, optionally moving its cells and spatial state east and south.
import { failure } from '../errors.mjs';
import { MAX_SIZE } from './codec.mjs';
export function growWorld(world, size, clone, shift = [0, 0]) {
  if (world.rulesId !== 'none@0') throw failure('rules');
  if (!Array.isArray(shift) || shift.length !== 2 ||
    shift.some(n => !Number.isSafeInteger(n) || n < 0)) throw failure('arguments');
  const [dx, dz] = shift;
  const old = [world.w, world.d, world.h];
  if (!Array.isArray(size) || size.length !== 3 || size.some(
    (n, i) => !Number.isInteger(n) || n < old[i] || n > MAX_SIZE[i]
  ) || size.every((n, i) => n === old[i])) throw failure('size');
  const [w, d, h] = size;
  if (w < world.w + dx || d < world.d + dz) throw failure('size');
  if ((dx || dz) && world.kit) throw failure('shiftKit');
  const cells = new Uint8Array(w * d * h);
  cells.fill(world.byName.grass, 0, w * d);
  for (let y = 0; y < world.h; y++) {
    for (let z = 0; z < world.d; z++) {
      const start = (y * world.d + z) * world.w;
      cells.set(world.cells.subarray(start, start + world.w), (y * d + z + dz) * w + dx);
    }
  }
  const grown = Object.assign(clone(world), { w, d, h, cells, rev: world.rev + 1 });
  for (const life of grown.life) {
    for (let i = 2; i < life.length; i += 2) {
      life[i] += dx;
      life[i + 1] += dz;
    }
  }
  for (const mover of Object.values(grown.movers ?? {})) {
    mover.x += dx;
    mover.z += dz;
  }
  return grown;
}
