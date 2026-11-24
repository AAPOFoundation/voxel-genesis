// Encode cells and derive canonical hashes and world summaries.
import { failure } from '../errors.mjs';
import { SET_ID, SETS } from './palette.mjs';
/** Run-length encode a canonical cell buffer. */
export function encode(cells) {
  const a = [];
  for (const n of cells) {
    if (a.length && a.at(- 2) === n) {
      a[a.length - 1]++;
    } else {
      a.push(n, 1);
    }
  }
  return a;
}
/** Validate and decode a bounded run-length cell buffer. */
export function decode(a, size, set = SET_ID) {
  if (!Object.hasOwn(SETS, set) || !Array.isArray(a) || a.length % 2) {
    throw failure('save');
  }
  let n = 0;
  for (let i = 0; i < a.length; i += 2) {
    if (
      !Number.isInteger(a[i]) || a[i] < 0 || a[i] > SETS[set].length ||
      !Number.isInteger(a[i + 1]) ||
      a[i + 1] < 1
    ) {
      throw failure('save');
    }
    n += a[i + 1];
  }
  if (n > 48 * 48 * 32 || size !== undefined && n !== size) {
    throw failure('save');
  }
  const cells = new Uint8Array(n);
  let at = 0;
  for (let i = 0; i < a.length; i += 2) {
    cells.fill(a[i], at, at + a[i + 1]);
    at += a[i + 1];
  }
  return cells;
}
/** Hash dimensions, cells, life definitions and versioned rule and block sets. */
export function hash(world) {
  let n = 2166136261;
  const byte = b => {
    n = Math.imul(n ^ b, 16777619);
  };
  for (const v of [world.w, world.d, world.h]) {
    byte(v);
  }
  for (const v of world.cells) {
    byte(v);
  }
  for (
    const v of new TextEncoder().encode(
      JSON.stringify(world.life) + world.rulesId + (world.setId ?? SET_ID) +
      (world.game ? JSON.stringify(world.game) : '') +
      (world.kit ? JSON.stringify(world.kit) : '') +
      (world.feed ? JSON.stringify(world.feed) : '') +
      (world.movers ? JSON.stringify(world.movers) : '')
    )
  ) {
    byte(v);
  }
  return (n >>> 0).toString(16).padStart(8, '0');
}
/** Mix the seed and primitive operation index without floating-point randomness. */
export const mix = (seed, index) => Math.imul(seed ^ 0x9e3779b9, index + 1) >>> 0;
/** Count occupied cells and return the highest level and canonical hash. */
export function summary(world) {
  let count = 0;
  let top = - 1;
  for (let i = 0; i < world.cells.length; i++) if (world.cells[i]) {
    count++;
    top = Math.max(top, Math.floor(i / (world.w * world.d)));
  }
  return { count, top, hash: hash(world) };
}
