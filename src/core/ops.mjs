// Validate and apply primitive operations, including bounded repetition.
import { opError } from '../errors.mjs';
import { PREFABS, prefabsOf, stampCells } from './prefabs.mjs';
import { mix } from './codec.mjs';
import { kitError } from '../kit-copy.mjs';
import { note } from './feed.mjs';
import { MOVER_OPS, SHIFTS } from './movers.mjs';
import { EDIT_OPS } from './edit-ops.mjs';
import { fail, int, cell, block, form, volume, put, builtin, xyz } from './op-helpers.mjs';
const range = (n, lo, hi, key) => {
  int(n);
  if (n < lo || n > hi) {
    fail(key, n);
  }
};
const column = (world, x, z) => cell(world, x, 0, z);
const ground = (world, b) => {
  if (!block(world, b).fixed) {
    fail('ground', b);
  }
};
const rect = (world, o, start) => {
  column(world, o[start], o[start + 1]);
  column(world, o[start + 2], o[start + 3]);
};
const cols = (a, b, c, d, fn) => {
  for (let x = Math.min(a, c); x <= Math.max(a, c); x++) {
    for (let z = Math.min(b, d); z <= Math.max(b, d); z++) {
      fn(x, z);
    }
  }
};
const stamp = (world, name, x, z, turns) => {
  for (const [xx, y, zz, id] of stampCells(world, name, x, z, turns)) {
    put(world, xx, y, zz, id);
  }
};
export const OPS = { note, ...MOVER_OPS,
  box: builtin(
    (world, o) => {
      form(o, 8);
      block(world, o[1]);
      xyz(world, o, 2);
    },
    (world, o) => volume(
      ...o.slice(2),
      (x, y, z) => put(world, x, y, z, world.byName[o[1]])
    )
  ),
  line: builtin(
    (world, o) => {
      form(o, 8);
      block(world, o[1]);
      xyz(world, o, 2);
    },
    (world, o) => {
      const [, b, x, y, z, xx, yy, zz] = o;
      const n = Math.max(Math.abs(xx - x), Math.abs(yy - y), Math.abs(zz - z));
      for (let i = 0; i <= n; i++) {
        put(
          world,
          Math.round(x + (xx - x) * (n ? i / n: 0)),
          Math.round(y + (yy - y) * (n ? i / n: 0)),
          Math.round(z + (zz - z) * (n ? i / n: 0)),
          world.byName[b]
        );
      }
    }
  ),
  paint: builtin(
    (world, o) => {
      form(o, 6);
      ground(world, o[1]);
      rect(world, o, 2);
    },
    (world, o) => cols(
      ...o.slice(2),
      (x, z) => put(world, x, Math.max(0, world.ground(x, z)), z, world.byName[o[1]])
    )
  ),
  cover: builtin(
    (world, o) => {
      form(o, 7);
      block(world, o[1]);
      rect(world, o, 2);
      range(o[6], 1, 4, 'layers');
    },
    (world, o) => cols(
      ...o.slice(2, 6),
      (x, z) => {
        const y = world.top(x, z);
        for (let k = 1; k <= o[6]; k++) {
          put(world, x, y + k, z, world.byName[o[1]]);
        }
      }
    )
  ),
  hill: builtin(
    (world, o) => {
      form(o, 6);
      ground(world, o[1]);
      int(o[2], o[3]);
      range(o[4], 2, 16, 'radius');
      range(o[5], 1, 12, 'height');
    },
    (world, o) => {
      const [, b, cx, cz, r, h] = o;
      const left = Math.max(0, cx - r);
      const right = Math.min(world.w - 1, cx + r);
      const near = Math.max(0, cz - r);
      const far = Math.min(world.d - 1, cz + r);
      if (left > right || near > far) {
        return;
      }
      cols(
        left,
        near,
        right,
        far,
        (x, z) => {
          if (x < 0 || z < 0 || x >= world.w || z >= world.d) {
            return;
          }
          const k = Math.max(
            0,
            Math.round(h * (1 - ((x - cx) * (x - cx) + (z - cz) * (z - cz)) / (r * r)))
          );
          const y = world.ground(x, z);
          for (let n = 1; n <= k && y + n < world.h; n++) {
            put(world, x, y + n, z, world.byName[b]);
          }
        }
      );
    }
  ),
  drop: builtin(
    (world, o) => {
      form(o, 5);
      if (block(world, o[1]).liquid) {
        fail('water', o[1]);
      }
      column(world, o[2], o[3]);
      range(o[4], 1, 16, 'count');
    },
    (world, o) => {
      for (let n = 0; n < o[4]; n++) {
        world.drop(o[2], o[3], world.byName[o[1]], 6 + n * 1.1);
      }
    }
  ),
  stamp: builtin(
    (world, o) => {
      form(o, 5);
      if (!Object.hasOwn(PREFABS, o[1])) {
        fail('prefab', o[1], Object.keys(PREFABS));
      }
      column(world, o[2], o[3]);
      range(o[4], 0, 3, 'turns');
    },
    (world, o) => stamp(world,...o.slice(1))
  ),
  scatter: builtin(
    (world, o) => {
      form(o, 7);
      if (!Object.hasOwn(PREFABS, o[1])) {
        block(world, o[1]);
      }
      rect(world, o, 2);
      range(o[6], 0, 200, 'count');
    },
    (world, o, E) => {
      const [, name, x1, z1, x2, z2, n] = o;
      const points = [];
      cols(x1, z1, x2, z2, (x, z) => points.push([x, z]));
      const random = E.rng(mix(world.seed, world.opsApplied));
      for (let i = points.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [points[i], points[j]] = [points[j], points[i]];
      }
      let placed = 0;
      for (const [x, z] of points) {
        if (placed >= n) {
          break;
        }
        const p = prefabsOf(world)[name];
        const width = p?.size[0] || 1;
        const depth = p?.size[1] || 1;
        if (
          x + width > world.w || z + depth > world.d || x + width - 1 > Math.max(x1, x2) ||
          z + depth - 1 > Math.max(z1, z2)
        ) {
          continue;
        }
        let free = true;
        cols(
          x,
          z,
          x + width - 1,
          z + depth - 1,
          (xx, zz) => {
            const y = world.top(xx, zz);
            if (!world.type(xx, y, zz)?.plantable || y !== world.ground(xx, zz)) {
              free = false;
            }
          }
        );
        if (!free) {
          continue;
        }
        if (p) {
          stamp(world, name, x, z, 0);
        } else {
          put(world, x, world.top(x, z) + 1, z, world.byName[name]);
        }
        placed++;
      }
      world.scatterResult = [placed, n];
    }
  ),
  clear: builtin(
    (world, o) => {
      form(o, 7);
      xyz(world, o, 1);
    },
    (world, o) => volume(...o.slice(1), (x, y, z) => put(world, x, y, z, 0))
  ),
  ...EDIT_OPS,
  pop: builtin(
    (world, o) => {
      form(o, 5);
      cell(world, o[1], o[2], o[3]);
      range(o[4], 1, 3, 'radius');
    },
    (world, o) => world.blast(o[1], o[2], o[3], o[4], 6)
  ),
  car: builtin(
    (world, o) => {
      form(o, 6);
      block(world, o[1]);
      rect(world, o, 2);
      if (world.life.length >= 12) {
        fail('life');
      }
    },
    (world, o) => world.life.push([...o])
  ),
  pet: builtin(
    (world, o) => {
      form(o, 4);
      block(world, o[1]);
      column(world, o[2], o[3]);
      if (world.life.length >= 12) {
        fail('life');
      }
    },
    (world, o) => world.life.push([...o])
  )
};
function shift(o, dx, dy, dz) {
  if (Object.hasOwn(SHIFTS, o[0])) return SHIFTS[o[0]](o, dx, dy, dz);
  const p = [...o], name = p[0];
  if (name === 'swap' && p.length === 3) return p;
  if (['box', 'line', 'clear', 'swap', 'mirror'].includes(name)) {
    const k = name === 'clear' ? 1 : ['swap', 'mirror'].includes(name) ? 3 : 2;
    if (name === 'mirror') p[2] += [dx, dy, dz][['x', 'y', 'z'].indexOf(p[1])];
    for (const j of [k, k + 3]) {
      p[j] += dx;
      p[j + 1] += dy;
      p[j + 2] += dz;
    }
  } else if (name === 'pop') {
    p[1] += dx;
    p[2] += dy;
    p[3] += dz;
  } else {
    if (dy) {
      fail('shift');
    }
    const k = 2;
    p[k] += dx;
    p[k + 1] += dz;
    if (['paint', 'cover', 'scatter', 'car'].includes(name)) {
      p[4] += dx;
      p[5] += dz;
    }
  }
  return p;
}
/** Expand repetition while retaining each submitted operation path. */
export function expand(ops, registry = OPS) {
  if (!Array.isArray(ops) || ops.length < 1 || ops.length > 200) {
    fail('arguments');
  }
  const out = [];
  const add = (operation, path) => {
    if (out.length >= 2000) {
      fail('expanded', out.length + 1);
    }
    const copy = [...operation];
    Object.defineProperty(copy, 'source', { value: path });
    out.push(copy);
  };
  for (let index = 0; index < ops.length; index++) {
    const o = ops[index];
    const path = 'ops[' + index + ']';
    try {
      if (!Array.isArray(o) || typeof o[0] !== 'string') {
        fail('form', o);
      }
      if (o[0] === 'rep') {
        form(o, 6);
        range(o[1], 1, 64, 'count');
        int(...o.slice(2, 5));
        if (!Array.isArray(o[5]) || !o[5].length) {
          fail('form', o);
        }
        for (let j = 0; j < o[5].length; j++) {
          const p = o[5][j];
          const childPath = path + '.ops[' + j + ']';
          try {
            if (!Array.isArray(p)) {
              fail('form', p);
            }
            if (p[0] === 'rep') fail('nested', p[0]);
            if (['kit', 'part', 'edit', 'cut', 'do', 'end', 'say'].includes(p[0])) {
              throw kitError(childPath + '.rep', 'rep');
            }
            if (!Object.hasOwn(registry, p[0])) {
              fail('op', p[0], Object.keys(registry));
            }
            if (['grow', 'auto', 'turn'].includes(p[0])) {
              fail('gameRep', p);
            }
            for (let n = 0; n < o[1]; n++) {
              add(shift(p, o[2] * n, o[3] * n, o[4] * n), childPath);
            }
          } catch (error) {
            throw opError(error, childPath, p);
          }
        }
        // Preserve repetition-major order for deterministic scatter and physics.
        const count = o[5].length;
        const total = o[1] * count;
        const tail = out.splice(- total);
        for (let n = 0; n < o[1]; n++) {
          for (let j = 0; j < count; j++) {
            out.push(tail[j * o[1] + n]);
          }
        }
      } else {
        if (!Object.hasOwn(registry, o[0])) {
          fail('op', o[0], [...Object.keys(registry), 'rep']);
        }
        for (const p of registry[o[0]].expand(o)) {
          add(p, path);
        }
      }
    } catch (error) {
      throw opError(error, path, o);
    }
  }
  return out;
}
