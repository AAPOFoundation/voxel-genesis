// The single table of kind contracts, defaults, field types and examples.
import { KIT_COPY } from '../kit-copy.mjs';
const row = (section, defaults, types, example) => ({ section, defaults, types, example });
export const KINDS = {
  place: row('world', { at: null, grid: null, tags: [], groups: {}, props: {}, says: '' },
    { at: 'rect?', grid: 'grid?', tags: 'ids', groups: 'rects', props: 'object', says: 'text' },
    { part: 'place/lot', at: [1, 1, 8, 8] }),
  scene: row('world', { ops: [], says: '' }, { ops: 'ops', says: 'text' },
    { part: 'scene/path', ops: [['paint', 'path', 1, 1, 4, 1]] }),
  store: row('play', { start: 0, min: 0, max: null, per: 'player', says: '', show: true },
    { start: 'int', min: 'int', max: 'int?', per: 'player|game', says: 'text', show: 'bool' },
    { part: 'store/cash', start: 10 }),
  player: row('play', { says: '', colour: '', bot: '' },
    { says: 'text', colour: 'block?', bot: 'id?' }, { part: 'player/you' }),
  board: row('play', { places: '', props: { owner: '' }, calc: {}, mark: 'ring', ground: 'grass' },
    { places: 'id?', props: 'object', calc: 'exprs', mark: 'ring|post|none', ground: 'block' },
    { part: 'board/lots' }),
  action: row('play', { on: 'place', when: [], cost: {}, then: [], says: '', value: 1, max: 0 },
    { on: 'text', when: 'conditions', cost: 'exprs', then: 'effects', says: 'text',
      value: 'expr', max: 'uint' }, { part: 'action/save', then: [['add', 'cash', 1]] }),
  input: row('play', { on: 'click', at: '', key: '', then: [], says: '' },
    { on: 'click|key', at: 'id?', key: 'text', then: 'effects', says: 'text' },
    { part: 'input/tap', at: 'lot', then: [['add', 'cash', 1]] }),
  dice: row('play', { sides: 6 }, { sides: 'positive' }, { part: 'dice/cube' }),
  deck: row('play', { draw: 'round', cards: [] }, { draw: 'round|none', cards: 'cards' },
    { part: 'deck/news' }),
  turn: row('play', { order: [], moves: 0, last: 0, end: [], says: 'turn' },
    { order: 'ids', moves: 'uint', last: 'uint', end: 'effects', says: 'text' },
    { part: 'turn/round', moves: 3 }),
  goal: row('play', { when: [], score: null, says: '', win: true, ends: true },
    { when: 'conditions', score: 'expr?', says: 'text', win: 'bool', ends: 'bool' },
    { part: 'goal/done', when: [['>=', 'cash', 10]] }),
  bot: row('play', { moves: 1, rules: [] }, { moves: 'uint', rules: 'rules' },
    { part: 'bot/steady' }),
  advisor: row('play', { top: 5 }, { top: 'uint' }, { part: 'advisor/help' }),
  beat: row('story', { chapter: '', after: '', when: [], goal: '', says: '', then: [] },
    { chapter: 'id?', after: 'id?', when: 'conditions', goal: 'text', says: 'text',
      then: 'effects' }, { part: 'beat/first', when: [['>=', 'cash', 1]] }),
  voice: row('talk', { says: '', colour: 'amber' }, { says: 'text', colour: 'block' },
    { part: 'voice/pip' }),
  talk: row('talk', { voice: '', on: '', lines: [], asks: [] },
    { voice: 'id?', on: 'trigger', lines: 'texts', asks: 'asks' },
    { part: 'talk/hello', voice: 'pip' }),
  tune: row('music', { bpm: 84, scale: [0, 2, 4, 7, 9], root: 60,
    voices: [{ wave: 'triangle', oct: 0, vol: 5, steps: '' }] },
    { bpm: 'bpm', scale: 'scale', root: 'int', voices: 'voices' },
    { part: 'tune/stroll', voices: [{ wave: 'triangle', oct: 0, vol: 5, steps: '0 . 2 .' }] }),
  mood: row('music', { tune: '', when: [], rank: 0 },
    { tune: 'id?', when: 'conditions', rank: 'int' }, { part: 'mood/calm' })
};
for (const [name, kind] of Object.entries(KINDS)) {
  kind.doc = KIT_COPY.docs[name];
  kind.fields = Object.keys(kind.defaults);
}
export const SECTIONS = ['world', 'play', 'story', 'talk', 'music'];
export const KIT_OPS = ['kit', 'part', 'edit', 'cut', 'do', 'end', 'say'];
export const OPERATORS = ['=', '!=', '<', '<=', '>', '>=', 'and', 'or', 'not',
  '+', '-', '*', '/', '%', 'min', 'max'];
export const EFFECTS = ['add', 'set', 'flag', 'stamp', 'clear', 'ops', 'roll', 'draw',
  'talk', 'go', 'if', 'each', 'note'];
export const ALIASES = Object.fromEntries([
  ['says', 'name label title text'], ['when', 'if requires condition conditions'],
  ['then', 'effects effect'], ['cost', 'price'], ['bpm', 'tempo'],
  ['asks', 'choices options'], ['voice', 'speaker character'], ['goal', 'objective']
].flatMap(([field, words]) => words.split(' ').map(word => [word, field])));
export const NESTED = {
  cards: { defaults: { id: '', weight: 1, when: [], then: [], says: '' },
    types: { id: 'id?', weight: 'positive', when: 'conditions', then: 'effects', says: 'text' } },
  asks: { defaults: { id: '', says: '', then: [], next: '' },
    types: { id: 'id?', says: 'text', then: 'effects', next: 'id?' } },
  rules: { defaults: { act: '', pick: 'first', by: 0, when: [] },
    types: { act: 'id?', pick: 'first|min|max', by: 'expr', when: 'conditions' } },
  voices: { defaults: { wave: 'triangle', oct: 0, vol: 5, steps: '' },
    types: { wave: 'sine|triangle|square', oct: 'int', vol: 'uint', steps: 'steps' } },
  grid: { defaults: { at: [1, 1], cell: [8, 8], gap: 2, cols: 4, rows: 4 },
    types: { at: 'pair', cell: 'pair', gap: 'uint', cols: 'positive', rows: 'positive' } }
};
