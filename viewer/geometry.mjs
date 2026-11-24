// Geometry helpers are pure and can be measured without a GL context.
export const faces = [
  {
    step: [0, 1, 0],
    axis: 0,
    corners: [[- 1, 1, - 1], [1, 1, - 1], [1, 1, 1], [- 1, 1, 1]]
  },
  {
    step: [1, 0, 0],
    axis: 1,
    corners: [[1, - 1, - 1], [1, - 1, 1], [1, 1, 1], [1, 1, - 1]]
  },
  {
    step: [- 1, 0, 0],
    axis: - 1,
    corners: [[- 1, - 1, 1], [- 1, - 1, - 1], [- 1, 1, - 1], [- 1, 1, 1]]
  },
  {
    step: [0, 0, 1],
    axis: 2,
    corners: [[- 1, - 1, 1], [1, - 1, 1], [1, 1, 1], [- 1, 1, 1]]
  },
  {
    step: [0, 0, - 1],
    axis: - 2,
    corners: [[1, - 1, - 1], [- 1, - 1, - 1], [- 1, 1, - 1], [1, 1, - 1]]
  }
];
const indices = [0, 1, 2, 0, 2, 3];
class Vertices {
  constructor(capacity = 4096) {
    this.data = new Float32Array(capacity);
    this.length = 0;
  }
  reserve(n) {
    if (this.length + n > this.data.length) {
      const next = new Float32Array(Math.max(this.length + n, this.data.length * 2));
      next.set(this.data);
      this.data = next;
    }
  }
  finish() {
    return this.data.subarray(0, this.length);
  }
}
function quad(out, b, f, shade = 1, owner = - 1) {
  out.reserve(48);
  const a = out.data;
  const hw = b.w / 2;
  const hh = b.h / 2;
  const hd = b.d / 2;
  const red = b.rgb[0] * shade / 255;
  const green = b.rgb[1] * shade / 255;
  const blue = b.rgb[2] * shade / 255;
  let at = out.length;
  for (const i of indices) {
    const c = f.corners[i];
    a[at++] = b.x + c[0] * hw;
    a[at++] = b.y + c[1] * hh;
    a[at++] = b.z + c[2] * hd;
    a[at++] = red;
    a[at++] = green;
    a[at++] = blue;
    a[at++] = f.axis;
    a[at++] = owner;
  }
  out.length = at;
}
function box(out, b, owner = - 1) {
  for (const f of faces) {
    quad(out, b, f, 1, owner);
  }
}
function cell(out, w, x, y, z) {
  const t = w.type(x, y, z);
  if (!t) {
    return;
  }
  const size = t.size || [1, t.liquid?.85: 1, 1];
  const owner = (y * w.d + z) * w.w + x;
  const b = {
    x: x +.5,
    y: y + size[1] / 2,
    z: z +.5,
    w: size[0],
    h: size[1],
    d: size[2],
    rgb: t.rgb
  };
  const shadow = !t.size && (w.solid(x - 1, y + 1, z) || w.solid(x, y + 1, z - 1))?.86:
  1;
  for (const f of faces) {
    const [dx, dy, dz] = f.step;
    const q = w.type(x + dx, y + dy, z + dz);
    if (!t.size && q && !q.liquid && !q.size) {
      continue;
    }
    quad(out, b, f, f.axis === 0 ? shadow: 1, owner);
    if (t.windows && f.axis !== 0) {
      for (let k = 0; k < 2; k++) {
        const side = Math.abs(f.axis);
        const on = (x * 7 + y * 13 + z * 5 + side * 3 + k) % 5 < 2;
        const u = (k?.58:.16) +.13;
        const win = {
          x: x +.5,
          y: y +.49,
          z: z +.5,
          w:.26,
          h:.42,
          d:.26,
          rgb: on ? [253, 184, 23]: t.rgb
        };
        if (side === 1) {
          win.x = x + (f.axis > 0 ? 1.002: -.002);
          win.z = z + u;
          win.w =.004;
        } else {
          win.z = z + (f.axis > 0 ? 1.002: -.002);
          win.x = x + u;
          win.d =.004;
        }
        quad(out, win, f, on ? 1:.6, owner);
      }
    }
  }
  if (t.details && !w.get(x, y + 1, z)) {
    for (const d of t.details) {
      if (
        d.every && (((x * 73856093) ^ (z * 19349663) ^ ((d.seed || 0) * 83492791)) >>> 0) % d.every
      ) {
        continue;
      }
      const detail = {
        x: x + d.at[0],
        y: y + size[1] + d.at[1] + d.size[1] / 2,
        z: z + d.at[2],
        w: d.size[0],
        h: d.size[1],
        d: d.size[2],
        rgb: d.rgb
      };
      for (const f of faces) {
        quad(out, detail, f, f.axis === 0 ? shadow: 1, owner);
      }
    }
  }
}
/** Build visible static faces, or only the requested changed cells. */
export function buildMesh(world, cells = null) {
  const out = new Vertices(
    Math.max(4096, cells ? cells.size * 256: world.cells.length * 16)
  );
  if (cells) {
    for (const i of cells) {
      const x = i % world.w;
      const z = Math.floor(i / world.w) % world.d;
      const y = Math.floor(i / (world.w * world.d));
      cell(out, world, x, y, z);
    }
  } else {
    let i = 0;
    for (let y = 0; y < world.h; y++) {
      for (let z = 0; z < world.d; z++) {
        for (let x = 0; x < world.w; x++, i++) {
          if (world.cells[i]) {
            cell(out, world, x, y, z);
          }
        }
      }
    }
  }
  return out.finish();
}
/** Present water contact as a short, slow sink and shrink shared by both renderers. */
export function visibleBody(body) {
  const fade = body.life ? Math.min(1, (body.life - body.age) / .4) : 1;
  if (!body.waterCell) return { ...body, size: body.size * fade, life: 0 };
  const progress = Math.min(1, (body.age - body.wetAge) / .3);
  return { ...body, life: 0, size: body.size * (1 - progress),
    y: body.waterCell[1] + .85 + body.size / 2 - .35 * progress };
}
/** Build transient body, agent and extra geometry. */
export function buildDynamicMesh(world, { reduced = false, extras = [] } = {}) {
  const out = new Vertices();
  if (!reduced) {
    for (const body of world.bodies) {
      const b = visibleBody(body);
      const size = b.size;
      if (size > 0) {
        box(
          out,
          {
            x: b.x,
            y: b.y,
            z: b.z,
            w: size,
            h: size,
            d: size,
            rgb: world.types[b.type].rgb
          }
        );
      }
    }
  }
  for (const a of world.agents) {
    for (const b of a.boxes(world)) {
      box(out, b);
    }
  }
  for (const b of extras) {
    box(out, b);
  }
  return out.finish();
}
