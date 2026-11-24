// COPY-DRAFT: all kit explanations, labels, errors and discovery wording.
import { fitText } from './budget.mjs';
export const KIT_COPY = {
  docs: {
    place: 'A named region, or a grid of regions. Cutting it leaves the blocks.',
    scene: 'Plain build ops run once when this part is added or replaced.',
    store: 'A number per player or per game, such as cash or score.',
    player: 'A player, with an optional colour and bot.',
    board: 'Properties and derived values for tagged places.',
    action: 'A move with conditions, costs and effects. Zero max means no limit.',
    input: 'A click on a place, or a key, that runs effects by itself, up to 4 a second. ' +
      'An agent fires one with [in,click,x,y,z] or [in,key,k].',
    dice: 'Seeded dice. A roll effect sets roll.',
    deck: 'Weighted cards drawn each round, or by an effect.',
    turn: 'Player order, moves and end effects. Zero means no limit.',
    goal: 'A condition or final score, with an optional ending.',
    bot: 'Rules for choosing legal affordable moves.',
    advisor: 'How many legal affordable moves to list.',
    beat: 'An objective that follows another beat and completes on a condition.',
    voice: 'A character with a name and colour.',
    talk: 'Lines and choices, opened by a trigger or effect.',
    tune: 'Sixteenth steps: degree, . rest, - hold. Waves: sine triangle square.',
    mood: 'The highest ranked matching mood selects a tune.'
  },
  problems: {
    object: ['expected an object', 'use a JSON object'],
    id: ['bad id', 'use a letter then up to 23 letters, digits or hyphens'],
    type: ['wrong type', 'use'],
    range: ['outside the range', 'use'],
    infix: ['infix condition', 'use a prefix array such as [">=","cash",5]'],
    expression: ['unknown operator or arity', 'use a listed prefix operator'],
    effect: ['unknown effect or arity', 'use a listed effect'],
    prefab: ['unknown prefab', 'use a prefab from world_open'],
    partcap: ['part exceeds 1024 bytes', 'shorten this part'],
    bundlecap: ['bundle exceeds 48 parts or 8192 bytes', 'split the bundle'],
    worldcap: ['world exceeds 96 parts or 16384 bytes', 'cut parts first'],
    bounds: ['place outside the world', 'use a rectangle inside the world'],
    cycle: ['after cycle', 'remove one after link'],
    unresolved: ['unresolved bundle', 'resolve the name before replay'],
    missing: ['missing target', 'add it with ["part",{"part":"ID"}]'],
    // COPY-DRAFT: a kit lookup that matched nothing names what `of` accepts.
    lookup: ['missing target', 'of takes a kind such as'],
    // COPY-DRAFT: a valid kind with no such id keeps the add hint and names its ids.
    lookupId: ['missing target', 'add it with ["part",{"part":"ID"}]'],
    // COPY-DRAFT: a bad kind list says how a list is written.
    lookupList: ['missing target', 'list 2 to 6 different kinds, such as store,input,goal'],
    rep: ['kit op inside rep', 'move it outside rep'],
    scene: ['scene needs plain ops', 'use base build ops only'],
    path: ['unknown edit path', 'use'],
    open: ['world already exists', 'use fresh or ["kit",id] in world_build'],
    file: ['cannot read bundle', 'use a readable JSON file in voxel-kit'],
    json: ['invalid JSON', 'repair the JSON file'],
    collision: ['bundle id clashes', 'choose a unique id outside kinds and sections'],
    version: ['unknown kit version', 'use kit:1'],
    pending: ['behaviour is not available yet', 'add or edit parts'],
    silent: ['no open talk', 'open one with a talk effect'],
    choice: ['unknown choice', 'use say with'],
    note: ['bad note', 'use a scale degree, . or -'],
    unknown: ['unknown field or kind kept', 'check the spelling'],
    name: ['unknown name reads 0', 'add its part or use a known name'],
    alias: ['alias normalised', 'use'],
    integer: ['number normalised', 'use an integer'],
    form: ['wrong op shape', 'use the catalogue example'],
    colour: ['players need distinct colours', 'choose tile, slate, amber or blue'],
    target: ['missing place', 'choose a named place'],
    fixed: ['id, at and tags cannot be set', 'set owner or another place field'],
    effectcap: ['effect limit reached', 'shorten nested effects'],
    unbound: ['no input part matches', 'add an input part for this click or key'],
    // COPY-DRAFT: click refusals say what to do.
    unplaced: ['no input part matches',
      'clicks land only inside places; add a place part with at'],
    noPlace: ['clicks land only inside places', 'add a place part with at'],
    outPlace: ['no input part matches', 'click inside a place, such as'],
    outWorld: ['click is outside the world', 'use'],
    inKey: ['wrong op shape', 'use up, left, down, right or space'],
    inShape: ['wrong op shape', 'send ["in","click",x,y,z] or ["in","key",k]'],
    inputKey: ['key input needs a key', 'use up, left, down, right or space'],
    inputOn: ['at is for clicks and key is for keys', 'use at with on click, or key with on key']
  },
  // COPY-DRAFT: kit with an op name and no such bundle; the op goes on its own.
  bundleOp: ['kit takes a bundle', 'send ', ' as its own op'],
  // COPY-DRAFT: kit with an op name in the bundle place; the ops are separate arrays.
  catalogue: 'kit@1\nops, one array each: kit bundle [section]; part data|bundle:kind/id; ' +
    'edit kind/id path value; cut kind/id|section|*; do id [place]; ' +
    'in click x y z|key k; end; say [id]\n' +
    'of kind[,kind]|bundle|kind/id|bundle:kind/id|section|check\n',
  example: 'example ["part",{"part":"store/cash"}]',
  how: 'view kit for parts; use do id place and end in world_build',
  names: 'names STORE PLAYER.STORE me place.PROP my.count my.sum.PROP all.count.PROP ' +
    'all.sum.PROP turn moves roll flag.ID beat.ID built.PLACE blocks.NAME town.FACT',
  effects: 'effects add set flag stamp clear ops roll draw talk go if each note',
  noProblems: 'check: no problems',
  noParts: 'no parts',
  finished: 'The story is complete.',
  soundOn: 'Sound on',
  soundOff: 'Sound off',
  say: 'Say ',
  storyLabel: 'story: ',
  musicLabel: 'music: ',
  botArguments: 'Use property and a whole seed from 0 to 2147483647.',
  botFrozen: 'Frozen files already exist.',
  botOutcome: 'The game outcome differs. Keep the frozen result.',
  project: 'project files ',
  parts: 'parts ',
  exampleLabel: '\nexample ',
  defaultLabel: '\ndefault ',
  fieldsLabel: '\nfields ',
  unknownBundle: 'bundle',
  status: 'stored',
  hash: ' hash ',
  // COPY-DRAFT: an action past its max, and what to do next.
  maxEnd: 'use [end]',
  maxTry: 'try ',
  maxWait: 'wait'
};
/** List as many kinds as fit the 200 byte refusal, then say there are more. */
function lookupFix(path, fix, kinds) {
  const size = text => new TextEncoder().encode(text).length;
  const room = 200 - size(': missing target; ') - Math.min(size(path), 40) - size(fix) - 1;
  const all = kinds.join(', ');
  if (size(all) <= room) return fix + ' ' + all;
  let list = '';
  for (const kind of kinds) {
    const next = list ? list + ', ' + kind : kind;
    if (size(next + ', and more') > room) break;
    list = next;
  }
  return fix + ' ' + list + ', and more';
}
/** Format a problem without exposing storage exceptions. */
export function kitProblem(path, key, detail = '') {
  if (key === 'bundleOp') {
    const [problem, send, own] = KIT_COPY.bundleOp, head = path + ': ' + problem + '; ';
    const full = send + JSON.stringify(detail) + own;
    const fits = new TextEncoder().encode(head + full).length <= 200;
    return { path, problem, fix: fits ? full : send + '["' + detail[0] + '",...]' + own };
  }
  const [problem, fix] = KIT_COPY.problems[key];
  if (key === 'missing') return { path, problem: problem + ' ' + detail,
    fix: fix.replace('ID', detail) };
  if (key === 'lookupId') {
    const add = fix.replace('ID', detail.id), have = detail.have.slice(0, 3).join(', ');
    const head = path + ': ' + problem + '; ' + add + '; has ';
    const room = 200 - new TextEncoder().encode(head).length;
    return { path, problem, fix: add + (have && have.length <= room ? '; has ' + have : '') };
  }
  if (key === 'lookup') return { path, problem, fix: lookupFix(path, fix, detail) };
  return { path, problem, fix: fix + (detail ? ' ' + detail : '') };
}
export const problemText = item => `${item.path}: ${item.problem}; ${item.fix}`;
/** Keep whole words within a UTF-8 budget, including multibyte copy. */
export function fitWords(text, limit) {
  const short = fitText(text, limit);
  if (short === text || /\s/.test(text[short.length] ?? '')) return short.trimEnd();
  return short.slice(0, Math.max(0, short.search(/\s+\S*$/))).trimEnd();
}
/** Put a missing name before its remedy, retaining full paths in the check view. */
export function warningText(issue) {
  if (issue.problem === KIT_COPY.problems.name[0]) {
    const name = issue.fix.slice(KIT_COPY.problems.name[1].length).trim();
    const [part, field] = issue.path.split('.');
    const [head, tail] = name.split('.');
    const target = head === 'built' ? 'place/' + tail : head === 'beat' ? 'beat/' + tail :
      head === 'flag' ? 'flag ' + tail : 'store/' + (tail || name);
    return fitWords(part + ': needs name ' + name + ' (missing); add ' + target +
      ' or edit ' + (field || 'when'), 80);
  }
  return fitWords(problemText(issue), 80);
}
/** Preserve the known public error code while retaining a bounded kit path and fix. */
export function kitError(path, key, detail = '') {
  const issue = kitProblem(path, key, detail);
  const tail = ': ' + issue.problem + '; ' + issue.fix;
  const room = Math.max(20, 200 - new TextEncoder().encode(tail).length);
  const short = new TextEncoder().encode(path).length <= room ? path :
    fitText(path, Math.floor(room / 3)) + '...' + path.slice(-Math.floor(room / 2));
  const error = new Error(fitText(short + tail, 200));
  return Object.assign(error, { code: 'arguments', opPath: path, issue });
}
export const kitWarning = (path, key, detail = '') =>
  fitWords(problemText(kitProblem(path, key, detail)), 80);
export const kitReport = (count, warnings) =>
  'kit parts ' + count + ' warn ' + warnings.length +
    warnings.slice(0, 3).map(warning => '\n' + fitWords(warning, 80)).join('');
export const playIssue = (key, detail) => ({ key, detail });
export function playError(path, { key, detail }) {
  const messages = {
    over: ['game over', 'start a fresh game'],
    moves: ['no moves left', 'use [end]'],
    action: ['unknown action', 'try ' + detail],
    // COPY-DRAFT: do on an input id says how to fire it, or what blocks it.
    input: ['is an input, not an action', detail ? 'send ' + detail :
      'nothing reaches it; an earlier input or a missing place blocks it'],
    target: ['bad place', 'choose a named place'],
    store: ['missing store', 'add store/' + detail]
  };
  if (key === 'cost') {
    path += '.cost.' + detail.id;
    messages.cost = ['costs ' + detail.cost + ', you have ' + detail.have, 'try [end]'];
  }
  if (key === 'condition') {
    path += '.when.' + detail.i;
    messages.condition = [JSON.stringify(detail.value) + ' is false, current ' +
      JSON.stringify(detail.current), 'choose a legal move or [end]'];
  }
  // COPY-DRAFT: PATH.max names the action and how many times it was used.
  if (key === 'max') {
    path += '.max';
    messages.max = [detail.id + ' used ' + detail.n + ' of ' + detail.max, detail.fix];
  }
  const [problem, fix] = messages[key];
  return Object.assign(new Error(fitText(path + ': ' + problem + '; ' + fix, 200)),
    { code: 'arguments', opPath: path, issue: { path, problem, fix } });
}
export function moveText(op, price, replacing) {
  const cost = Object.values(price).reduce((sum, value) => sum + value, 0);
  return op.slice(1).join(' ') + ' ' + cost + (replacing ? ' replaces building' : '');
}
export function playText({ rows, turn, s, moves, pack = true }) {
  const status = rows.map(row => row.me + ' ' + row.stores.map(([id, value]) =>
    id + ' ' + value).join(' ') + (row.score === null ? '' : ' worth ' + row.score)).join(' | ');
  const head = turn ? turn.says + ' ' + (s.turn ?? 1) +
    (turn.last ? '/' + turn.last : '') + ' ' : '';
  const tail = pack ? ' | moves ' + (s.moves ?? 0) : '';
  const lines = ['play ' + head + status + tail];
  if (s.over) lines.push('over ' + (s.over.winner || 'draw'));
  if (s.last?.news) lines.push('news ' + s.last.news.id + ': ' + s.last.news.says);
  if (s.last?.bots?.length) lines.push(s.last.bots[0].who + ' ' +
    s.last.bots.map(move => move.text).join(', '));
  const listed = moves.map(move => move.text);
  if (pack) listed.push('end');
  if (listed.length) lines.push('can ' + listed.join(' | '));
  return lines.join('\n');
}
export function kitBuild(base, town, world, play = '', notes = []) {
  const text = base + (town ? '\n' + town : '');
  const size = text => new TextEncoder().encode(text).length;
  const feed = notes.slice(-2).map(entry => '\n' + entry.says).join('');
  if (world.kit === undefined && world.kitWarnings === undefined) {
    return feed ? fitWords(text, 400 - size(feed)) + feed : text;
  }
  const report = world.kitWarnings ? '\n' +
    kitReport(Object.keys(world.kit?.parts ?? {}).length, world.kitWarnings) : '';
  const lines = play.split('\n').filter(Boolean);
  const talk = lines.find(line => line.startsWith('talk'));
  const spoken = talk ? '\n' + talk : '';
  const roomForReport = Math.max(0, 700 - size(base + spoken + feed) - 1);
  const suffix = spoken + (feed ? fitWords(report, roomForReport) : report) + feed;
  const head = fitWords(text, 700 - size(suffix));
  const body = lines.filter(line => line.startsWith('talk') === false).map(line => {
    if (talk === undefined || line.startsWith('can ') === false) return line;
    const moves = line.slice(4).split(' | ');
    return 'can ' + [...moves.slice(0, -1).slice(0, 2), moves.at(-1)].join(' | ');
  }).join('\n');
  const room = 700 - size(head + suffix) - 1;
  const middle = fitWords(body, room);
  return head + (middle ? '\n' + middle : '') + suffix;
}
export function storyText(story, recap, says) {
  if (story.total === 0) return '';
  const now = story.ending ? ' ' + story.ending :
    story.objective ? ' now: ' + story.objective : ' complete';
  const head = 'story ' + story.done + '/' + story.total + now;
  return fitText(head + (recap ? '\ndone: ' + (story.completed.join(', ') || 'none') :
    says.length ? ' | ' + says.join(' ') : ''), recap ? 300 : 120);
}
export function talkText(talk, queued) {
  if (talk === null) return 'talk: closed';
  const suffix = queued ? ' | queue ' + queued : '';
  return fitText('talk ' + talk.voice + ': ' + talk.lines.join(' ') +
    talk.asks.map(a => ' | say ' + a.id + ': ' + a.says).join(''), 300 - suffix.length) + suffix;
}
export function panelText(kind, name, value, extra) {
  if (kind === 'turn') return name + ' ' + value + (extra ? '/' + extra : '');
  if (kind === 'store') return name + ' ' + value;
  const colours = { tile: 'orange', slate: 'slate', amber: 'amber', blue: 'blue' };
  return name + ', ' + colours[extra] + ' ring, ' + value;
}
