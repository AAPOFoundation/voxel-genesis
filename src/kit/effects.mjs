// Execute the thirteen data effects without filesystem or game-specific knowledge.
import { evaluate } from './expr.mjs';
import { OPS, expand } from '../core/ops.mjs';
import { PREFABS } from '../core/prefabs.mjs';
import { mix } from '../core/codec.mjs';
import { appendNote } from '../core/feed.mjs';
import { kitError } from '../kit-copy.mjs';

export const idOf = part => part.part.split('/')[1];
export const partsOf = (world, kind) => Object.values(world.kit?.parts ?? {})
  .filter(part => part.part.startsWith(kind + '/'));
export const players = world => {
  const names = partsOf(world, 'player').map(idOf).sort();
  return names.length ? names : ['you'];
};
/** A turn pack is any turn, bot, deck or advisor part. */
export function turnPack(world) {
  if (!world?.kit) return false;
  return ['turn', 'bot', 'deck', 'advisor']
    .some(kind => partsOf(world, kind).length);
}
export const matches = (place, tag) => !tag || place.tags.includes(tag) || place.id === tag;
export const conditions = (list, world, context = {}) =>
  list.every(value => evaluate(value, world, context));
export function contextFor(world, place, me = world.kit?.s.who ?? players(world)[0]) {
  const origin = world.kit?.s.place?.[world.kit.s.at?.[me]];
  const dist = place && origin ? Math.abs(place.at[0] - origin.at[0]) +
    Math.abs(place.at[1] - origin.at[1]) : 0;
  return { me, place: place ? { ...place, dist, here: Number(place === origin) } : {} };
}
export function colourOf(world, who) {
  const palette = ['tile', 'slate', 'amber', 'blue'];
  const used = new Set(partsOf(world, 'player').map(p => p.colour).filter(Boolean));
  const colours = {};
  for (const id of players(world)) {
    const stated = world.kit.parts['player/' + id]?.colour;
    colours[id] = stated || palette.find(colour => !used.has(colour));
    if (!colours[id] || Object.values(colours).filter(c => c === colours[id]).length > 1) {
      throw kitError('player/' + id + '.colour', 'colour');
    }
    used.add(colours[id]);
  }
  return colours[who] ?? 'tile';
}
const put = (world, x, y, z, block) => {
  if (world.get(x, y, z) !== block) world.set(x, y, z, block);
};
/** Repaint ownership as actual cells, including removal back to the board ground. */
function markPlace(world, place, token = false) {
  for (const board of partsOf(world, 'board').filter(p => matches(place, p.places))) {
    const [x1, z1, x2, z2] = place.at;
    const block = world.byName[place.owner ? colourOf(world, place.owner) : board.ground];
    if (board.mark === 'ring') {
      for (let x = x1; x <= x2; x++) for (const z of [z1, z2]) put(world, x, 0, z, block);
      for (let z = z1; z <= z2; z++) for (const x of [x1, x2]) put(world, x, 0, z, block);
    }
    if (board.mark === 'post' && token) {
      for (const y of [1, 2]) put(world, x1, y, z1, place.owner ? block : 0);
    }
  }
}
/** Fill board defaults and refresh derived values after each effect and primitive. */
export function refresh(world) {
  if (!world.kit) return;
  const s = world.kit.s;
  for (const board of partsOf(world, 'board')) {
    for (const place of Object.values(s.place ?? {}).filter(p => matches(p, board.places))) {
      for (const [key, value] of Object.entries(board.props)) {
        if (!Object.hasOwn(place, key)) place[key] = structuredClone(value);
      }
      for (const [key, expression] of Object.entries(board.calc)) {
        place[key] = evaluate(expression, world, contextFor(world, place));
      }
    }
  }
}
export function addStore(world, id, amount, me) {
  const part = world.kit.parts['store/' + id];
  if (!part) throw kitError('store/' + id, 'missing', 'store/' + id);
  const values = world.kit.s.store[id], key = part.per === 'game' ? 'game' : me;
  values[key] = Math.max(part.min, Math.min(part.max ?? Infinity,
    (values[key] ?? part.start) + Number(amount)));
}
export function roll(world, sides, engine) {
  const s = world.kit.s;
  s.rolls ??= 0;
  s.roll = 1 + Math.floor(engine.rng(mix(world.seed ^ 0x51ed, s.rolls++))() * sides);
  return s.roll;
}
function clear(world, place) {
  if (!place) throw kitError('place', 'target');
  const [x1, z1, x2, z2] = place.at;
  for (let x = x1; x <= x2; x++) for (let z = z1; z <= z2; z++) {
    for (let y = 1; y < world.h; y++) put(world, x, y, z, 0);
  }
}
function primitive(world, op, engine) {
  const handler = OPS[op[0]];
  handler.validate(world, op);
  handler.apply(world, op, engine);
}
/** Interpret nested lists with a shared bound so recursive decks fail atomically. */
export function effects(world, list, engine, context = {}, budget = { left: 4096, depth: 0 }) {
  if (++budget.depth > 32) throw kitError('then', 'effectcap');
  const s = world.kit.s, me = context.me ?? s.who ?? players(world)[0];
  const place = context.place?.id ? s.place?.[context.place.id] : undefined;
  const run = (items, next = context) => effects(world, items, engine, next, budget);
  for (const [op, target, value, other] of list) {
    if (--budget.left < 0) throw kitError('then', 'effectcap');
    refresh(world);
    const ctx = contextFor(world, place, me);
    const read = expression => evaluate(expression, world, ctx);
    if (op === 'note') appendNote(world, target);
    if (op === 'add') addStore(world, target, read(value), me);
    if (op === 'set') {
      if (!place) throw kitError(target, 'target');
      if (/^place\.(id|at|tags)$/.test(target)) throw kitError(target, 'fixed');
      place[target.slice(6)] = read(value);
      if (target === 'place.owner') markPlace(world, place);
    }
    if (op === 'flag') (s.flag ??= {})[target] = read(value);
    if (op === 'clear' || op === 'stamp') clear(world, place);
    if (op === 'stamp') {
      const [x1, z1, x2, z2] = place.at, [width, depth] = PREFABS[target].size;
      if (width > x2 - x1 + 1 || depth > z2 - z1 + 1) throw kitError('stamp', 'bounds');
      primitive(world, ['stamp', target, x1 + Math.floor((x2 - x1 + 1 - width) / 2),
        z1 + Math.floor((z2 - z1 + 1 - depth) / 2), 0], engine);
      markPlace(world, place);
    }
    if (op === 'ops') {
      const names = ['$x1', '$z1', '$x2', '$z2'];
      const replace = item => Array.isArray(item) ? item.map(replace) :
        names.includes(item) ? place?.at[names.indexOf(item)] : item;
      for (const item of expand(replace(target), OPS)) primitive(world, item, engine);
    }
    if (op === 'roll' || op === 'draw') {
      const kind = op === 'roll' ? 'dice' : 'deck';
      const part = world.kit.parts[kind + '/' + target];
      if (!part) throw kitError(kind + '/' + target, 'missing', kind + '/' + target);
      if (op === 'roll') roll(world, part.sides, engine);
      else {
        const cards = part.cards.filter(card => conditions(card.when, world, ctx));
        if (!cards.length) continue;
        let pick = roll(world, cards.reduce((sum, card) => sum + card.weight, 0), engine);
        const card = cards.find(card => (pick -= card.weight) <= 0);
        (s.last ??= {}).news = { deck: target, id: card.id, says: card.says };
        run(card.then);
      }
    }
    if (op === 'talk') {
      if (!world.kit.parts['talk/' + target]) {
        throw kitError('talk/' + target, 'missing', 'talk/' + target);
      }
      (s.queue ??= []).push(target);
    }
    if (op === 'go') {
      if (!place) throw kitError('place', 'target');
      s.at ??= {};
      const old = s.place[s.at[me]];
      if (old) {
        old.owner = '';
        markPlace(world, old, true);
      }
      s.at[me] = place.id;
      place.owner = me;
      markPlace(world, place, true);
    }
    if (op === 'if') run(read(target) ? value : other ?? []);
    if (op === 'each') {
      if (target === 'player') {
        for (const who of players(world)) run(value, { me: who, place });
      } else for (const item of Object.values(s.place ?? {}).filter(p => matches(p, target))) {
        run(value, { me, place: item });
      }
    }
  }
  refresh(world);
  budget.depth--;
}
