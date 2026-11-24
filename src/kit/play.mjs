// Turn progression and reports compose the independent play parts.
import { evaluate } from './expr.mjs';
import { sorted } from './canon.mjs';
import { effects, partsOf, players, idOf, refresh, contextFor, addStore,
  colourOf, conditions, turnPack } from './effects.mjs';
import { advice, botMove, moveIssue, costs } from './advise.mjs';
import { kitError, playError, playText } from '../kit-copy.mjs';
import { triggerTalks } from './story.mjs';

function order(world) {
  const stated = partsOf(world, 'turn')[0]?.order ?? [];
  return stated.length ? stated : players(world);
}
export function scores(world) {
  const goal = partsOf(world, 'goal').find(part => part.score !== null);
  return Object.fromEntries(players(world).map(me => [me,
    goal ? evaluate(goal.score, world, { me }) : 0]));
}
/** Refresh optional play state without creating any state for unrelated sections. */
export function playStep(world) {
  if (!world.kit) return;
  refresh(world);
  const s = world.kit.s, turn = partsOf(world, 'turn')[0];
  if (turn) {
    s.turn ??= 1;
    s.who ??= order(world)[0];
    s.moves ??= turn.moves;
  }
  for (const me of players(world)) colourOf(world, me);
  if (!s.over) for (const goal of partsOf(world, 'goal')) {
    if (!goal.when.length || !conditions(goal.when, world)) continue;
    if (goal.ends) s.over = { goal: idOf(goal), winner: goal.win ? s.who ?? players(world)[0] : '',
      scores: scores(world) };
  }
  world.kit.s = sorted(s);
}
function action(world, op, engine) {
  const issue = moveIssue(world, op);
  if (issue) throw playError((op.source ?? 'ops[0]') + '.do', issue);
  const s = world.kit.s, part = world.kit.parts['action/' + op[1]], me = s.who ?? players(world)[0];
  const ctx = contextFor(world, s.place?.[op[2]], me);
  for (const [id, cost] of Object.entries(costs(world, part, ctx))) addStore(world, id, -cost, me);
  effects(world, part.then, engine, ctx);
  triggerTalks(world, 'action/' + op[1]);
  if (partsOf(world, 'turn')[0]?.moves) s.moves--;
  const last = s.last ??= {};
  last.action = op[1];
  const uses = last.uses ??= {};
  uses[me + '/' + op[1]] = (uses[me + '/' + op[1]] ?? 0) + 1;
}
function end(world, engine) {
  const s = world.kit.s, turn = partsOf(world, 'turn')[0];
  if (s.over) throw playError('end', { key: 'over' });
  const names = order(world), start = s.who ?? names[0];
  s.last = { bots: [], uses: {} };
  const finish = () => effects(world, turn?.end ?? [], engine, { me: s.who ?? start });
  finish();
  let index = names.indexOf(start), count = 0;
  do {
    index = (index + 1) % names.length;
    if (index === 0) {
      for (const deck of partsOf(world, 'deck').filter(part => part.draw === 'round')) {
        effects(world, [['draw', idOf(deck)]], engine);
      }
      if (turn?.last && s.turn >= turn.last) {
        const totals = scores(world), best = Math.max(...Object.values(totals));
        const winners = Object.keys(totals).filter(id => totals[id] === best);
        s.over = { scores: totals, winner: winners.length === 1 ? winners[0] : '' };
        s.who = names[0];
        s.moves = 0;
        return;
      }
      s.turn = (s.turn ?? 1) + 1;
    }
    s.who = names[index];
    s.moves = turn?.moves ?? 0;
    const player = world.kit.parts['player/' + s.who];
    if (!player?.bot) break;
    const bot = world.kit.parts['bot/' + player.bot];
    if (!bot) throw kitError('player/' + s.who + '.bot', 'missing', 'bot/' + player.bot);
    for (let move = 0; move < bot.moves; move++) {
      const next = botMove(world, bot, s.who);
      if (!next) break;
      action(world, next.op, engine);
      s.last.bots.push({ who: s.who, text: next.text, op: next.op });
    }
    finish();
  } while (++count < names.length);
}
/** Apply one play op. The caller owns atomic cloning and final settlement. */
export function playOp(world, op, engine) {
  world.kit ??= { v: 1, parts: {}, s: {} };
  if (op[0] === 'do') action(world, op, engine);
  else end(world, engine);
}
export function playReport(world) {
  if (!world?.kit || !['store', 'player', 'board', 'action', 'turn', 'goal', 'dice', 'deck']
    .some(kind => partsOf(world, kind).length)) return '';
  const s = world.kit.s, turn = partsOf(world, 'turn')[0];
  const rows = players(world).map(me => ({ me,
    stores: partsOf(world, 'store').filter(part => part.show).map(part =>
      [idOf(part), evaluate(idOf(part), world, { me })]),
    score: partsOf(world, 'goal').some(part => part.score !== null) ? scores(world)[me] : null }));
  return playText({ rows, turn, s, moves: advice(world), pack: turnPack(world) });
}
