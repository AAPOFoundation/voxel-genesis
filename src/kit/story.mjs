// Pure story, talk and derived presentation. Timing never enters the world state.
import { partsOf, idOf, effects, conditions, colourOf } from './effects.mjs';
import { evaluate } from './expr.mjs';
import { scores } from './play.mjs';
import { sorted } from './canon.mjs';
import { kitError, storyText, talkText, panelText, KIT_COPY as C } from '../kit-copy.mjs';

const notice = world => world.kitNotice ??= { story: false, talk: false, says: [] };
const current = world => Object.entries(world.kit?.s.talk ?? {})
  .find(([, state]) => state === 'open')?.[0];
export function triggerTalks(world, trigger) {
  for (const part of partsOf(world, 'talk').filter(p => p.on === trigger)) {
    const id = idOf(part), s = world.kit.s;
    if (trigger.startsWith('action/') || !s.talk?.[id]) {
      (s.queue ??= []).push(id);
      (s.talk ??= {})[id] ??= 'queued';
    }
  }
}
function openNext(world) {
  const s = world.kit.s;
  if (current(world)) return;
  while (s.queue?.length) {
    const id = s.queue.shift();
    if (!world.kit.parts['talk/' + id]) continue;
    (s.talk ??= {})[id] = 'open';
    notice(world).talk = true;
    break;
  }
  if (!s.queue?.length) delete s.queue;
}
/** A completed beat stays complete until its identity is cut. */
export function storyStep(world, engine) {
  if (!world.kit) return;
  const s = world.kit.s;
  triggerTalks(world, 'start');
  let count = 0, changed = true;
  while (changed && count < 16) {
    changed = false;
    for (const beat of partsOf(world, 'beat')) {
      const id = idOf(beat);
      if (s.beat?.[id] || beat.after && !s.beat?.[beat.after]) continue;
      if (!Object.hasOwn(s.beat ?? {}, id)) notice(world).story = true;
      (s.beat ??= {})[id] = 0;
      if (!conditions(beat.when, world)) continue;
      s.beat[id] = 1;
      const event = notice(world);
      event.story = true;
      if (beat.says) event.says.push(beat.says);
      effects(world, beat.then, engine);
      triggerTalks(world, 'beat/' + id);
      changed = true;
      if (++count === 16) break;
    }
  }
  // Talks attached after their beat has finished still see the present world.
  for (const beat of partsOf(world, 'beat')) {
    if (s.beat?.[idOf(beat)]) triggerTalks(world, 'beat/' + idOf(beat));
  }
  openNext(world);
  world.kit.s = sorted(s);
}
export function say(world, op, engine) {
  const id = current(world), part = world.kit?.parts['talk/' + id];
  const path = (op.source ?? 'ops[0]') + '.say';
  if (!part) throw kitError(path, 'silent');
  const ask = part.asks.find(ask => ask.id === op[1]);
  if (part.asks.length && !ask || !part.asks.length && op[1] !== undefined) {
    throw kitError(path, 'choice', part.asks.map(ask => ask.id).join('|'));
  }
  world.kit.s.talk[id] = 'done';
  notice(world).talk = true;
  if (ask) {
    effects(world, ask.then, engine);
    if (ask.next) effects(world, [['talk', ask.next]], engine);
  }
}
/** Select a mood without writing musical state, even when its tune is absent. */
export function moodOf(world) {
  const mood = partsOf(world, 'mood').filter(p => conditions(p.when, world))
    .sort((a, b) => b.rank - a.rank || a.part.localeCompare(b.part))[0];
  const tune = world?.kit?.parts['tune/' + mood?.tune];
  return tune ? { id: idOf(mood), tune } : null;
}
export function storyOf(world) {
  const beats = partsOf(world, 'beat'), s = world?.kit?.s ?? {};
  const open = beats.find(p => !s.beat?.[idOf(p)] && (!p.after || s.beat?.[p.after]));
  return { done: beats.filter(p => s.beat?.[idOf(p)]).length, total: beats.length,
    objective: open ? open.goal || idOf(open) : '',
    completed: beats.filter(p => s.beat?.[idOf(p)]).map(idOf) };
}
/** Return plain data suitable for DOM text nodes and replay comparisons. */
export function panelOf(world) {
  const s = world?.kit?.s ?? {}, story = storyOf(world), id = current(world);
  const talk = world?.kit?.parts['talk/' + id];
  const voice = world?.kit?.parts['voice/' + talk?.voice];
  const turn = partsOf(world, 'turn')[0];
  const totals = scores(world);
  const end = s.over ? partsOf(world, 'goal').find(p => idOf(p) === s.over.goal) ??
    partsOf(world, 'goal')[0] : null;
  const chips = [];
  if (turn && !s.over) chips.push(panelText('turn', turn.says || idOf(turn), s.turn, turn.last));
  for (const store of partsOf(world, 'store').filter(p => p.show).slice(0, 3)) {
    chips.push(panelText('store', store.says || idOf(store), evaluate(idOf(store), world)));
  }
  for (const player of partsOf(world, 'player')) {
    const who = idOf(player);
    chips.push(panelText('player', player.says || who, totals[who], colourOf(world, who)));
  }
  return { chips, objective: s.over ? end?.says || C.finished : story.objective,
    talk: talk ? { id, voice: voice?.says || talk.voice || id,
      lines: talk.lines.slice(0, 3), asks: talk.asks.slice(0, 3).map(a =>
        ({ id: a.id, says: a.says || a.id })) } : null };
}
export function storyReport(world, recap = false) {
  const story = storyOf(world);
  if (world?.kit?.s.over) story.ending = panelOf(world).objective;
  return storyText(story, recap, world?.kitNotice?.says ?? []);
}
export function talkReport(world) {
  return talkText(panelOf(world).talk, world?.kit?.s.queue?.length ?? 0);
}
