// Tell a tappable column and mark its place, using the server's bindingFor rule.
import { bindingFor } from '../src/kit/inputs.mjs';

const sand = [196, 148, 96];

/** True only when this column matches a click binding. The hit y is ignored. */
export function tappable(world, hit) {
  if (!hit) return false;
  return Boolean(bindingFor(world, { click: [hit.x, 0, hit.z] }));
}

function bound(world, place) {
  const at = place.at;
  if (!Array.isArray(at) || at.length < 4) return false;
  const [x1, z1, x2, z2] = at;
  for (let x = x1; x <= x2; x++) {
    for (let z = z1; z <= z2; z++) {
      const found = bindingFor(world, { click: [x, 0, z] });
      if (found?.place === place) return true;
    }
  }
  return false;
}

/** Low tiles on bound places. Reduced motion keeps the same marks at any time. */
export function tapMarks(world, { reduced = false, time = 0 } = {}) {
  const wave = reduced ? 0 : Math.sin(time * 2.2);
  const lift = wave * 0.015;
  const red = sand[0] + Math.round(wave * 16);
  const marks = [];
  for (const place of Object.values(world?.kit?.s?.place ?? {})) {
    if (!bound(world, place)) continue;
    const [x1, z1, x2, z2] = place.at;
    const x = (x1 + x2 + 1) / 2;
    const z = (z1 + z2 + 1) / 2;
    const h = 0.05;
    const top = typeof world.top === 'function' ? world.top(x | 0, z | 0) : -1;
    marks.push({
      x, z, h,
      y: top + 1 + h / 2 + 0.02 + lift,
      w: Math.min(0.7, (x2 - x1 + 1) * 0.45),
      d: Math.min(0.7, (z2 - z1 + 1) * 0.45),
      rgb: [red, sand[1], sand[2]]
    });
  }
  return marks;
}
