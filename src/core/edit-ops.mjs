// Replace blocks and reflect a snapshot of occupied cells.
import { fail, cell, block, form, volume, put, builtin, xyz } from './op-helpers.mjs';
export const EDIT_OPS = {
  swap: builtin(
    (world, o) => {
      form(o, o.length === 3 ? 3 : 9);
      block(world, o[1]);
      block(world, o[2]);
      if (o.length === 9) xyz(world, o, 3);
    },
    (world, o) => {
      const from = world.byName[o[1]], to = world.byName[o[2]];
      if (from === to) return;
      const box = o.length === 3 ? [0, 0, 0, world.w - 1, world.h - 1, world.d - 1] : o.slice(3);
      volume(...box, (x, y, z) => {
        if (world.get(x, y, z) === from) put(world, x, y, z, to);
      });
    }
  ),
  mirror: builtin(
    (world, o) => {
      form(o, 9);
      if (!['x', 'y', 'z'].includes(o[1]) || typeof o[2] !== 'number' ||
        !Number.isSafeInteger(2 * o[2])) fail('form', o);
      xyz(world, o, 3);
    },
    (world, o) => {
      const axis = ['x', 'y', 'z'].indexOf(o[1]), copies = [];
      // Snapshot before writing so overlapping source and target boxes reflect once.
      volume(...o.slice(3), (x, y, z) => {
        const id = world.get(x, y, z);
        if (!id) return;
        const target = [x, y, z];
        target[axis] = 2 * o[2] - target[axis];
        cell(world, ...target);
        copies.push([...target, id]);
      });
      for (const copy of copies) put(world, ...copy);
    }
  ),
};
