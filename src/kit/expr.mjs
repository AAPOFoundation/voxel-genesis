// Validate prefix expressions and effects, and evaluate read-only world facts.
import { OPERATORS, EFFECTS } from './kinds.mjs';
import { kitError, kitWarning } from '../kit-copy.mjs';
import { PREFABS } from '../core/prefabs.mjs';
import { packOf } from '../core/rules.mjs';
import { OPS, expand } from '../core/ops.mjs';
import { players } from './effects.mjs';
import { validateNote } from '../core/feed.mjs';
const infix = value => typeof value === 'string' && /[<>=!+*/%]|\s/.test(value);
/** Validate an expression without interpreting data as executable code. */
export function validateExpr(value, path = 'expr') {
  if (infix(value)) throw kitError(path, 'infix');
  if (Number.isSafeInteger(value) || typeof value === 'string') return;
  if (!Array.isArray(value) || !OPERATORS.includes(value[0]) ||
    value.length !== (value[0] === 'not' ? 2 : 3)) throw kitError(path, 'expression');
  value.slice(1).forEach((item, index) => validateExpr(item, path + '.' + (index + 1)));
}
/** Validate effects now; the play package supplies execution later. */
export function validateEffects(effects, path = 'then') {
  const lengths = { add: [3], set: [3], flag: [3], stamp: [2], clear: [1], ops: [2],
    roll: [2], draw: [2], talk: [2], go: [1], if: [3, 4], each: [3], note: [2] };
  effects.forEach((effect, index) => {
    const at = path + '.' + index;
    if (!Array.isArray(effect) || !EFFECTS.includes(effect[0]) ||
      !lengths[effect[0]].includes(effect.length)) throw kitError(at, 'effect');
    const [op, target, value, otherwise] = effect;
    if (op === 'note') validateNote(target, at);
    if (['add', 'set', 'flag', 'stamp', 'roll', 'draw', 'talk', 'each'].includes(op) &&
      typeof target !== 'string') throw kitError(at + '.1', 'type', 'a name');
    if (op === 'stamp' && !Object.hasOwn(PREFABS, target)) throw kitError(at, 'prefab');
    if (op === 'set' && !/^place\.[a-z][a-z0-9-]*$/.test(target)) {
      throw kitError(at + '.1', 'type', 'place.PROP');
    }
    if (['add', 'set', 'flag'].includes(op)) validateExpr(value, at + '.2');
    if (op === 'if') {
      validateExpr(target, at + '.1');
      if (!Array.isArray(value) || otherwise !== undefined && !Array.isArray(otherwise)) {
        throw kitError(at, 'effect');
      }
      validateEffects(value, at + '.2');
      validateEffects(otherwise ?? [], at + '.3');
    }
    if (op === 'each') {
      if (!Array.isArray(value)) throw kitError(at, 'effect');
      validateEffects(value, at + '.2');
    }
    if (op === 'ops' && (!Array.isArray(target) || target.some(item => !Array.isArray(item)))) {
      throw kitError(at, 'effect');
    }
    if (op === 'ops' && target.length) {
      try {
        for (const item of expand(target, OPS)) {
          if (item[0] === 'stamp' && !Object.hasOwn(PREFABS, item[1])) {
            throw kitError(at, 'prefab');
          }
        }
      } catch (error) {
        if (error.issue) throw error;
        throw kitError(at, 'scene');
      }
    }
  });
}
const own = (object, key) => object && Object.hasOwn(object, key);
/** Resolve a name from optional state; absent sections contribute zero and one warning. */
export function readName(name, world, context = {}, warnings = []) {
  const s = world.kit?.s ?? {};
  const me = context.me ?? s.who ?? players(world)[0];
  const place = context.place ?? {};
  if (name === '') return '';
  if (name === 'me') return me;
  if (own(context, name)) return context[name];
  if (['turn', 'moves', 'roll'].includes(name) && own(s, name)) return s[name];
  if (own(s.store, name)) return s.store[name][me] ?? s.store[name].game ?? 0;
  const [head, tail, prop] = name.split('.');
  if (own(s.store, tail) && own(s.store[tail], head)) return s.store[tail][head];
  if (head === 'mover' && own(world.movers, tail)) {
    const mover = world.movers[tail];
    if (prop === 'x' || prop === 'z') return mover[prop];
    if (prop === 'place') return Object.values(s.place ?? {}).find(p => {
      const [x1, z1, x2, z2] = p.at;
      return mover.x >= x1 && mover.x <= x2 && mover.z >= z1 && mover.z <= z2;
    })?.id ?? '';
  }
  if (head === 'place' && own(place, tail)) return place[tail];
  if (head === 'flag' && own(s.flag, tail)) return s.flag[tail];
  if (head === 'beat' && own(s.beat, tail)) return Number(Boolean(s.beat[tail]));
  if (head === 'blocks' && own(world.byName, tail)) {
    return world.cells.reduce((n, block) => n + Number(block === world.byName[tail]), 0);
  }
  const places = Object.values(s.place ?? {});
  if (head === 'my' || head === 'all') {
    const chosen = places.filter(p => head === 'all' || p.owner === me);
    if (tail === 'count') return prop ? chosen.filter(p => p[prop]).length : chosen.length;
    if (tail === 'sum') return chosen.reduce((total, p) => total + (Number(p[prop]) || 0), 0);
  }
  if (head === 'built' && own(s.place, tail)) {
    const [x1, z1, x2, z2] = s.place[tail].at;
    let count = 0;
    for (let x = x1; x <= x2; x++) for (let z = z1; z <= z2; z++) {
      for (let y = 1; y < world.h; y++) {
        if (world.get(x, y, z) && !world.type(x, y, z)?.liquid) count++;
      }
    }
    return count;
  }
  if (head === 'town') {
    const facts = context.town ?? (world.game ? packOf(world).facts?.(world) : null);
    if (own(facts, tail)) return facts[tail];
  }
  if (world.kit?.parts['player/' + name]) return name;
  const warning = kitWarning(name, 'name');
  if (!warnings.includes(warning)) warnings.push(warning);
  return 0;
}
/** Evaluate the sixteen deterministic prefix operators. */
export function evaluate(value, world, context = {}, warnings = []) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return readName(value, world, context, warnings);
  validateExpr(value);
  const [op, left, right] = value;
  const a = evaluate(left, world, context, warnings);
  const b = op === 'not' ? 0 : evaluate(right, world, context, warnings);
  switch (op) {
    case '=': return Number(a === b);
    case '!=': return Number(a !== b);
    case '<': return Number(a < b);
    case '<=': return Number(a <= b);
    case '>': return Number(a > b);
    case '>=': return Number(a >= b);
    case 'and': return Number(Boolean(a && b));
    case 'or': return Number(Boolean(a || b));
    case 'not': return Number(!a);
    case '+': return Number(a) + Number(b);
    case '-': return Number(a) - Number(b);
    case '*': return Number(a) * Number(b);
    case '/': return b ? Math.floor(a / b) : 0;
    case '%': return b ? a % b : 0;
    case 'min': return Math.min(a, b);
    case 'max': return Math.max(a, b);
  }
}
