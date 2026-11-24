// Share legal, affordable target selection between advice and scripted players.
import { evaluate } from './expr.mjs';
import { partsOf, idOf, contextFor, conditions, matches, players,
  turnPack } from './effects.mjs';
import { bindingFor } from './inputs.mjs';
import { moveText, playIssue, KIT_COPY as C } from '../kit-copy.mjs';

const distance = (a, b) => {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 0; i < a.length; i++) {
    const next = [i + 1];
    for (let j = 0; j < b.length; j++) {
      next.push(Math.min(next[j] + 1, row[j + 1] + 1, row[j] + Number(a[i] !== b[j])));
    }
    row = next;
  }
  return row[b.length];
};
export function costs(world, action, context) {
  return Object.fromEntries(Object.entries(action.cost).map(([id, value]) =>
    [id, Math.max(0, evaluate(value, world, context))]));
}
function maxFix(world, me, id) {
  if (turnPack(world)) return C.maxEnd;
  const next = legalMoves(world, me).find(move => move.op[1] !== id);
  return next ? C.maxTry + next.op[1] : C.maxWait;
}
/** The in op that really fires this input (first cell or key it wins), or null. */
function fireOp(world, input) {
  const wins = value => bindingFor(world, value)?.part.part === input.part;
  if (input.on === 'key') {
    return wins({ key: input.key }) ? JSON.stringify(['in', 'key', input.key]) : null;
  }
  for (const p of Object.values(world.kit.s.place ?? {}).filter(p => matches(p, input.at))) {
    for (let x = p.at[0]; x <= p.at[2]; x++) for (let z = p.at[1]; z <= p.at[3]; z++) {
      if (wins({ click: [x, 0, z] })) return JSON.stringify(['in', 'click', x, 0, z]);
    }
  }
  return null;
}
/** Return the first precise refusal, or null for a legal affordable action. */
export function moveIssue(world, op, me = world.kit?.s.who ?? players(world)[0],
  deep = true) {
  const s = world.kit?.s ?? {}, parts = world.kit?.parts ?? {};
  if (s.over) return playIssue('over');
  const action = parts['action/' + op[1]];
  if (!action) {
    const input = parts['input/' + op[1]];
    if (input) return playIssue('input', fireOp(world, input));
    const names = partsOf(world, 'action').map(idOf);
    names.sort((a, b) => distance(a, String(op[1])) - distance(b, String(op[1])));
    return playIssue('action', names[0] ?? 'part');
  }
  const turn = partsOf(world, 'turn')[0];
  if (turn?.moves && s.moves <= 0) return playIssue('moves');
  if (action.max && (s.last?.uses?.[me + '/' + op[1]] ?? 0) >= action.max) {
    const n = s.last.uses[me + '/' + op[1]];
    const fix = deep ? maxFix(world, me, String(op[1])) : C.maxWait;
    return playIssue('max', { id: String(op[1]), n, max: action.max, fix });
  }
  const place = s.place?.[op[2]], places = Object.values(s.place ?? {});
  if (op[2] !== undefined && !place || action.on && places.length && !place ||
    place && action.on && action.on !== 'place' && !matches(place, action.on)) {
    return playIssue('target');
  }
  const ctx = contextFor(world, place, me);
  for (const [i, value] of action.when.entries()) {
    if (!evaluate(value, world, ctx)) {
      return playIssue('condition', { i, value,
        current: evaluate(Array.isArray(value) ? value[1] : value, world, ctx) });
    }
  }
  for (const [id, cost] of Object.entries(costs(world, action, ctx))) {
    const store = parts['store/' + id];
    if (!store) return playIssue('store', id);
    const have = s.store[id]?.[store.per === 'game' ? 'game' : me] ?? 0;
    if (have - cost < store.min) return playIssue('cost', { id, cost, have });
  }
  return null;
}
/** Enumerate stable candidates without changing run state. */
function legalMoves(world, me = world.kit?.s.who ?? players(world)[0]) {
  const result = [], places = Object.values(world.kit?.s.place ?? {});
  for (const action of partsOf(world, 'action')) {
    const targets = action.on && places.length ? places : [null];
    for (const place of targets) {
      const op = ['do', idOf(action), ...(place ? [place.id] : [])];
      if (moveIssue(world, op, me, false)) continue;
      const ctx = contextFor(world, place, me), price = costs(world, action, ctx);
      const replacing = place && action.then.some(effect => effect[0] === 'stamp') &&
        evaluate('built.' + place.id, world);
      result.push({ op, cost: price, value: evaluate(action.value, world, ctx),
        text: moveText(op, price, replacing), context: ctx });
    }
  }
  return result;
}
export function advice(world) {
  return legalMoves(world).filter(move => move.value > 0).sort((a, b) => b.value - a.value ||
    Object.values(a.cost).reduce((x, y) => x + y, 0) -
    Object.values(b.cost).reduce((x, y) => x + y, 0) ||
    a.op.join('/').localeCompare(b.op.join('/')))
    .slice(0, partsOf(world, 'advisor')[0]?.top ?? 5);
}
/** Take the first rule with a legal target, then its stable first/min/max selection. */
export function botMove(world, bot, me) {
  const moves = legalMoves(world, me);
  for (const rule of bot.rules) {
    const chosen = moves.filter(move => move.op[1] === rule.act &&
      conditions(rule.when, world, move.context));
    if (rule.pick !== 'first') chosen.sort((a, b) =>
      (evaluate(rule.by, world, a.context) - evaluate(rule.by, world, b.context)) *
      (rule.pick === 'min' ? 1 : -1));
    if (chosen.length) return chosen[0];
  }
  return null;
}
