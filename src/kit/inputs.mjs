// Match player clicks and keys to input parts, and run the `in` op that replays them.
import { contextFor, effects, matches, partsOf } from './effects.mjs';
import { kitError } from '../kit-copy.mjs';

const KEYS = ['up', 'left', 'down', 'right', 'space'];
const inside = (place, x, z) => x >= place.at[0] && x <= place.at[2] &&
  z >= place.at[1] && z <= place.at[3];

/** Refuse input fields that cannot fit their trigger, as other kinds refuse bad fields. */
export function checkInput(part, path) {
  if (part.on === 'key' && !KEYS.includes(part.key)) throw kitError(path + '.key', 'inputKey');
  if (part.on === 'click' && part.key) throw kitError(path + '.key', 'inputOn');
  if (part.on === 'key' && part.at) throw kitError(path + '.at', 'inputOn');
}

/** The first input part matching one click or key, with the clicked place, or null. */
export function bindingFor(world, value) {
  if (!world?.kit || !value) return null;
  const places = Object.values(world.kit.s.place ?? {});
  for (const part of partsOf(world, 'input')) {
    if (value.key !== undefined) {
      if (part.on === 'key' && part.key === value.key) return { part, place: undefined };
    } else if (part.on === 'click') {
      const [x, , z] = value.click;
      const place = places.find(item => matches(item, part.at) && inside(item, x, z));
      if (place) return { part, place };
    }
  }
  return null;
}

/** The logged op for a bound input value. */
export const inOp = value => value.key !== undefined ? ['in', 'key', value.key] :
  ['in', 'click', ...value.click];

function valueOf(world, op) {
  if (op[1] === 'key' && op.length === 3 && KEYS.includes(op[2])) return { key: op[2] };
  const click = op.slice(2);
  if (op[1] === 'click' && op.length === 5 && click.every(Number.isInteger) &&
    world.inside(...click)) return { click };
  return null;
}

/** Name what to do for a refused op; the refusal keeps the `in` path. */
function refusal(world, op, path) {
  if (op[1] === 'key' && op.length === 3) return kitError(path, 'inKey');
  if (op[1] !== 'click' || op.length !== 5 || !op.slice(2).every(Number.isInteger)) {
    return kitError(path, 'inShape');
  }
  return kitError(path, 'outWorld', 'x 0 to ' + (world.w - 1) + ', y 0 to ' +
    (world.h - 1) + ', z 0 to ' + (world.d - 1));
}

/** Pick the unbound-click refusal: no places, outside every place, or the old line. */
function unbound(world, op, path) {
  const clicks = partsOf(world, 'input').filter(part => part.on === 'click');
  if (op[1] !== 'click' || !clicks.length) return kitError(path, 'unbound');
  const places = Object.values(world.kit.s.place ?? {});
  if (!places.length) return kitError(path, 'unplaced');
  const [x, , z] = op.slice(2);
  if (places.some(place => inside(place, x, z))) return kitError(path, 'unbound');
  for (const part of clicks) {
    const place = places.find(item => matches(item, part.at));
    if (place) return kitError(path, 'outPlace', place.id + ' at ' + place.at.join(','));
  }
  return kitError(path, 'unbound');
}

/** Registered beside the base ops, as the mover ops are: one hash for live play and replay. */
export const INPUT_OPS = {
  in: {
    expand: op => [op],
    validate(world, op) {
      const path = (op.source ?? 'ops[0]') + '.in';
      const value = valueOf(world, op);
      if (!value) throw refusal(world, op, path);
      if (!bindingFor(world, value)) throw unbound(world, op, path);
    },
    apply(world, op, engine) {
      const { part, place } = bindingFor(world, valueOf(world, op));
      effects(world, part.then, engine, contextFor(world, place));
    }
  }
};
