// COPY-DRAFT: own the runtime wording, protocol catalogue and display labels.
export const C = {
  title: 'Voxel Genesis world',
  waiting: 'Waiting for the first block.',
  reconnect: 'Lost the connection. Trying again.',
  // COPY-DRAFT: acknowledge accepted viewer input.
  inputSent: 'Sent to the game.',
  noscript: 'Turn JavaScript on to see your world.',
  pause: 'Pause building',
  play: 'Keep building',
  blocks: 'blocks',
  left: 'Turn left',
  right: 'Turn right',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  canvas: 'Your voxel world',
  clipped: 'Choose a smaller area to see the whole map.',
  engine: 'This world was made with a newer version.',
  viewerHint: 'run serve',
  bridgeOpen: 'note=bridge-ends-open',
  examplePrompt: 'Build a small town with three cottages, a shop, trees and a yellow car.',
  gamePrompt: 'Start a town game and let us choose what to build each turn.',
  nextStep: 'Start a new client session, then ask for a world.',
  noData: 'no data',
  reviewSaved: 'Review saved:',
  help: 'Use mcp, serve, repl, call, run, tools, kit, check, export or connect.',
  town: {
    how: 'Town game. Ops: [build,kind,c,r] with kind road home shop work park; ' +
      '[grow,c,r]; [auto]; [turn]. Lots are column c and row r, 0 to 5. ' +
      'End each call with turn. Goal: 120 hearts by turn 24. ' +
      'Prices: home 4, shop 6, work 6, park 3, road 1. Grow: home 6, shop/work 8.',
    rules: 'Homes need jobs, shops and a green lot next door. ' +
      'A building wakes beside a road that reaches the edge.',
    end: ['A sleepy village. Every town starts small.', 'A cosy town. One star.',
      'A thriving town. Two stars.', 'A town to be proud of. Three stars.'],
    beat: 'You beat the helper.',
    again: 'Try another seed.',
    noStars: 'No stars yet.',
    content: 'Everyone is content.',
    legend: 'legend . empty # road h home s shop w work p park * grove ~ pond, capitals are grown',
    frozen: 'fixtures: town files already exist. Keep the frozen files.',
    reference: 'town: reference numbers differ. Stop and report before freezing.'
  },
  usageHead: ("tool calls p50ms p95ms mean-in mean-out tokens error-rate " + "common-errors"),
  error: {
    // COPY-DRAFT: built-world starter refusals.
    fromName: 'from: choose small-town, tiny-garden, hill-village or an absolute .png path.',
    fromPNG: 'from: could not read PNG. Use an 8-bit RGB or RGBA, non-interlaced PNG.',
    fromMix: 'from: omit game and kit to start a built world.',
    fromExists: 'from: this world exists. Choose fresh or another name.',
    // COPY-DRAFT: mover refusals with a fix.
    moverId: 'mover: use an id of 1 to 24 letters, digits or hyphens, starting with a letter.',
    moverCell: 'mover: use whole x,z coordinates inside the world.',
    moverBlock: 'mover: choose a block from the world block list.',
    moverStand: 'mover: choose a solid column with air above it.',
    moverCap: 'mover: keep at most 16 movers. Remove one before adding another.',
    moverMissing: 'move: no such mover; pets do not walk. Put [mover,id,block,x,z] before it.',
    moverForm: 'mover: use [mover,id,block,x,z] to add or [mover,id] to remove.',
    moveForm: 'move: use [move,id,x,z] with a target cell.',
    // COPY-DRAFT: refuse blank or multi-line feed text.
    noteText: 'note: use non-empty text without line breaks or control characters.',
    gameRep: 'rep: only build can repeat in a town. List the moves one by one.',
    noGame: 'town: this world has no game. Open a world with game town.',
    over: 'town: the game is finished. Open a fresh world to play again.',
    coins: 'coins: not enough coins. Choose a cheaper move or end the turn.',
    lot: 'lot: outside the board. Use column and row 0 to 5.',
    kind: 'kind: unknown kind. Use road, home, shop, work or park.',
    pond: 'lot: a pond cannot be built on. Choose another lot.',
    same: 'lot: that is already there. Choose another lot or kind.',
    grow: 'grow: only a small home, shop or workshop can grow. Choose another lot.',
    game: 'game: this world has other rules. Choose fresh or another name.',
    townSize: 'size: a town is always 36 by 36 by 16. Omit size.',
    set: 'save: unknown block set. Use base@1, base@2 or base@3 with this connector.',
    config: 'config: cannot safely edit this file. Check its project server entry.',
    arguments: 'arguments: invalid input. Check the tool schema.',
    tool: 'tool: unknown tool. Read the tool list.',
    size: 'size: [width, depth, height], each 8 or more, at most [48, 48, 32].',
    match: 'world: settings must match. Omit size and seed, or choose fresh.',
    form: 'op: wrong form. Check the op list.',
    op: 'op: unknown op. Check the op list.',
    integer: 'op: integer required. Use whole coordinates.',
    bounds: 'bounds: outside the world. Use cells inside its size.',
    block: 'block: unknown block. Read the block list.',
    ground: 'ground: fixed block required. Choose terrain.',
    prefab: 'prefab: unknown prefab. Read the prefab list.',
    layers: 'layers: outside limits. Choose 1 to 4.',
    radius: 'radius: outside limits. Check this op radius.',
    height: 'height: outside limits. Choose 1 to 12.',
    water: 'drop: water cannot be dropped. Choose another block.',
    count: 'count: outside limits. Check this op count.',
    turns: 'turns: outside limits. Choose 0 to 3.',
    nested: 'rep: nested rep is not allowed. Flatten the ops.',
    expanded: 'batch: too many expanded ops. Use at most 2000.',
    writes: 'batch: too many cell writes. Use at most 20000.',
    life: 'life: too many agents. Use at most 12.',
    history: 'undo: not enough history. Choose fewer steps.',
    missing: 'world: no current world. Use world_open first.',
    settle: 'physics: settle limit reached. Use a smaller build.',
    version: 'save: unknown version. Use a compatible connector.',
    rules: 'save: rules do not match. Use the matching rules.',
    save: 'save: unreadable log. Check the local save.',
    busy: 'save: another writer is busy. Try again shortly.',
    json: 'input: invalid JSON. Send one JSON value.',
    jsonCli: 'input: invalid JSON. Send one JSON value, or put it in a file and pass @file.',
    record: 'input: record exceeds 1 MiB. Send a smaller line.',
    request: 'request: invalid envelope. Check the request fields.',
    first: 'session: initialise first. Send the handshake.',
    protocol: 'protocol: a version string is required. Send the client version.',
    method: 'method: unknown method. Check the method name.',
    origin: 'request: local clients only. Remove Origin and use the local Host.',
    route: 'route: not found. Use a listed route.',
    body: 'body: exceeds 256 KiB. Send a smaller request.',
    content: 'content: JSON required. Use application/json.',
    // COPY-DRAFT: refuse a shot that is not a PNG or is over 2 MiB.
    shot: 'shot: send one PNG image. Use image/png.',
    shotSize: 'shot: exceeds 2 MiB. Send a smaller image.',
    // COPY-DRAFT: input route refusals.
    inputSize: 'input: exceeds 256 bytes. Send a smaller request.',
    inputValue: 'input: send one click inside the world or one key: up, left, down, right, space.',
    inputBusy: 'input: too many taps waiting. Wait a moment, then tap again.',
    port: 'port: outside limits. Choose 0 to 65535.',
    file: 'file: could not read input. Check the file path.',
    bench: 'bench: invalid sample. Send the measured frame values.',
    io: 'storage: could not complete the call. Check local file access.',
    shift: 'rep: vertical shift needs a 3D op. Use box, line, clear or pop.',
    exportArgs: 'export: use NAME [--kit FILE] [--run FILE] [--section S] [--force].',
    exportCap: 'export: bundle exceeds 48 parts or 8,192 bytes. Use --section S.',
    exportExists: 'export: an output file exists. Choose another path or use --force.',
    exportPath: 'export: choose distinct output files outside the save folder.',
    exportSection: 'export: unknown section. Use world, play, story, talk or music.'
  }
};
// COPY-DRAFT: mover replies and README rows.
const moveWords = { moved: 'moved', bump: 'bump', blocked: 'blocked' };
export function moverReport(moves, world) {
  const lines = [];
  for (const { id, state, other } of moves ?? []) {
    const mover = world.movers?.[id];
    if (mover == null) continue;
    const line = moveWords[state] + ' ' + id + ' ' + (other ? other + ' ' : '') +
      mover.x + ',' + mover.z;
    if (lines.length >= 3 || [...lines, line].join('\n').length > 120) break;
    lines.push(line);
  }
  return lines.length ? '\n' + lines.join('\n') : '';
}
// COPY-DRAFT: input look rows and the trailing build hint.
export const inputHint = n => n ? '\ninput ' + n + ' new' : '';
export const inputRow = r => r.n + (r.click ? ' click ' + r.click.join(',') : ' key ' + r.key) +
  (r.place ? ' place ' + r.place : '');
/** Format the coordinate convention and revision for a text view. */
export const mapHead = (view, w, d, rev, hash) => view + ' ' +
  w + 'x' + d + ' rev ' + rev + ' hash ' + hash + ' (x right, z down)';
/** Format the world inventory and viewer hint. */
export const infoText = (w, counts, viewer) => w.name + '\nsize ' +
  [w.w, w.d, w.h].join('x') + ' seed ' + w.seed + '\n' + counts +
  '\nlife ' + w.life.length + '\nviewer ' + viewer;
/** Format the block glyph legend. */
export const legendText = blocks => 'legend ' + blocks.map(b => b.glyph + ' ' + b.name).join(' ');
/** Format one tool usage summary row. */
export const usageRow = (tool, n, p50, p95, input, output, tokens, rate, errors) =>
  [tool, n, p50, p95, input, output, tokens, rate, errors].join(' ');
/** Format the shared build and undo reply fields. */
export const terseResult = r => [
  'rev',
  'hash',
  'count',
  'fell',
  'lost',
  'sank',
  'life',
  'changed'
].map(k => k + '=' + (r[k] ?? 0)).join(' ') + (r.at?.length ? ' at=' + r.at.join(';'): '') +
  (r.scatter ? ' placed=' + r.scatter.join('/') : '') + (r.bridgeOpen ? ' ' + C.bridgeOpen : '');
/** Format an indexed refusal with its original value or nearest name. */
export const errorText = (path, field, value, message, suggestion) =>
  path + '.' + field + ' ' + JSON.stringify(value).slice(0, 65) +
  ': ' + (suggestion ? 'unknown. Use ' + suggestion + '.' : message);
/** Format the session call, byte and recovery verdict. */
export const sessionText = (calls, errors, unrecovered, output, target, verdict) =>
  'session calls=' + calls + ' errors=' + errors + ' unrecovered=' +
  unrecovered + ' bytes=' + output + ' target=' + target + ' verdict=' + verdict;
export const reviewCopy = {
  // COPY-DRAFT: kit review labels and fixed evidence rules.
  kitTitle: 'Kit use',
  kitColumns: 'Bundle or kind | Uses | Errors | Mean reply bytes',
  kitSuggestions: 'Kit suggestions',
  kitClearer: 'Add a clearer shape or example for',
  kitUnused: 'No uses:',
  title: 'Weekly review',
  calls: 'Calls',
  errors: 'Error rate',
  top: 'Top errors',
  bytes: 'Mean reply bytes / target',
  unrecovered: 'Unrecovered errors',
  slowest: 'Slowest calls',
  suggestions: 'Ranked suggestions',
  clearer: 'Add an alias or a clearer message for',
  trim: 'Trim replies for',
  recover: 'Improve recovery guidance for',
  startup: 'Review start-up work.',
  bench: 'Review viewer frame work.',
  ab: 'A/B choices',
  none: 'None',
  pass: 'pass',
  needsReview: 'review'
};
export const SERVER_INSTRUCTIONS = (
  "x right, z down, y up. Loose blocks fall without support. " +
  "Trust fell, lost and sank; look only when one is above zero."
);
export const PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'];
export const coinsError = ({ kind, cost, coins }) =>
  kind + ' costs ' + cost + ', you have ' + coins + '.';
const lotName = code =>
  ({ h: 'home', w: 'work', s: 'shop', p: 'park', '*': 'trees', '#': 'road' })[code];
const place = i => i % 6 + ' ' + Math.floor(i / 6);
const townMove = move => move.op.join(' ') + ' ' + move.cost + 'c' +
  (move.replaces ? ' replaces ' + lotName(move.replaces) : '');
const needEntries = (game, st) => {
  const needs = [];
  if (st.P > st.J) needs.push(['jobs', (st.P - st.J) + ' more jobs (work/shop)']);
  if (st.P > st.S) needs.push(['shops', 'more shops (build/grow)']);
  if (st.parkHome >= 0) needs.push(['park', 'a park by the home at ' + place(st.parkHome)]);
  if (st.quietHome >= 0) needs.push(['quiet', 'quiet by home at ' + place(st.quietHome) +
    ' (replace work)']);
  const asleep = game.lots.flatMap(([code], i) =>
    ['h', 'w', 's'].includes(code) && st.awake[i] === false ? [i] : []);
  if (asleep.length) {
    const i = st.repairs?.[0]?.home ?? asleep[0];
    const homes = asleep.filter(n => game.lots[n][0] === 'h').length;
    const count = homes === asleep.length ? homes + ' sleeping homes' :
      (homes > 1 ? homes + ' sleeping homes; ' : '') + asleep.length + ' sleeping buildings';
    const steps = st.repairs?.[0]?.path.length;
    needs.unshift(['road', 'road to sleeping ' + lotName(game.lots[i][0]) + ' at ' + place(i) +
      (asleep.length > 1 ? '; ' + count : '') + (steps > 1 ? '; ' + steps + ' roads' : '')]);
  }
  if (st.asleep === 0 && st.C === st.P && st.J >= st.P && st.S >= st.P) {
    needs.push(['homes', 'more homes (build/grow)']);
  }
  return needs;
};
/** Name a remedy and the affected home for each current shortfall. */
export const townNeeds = (game, st) => needEntries(game, st).map(([, text]) => text);
const ending = (stars, hearts, par) => C.town.end[stars] + ' ' +
  (stars === 0 ? C.town.noStars + ' ' : '') + hearts +
  ' hearts, goal 120. The helper made ' + par + '. ' + C.town.again;
const advice = (moves, needs) => {
  const chosen = [];
  for (const [id] of needs) {
    if (chosen.some(m => m.needs?.includes(id))) continue;
    const move = moves.find(m => m.needs?.includes(id));
    if (move) chosen.push(move);
  }
  const kind = m => m.op[0] === 'grow' ? 'grow' : m.op[1];
  for (const move of moves) {
    if (chosen.some(m => kind(m) === kind(move)) === false) chosen.push(move);
  }
  return chosen;
};
/** Keep each listed need paired with its affordable remedy within the reply budget. */
export function townReport(game, st, moves, par, expanded = false) {
  const done = game.t > 24;
  const first = (done ? 'town done coins ' : 'town turn ' + game.t + '/24 coins ') +
    game.coins + ' people ' + st.P + '/' + st.C + ' hearts ' + st.hearts +
    ' happy ' + st.happy + ' stars ' + st.stars;
  const all = needEntries(game, st);
  const needs = [...all];
  const board = Array.from({ length: 6 }, (_, r) =>
    game.lots.slice(r * 6, r * 6 + 6).map(([code, level]) =>
      level === 2 ? code.toUpperCase() : code).join(''));
  if (done) return [first, ...board, ending(st.stars, st.hearts, par)].join('\n');
  let optional = expanded ? 8 : 3;
  for (;;) {
    const choices = advice(moves, needs);
    const required = choices.filter(m => needs.some(([id]) => m.needs?.includes(id)));
    const picked = [...new Set([...required, ...choices.slice(0, optional)])];
    const lines = [first + (expanded ? ' goal 120 par ' + par : ''),
      needs.length ? 'needs: ' + needs.map(([, text]) => text).join(', ') : C.town.content,
      ...(needs.length < all.length ? ['More needs: town view.'] : []), ...board];
    lines.push('moves ' + [...picked.map(townMove), 'auto', 'turn'].join(' | '));
    const report = lines.join('\n');
    if (expanded || report.length <= 395 || (optional === 0 && needs.length <= 1)) return report;
    if (optional) optional--;
    else needs.pop();
  }
}
/** Format a town map, goal and ranked advice with the fixed rule reminder. */
export const townView = (world, st, moves, par, hash) =>
  'town 6x6 rev ' + world.rev + ' hash ' + hash + ' (c right, r down)\n' +
  townReport(world.game, st, moves, par, true) + '\n' + C.town.rules + '\n' + C.town.legend;
/** Format accessible HUD labels from the pack's numeric snapshot. */
export const townHud = hud => ({
  chips: ['Turn ' + hud.turn + ' of ' + hud.turns, hud.people + ' people',
    'Happy ' + hud.happy, hud.coins + ' coins'],
  progress: hud.hearts + ' hearts, goal ' + hud.goal,
  needs: hud.needs?.length ? hud.needs : [C.town.content],
  end: hud.done ? ending(hud.stars, hud.hearts, hud.par) : ''
});
/*protocol*/
export const PROTOCOL = { initialise: 'initialize', server: 'voxel-genesis', version: '0.6.0' };
export const TOOL_COPY =
/*tools:start*/
[
  {
    "name": "world_open",
    "description": (
      "Open or start a world. Returns size, block and prefab names, viewer link. " +
      "game town: the town game; kit NAME: game parts; from small-town, tiny-garden, " +
      "hill-village or .png path: built world."
    ),
    "inputSchema": {
      "type": "object",
      "properties": {
        "name": { "type": "string", "pattern": "^[a-z0-9-]{1,32}$" },
        "fresh": { "type": "boolean" },
        "game": { "type": "string", "enum": ["town"] },
        "kit": { "type": "string" },
        "from": { "type": "string" },
        "size": { "type": "array", "items": { "type": "integer" }, "minItems": 3, "maxItems": 3,
          "description": "[width, depth, height], each 8 to [48, 48, 32]." },
        "seed": { "type": "integer", "minimum": 0, "maximum": 2147483647 }
      },
      "additionalProperties": false
    },
    "annotations": { "openWorldHint": false }
  },
  {
    "name": "world_build",
    "description": (
      "Build ops in order: [box|line,block,x1,y1,z1,x2,y2,z2]; [p" +
      "aint,ground,x1,z1,x2,z2]; [cover,block,x1,z1,x2,z2,layers]" +
      "; [hill,ground,cx,cz,r,height]; [drop,block,x,z,count]; [s" +
      "tamp,prefab,x,z,turns]; [scatter,name,x1,z1,x2,z2,n]; [cle" +
      "ar,x1,y1,z1,x2,y2,z2]; [pop,x,y,z,r]; [car,block,x1,z1,x2," +
      "z2]; [pet,block,x,z]; [note,text]; [rep,n,dx,dy,dz,[ops]]. " +
      "[mover,id,block,x,z]; [move,id,x,z]. Stamp: low corner, quarter turns. " +
      "Car: block colour; box route. Ground: grass earth rock path" +
      " road water deck. Doors face low z at turns 0." +
      " Game parts, no kit needed: [part,{part:kind/id,..}]; [in,click,x,y,z]."
    ),
    "inputSchema": {
      "type": "object",
      "properties": {
        "ops": { "type": "array", "items": { "type": "array" }, "minItems": 1, "maxItems": 200 }
      },
      "required": ["ops"],
      "additionalProperties": false
    },
    "annotations": { "openWorldHint": false }
  },
  {
    "name": "world_look",
    "description": "Read the world as a small text map. Views: top, height, side, info, town." +
      " Kit view lists kinds; of store,goal gives both docs.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "view": { "type": "string",
          "enum": ["top", "height", "side", "info", "town", "kit", "input"] },
        "of": { "type": "string" },
        "at": { "type": "array", "items": { "type": "integer" }, "minItems": 4, "maxItems": 4 },
        "z": { "type": "integer" }
      },
      "additionalProperties": false
    },
    "annotations": { "openWorldHint": false, "readOnlyHint": true }
  },
  {
    "name": "world_undo",
    "description": "Take back the last build, or the last few.",
    "inputSchema": {
      "type": "object",
      "properties": { "steps": { "type": "integer", "minimum": 1, "maximum": 20 } },
      "additionalProperties": false
    },
    "annotations": { "openWorldHint": false }
  }
]
/*tools:end*/
;
