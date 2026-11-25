// Shared validation and cell writes for primitive and edit operations.
import { failure } from '../errors.mjs';
export const fail = (key, value, allowed, field) => {
  throw failure(key, value, allowed, field); };
export const int = (...ns) => {
  if (!ns.every(Number.isSafeInteger)) {
    fail('integer', ns);
  }
};
export const cell = (world, x, y, z) => {
  int(x, y, z);
  if (!world.inside(x, y, z)) {
    fail('bounds', [x, y, z]);
  }
};
export const block = (world, b) => {
  if (!Object.hasOwn(world.byName, b)) {
    fail('block', b, Object.keys(world.byName));
  }
  return world.types[world.byName[b]];
};
export const form = (o, n) => {
  if (o.length !== n) {
    fail('form', o);
  }
};
export const volume = (a, b, c, d, e, f, fn) => {
  for (let x = Math.min(a, d); x <= Math.max(a, d); x++) {
    for (let y = Math.min(b, e); y <= Math.max(b, e); y++) {
      for (let z = Math.min(c, f); z <= Math.max(c, f); z++) {
        fn(x, y, z);
      }
    }
  }
};
export const put = (world, x, y, z, id) => {
  cell(world, x, y, z);
  world.set(x, y, z, id);
};
export const builtin = (validate, apply) => ({ validate, expand: op => [op], apply });
export const xyz = (world, o, start) => {
  cell(world,...o.slice(start, start + 3));
  cell(world,...o.slice(start + 3, start + 6));
};
