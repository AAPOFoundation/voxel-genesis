// Produce bounded text views of the canonical world.
import { bytes } from '../budget.mjs';
import { failure } from '../errors.mjs';
import { C, mapHead, infoText, legendText, inputRow } from '../copy.mjs';
import { blocksOf } from './palette.mjs';
import { hash } from './codec.mjs';
import { packOf } from './rules.mjs';
import { kitView } from '../kit/view.mjs';
/** Render a bounded top, height, side or information view. */
export function look(
  world,
  { view = 'top', at = [0, 0, world?.w - 1, world?.d - 1], z = 0, of } =
  {},
  viewer = null,
  files = null,
  input = null
) {
  if (view === 'input') {
    const after = of === undefined ? input?.cursor ?? 0 : Number(of);
    if (!Number.isSafeInteger(after) || after < 0) throw failure('arguments');
    let text = '';
    for (const row of input?.records ?? []) {
      if (row.n <= after) continue;
      const next = text + (text ? '\n' : '') + inputRow(row);
      if (bytes(next) > 600) break;
      text = next;
      input.seen(row.n);
    }
    return text;
  }
  if (view === 'kit') return kitView(world, of, files);
  if (view === 'town') {
    if (!packOf(world).view) {
      throw failure('noGame');
    }
    return packOf(world).view(world);
  }
  const [a, b, c, d] = at;
  if (
    ![a, c].every(x => Number.isInteger(x) && x >= 0 && x < world.w) ||
    ![b, d, z].every(v => Number.isInteger(v) && v >= 0 && v < world.d)
  ) {
    throw failure('bounds');
  }
  const x1 = Math.min(a, c);
  const x2 = Math.max(a, c);
  const z1 = Math.min(b, d);
  const z2 = Math.max(b, d);
  const lines = [mapHead(view, world.w, world.d, world.rev, hash(world))];
  if (view === 'info') {
    const counts = blocksOf(world).map(
      (b, i) => b.name + ' ' + world.cells.reduce((n, v) => n + (v === i + 1), 0)
    ).join(', ');
    return lines[0] + '\n' + infoText(world, counts, viewer);
  }
  const glyph = (x, y, z) => world.types[world.get(x, y, z)]?.glyph ||
  ' ';
  if (view === 'side') {
    for (let y = world.h - 1; y >= 0; y--) {
      let s = '';
      for (let x = x1; x <= x2; x++) {
        s += glyph(x, y, z);
      }
      lines.push(s);
    }
  } else {
    for (let zz = z1; zz <= z2; zz++) {
      let s = '';
      for (let x = x1; x <= x2; x++) {
        const y = world.top(x, zz);
        s += view === 'height' ? (y < 0 ? ' ': y.toString(32)):
        glyph(x, y, zz);
      }
      lines.push(s);
    }
  }
  const footer = legendText(blocksOf(world));
  let body = '';
  for (const line of lines) {
    if (bytes(body + '\n' + line + '\n' + footer) > 3000) {
      body += '\n' + C.clipped;
      break;
    }
    body += (body ? '\n': '') + line;
  }
  return body + '\n' + footer;
}
