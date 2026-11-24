// Own deterministic town rules and their voxel presentation.
import { mix, hash } from '../core/codec.mjs';
import { repairPaths, rankMoves } from './town-advice.mjs';
import { failure } from '../errors.mjs';
import { PREFABS, stampCells } from '../core/prefabs.mjs';
import { townReport, townView, townNeeds } from '../copy.mjs';
const kinds = { home: 'h', work: 'w', shop: 's', park: 'p', road: '#' };
const costs = { h: 4, w: 6, s: 6, p: 3, '#': 1 };
const growCosts = { h: 6, w: 8, s: 8 };
const green = code => ['p', '*', '~'].includes(code);
const building = code => ['h', 'w', 's'].includes(code);
const room = lot => lot[0] === 'h' ? 4 * lot[1] : 0;
const edge = i => i < 6 || i >= 30 || i % 6 === 0 || i % 6 === 5;
const neighbours = (i, diagonal = false) => {
  const c = i % 6;
  const r = Math.floor(i / 6);
  const offsets = diagonal ? [[-1, -1], [0, -1], [1, -1], [-1, 0],
    [1, 0], [-1, 1], [0, 1], [1, 1]] : [[0, -1], [-1, 0], [1, 0], [0, 1]];
  return offsets.filter(([x, z]) => c + x >= 0 && c + x < 6 && r + z >= 0 && r + z < 6)
    .map(([x, z]) => 6 * (r + z) + c + x);
};
const near = Array.from({ length: 36 }, (_, i) => neighbours(i));
const around = Array.from({ length: 36 }, (_, i) => neighbours(i, true));
let randomFactory;
const pars = new Map();

/** Create the seeded board without reading a clock or drawing cells. */
export function startGame(seed, rng) {
  const random = rng(mix(seed, 0));
  const gate = 1 + Math.floor(random() * 4);
  const lots = Array.from({ length: 36 }, () => ['.', 0, 0]);
  for (let r = 0; r < 3; r++) lots[r * 6 + gate] = ['#', 1, 0];
  const free = lots.flatMap(([code], i) => code === '.' && i !== 18 + gate ? [i] : []);
  for (let i = free.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [free[i], free[j]] = [free[j], free[i]];
  }
  for (const [n, code] of ['~', '*', '*'].entries()) lots[free[n]] = [code, 1, 0];
  return { t: 1, coins: 12, lots };
}

/** Derive road reach, capacity, needs, happiness and score from the lot triples. */
export function stats(game) {
  const lots = game.lots;
  const linked = new Set(lots.flatMap(([code], i) => code === '#' && edge(i) ? [i] : []));
  for (const i of linked) {
    for (const n of near[i]) if (lots[n][0] === '#') linked.add(n);
  }
  const fronted = lots.map((_, i) => near[i].some(n => linked.has(n)));
  const awake = lots.map(([code], i) => building(code) && fronted[i]);
  const greens = lots.map((_, i) => around[i].some(n => green(lots[n][0])));
  let P = 0, C = 0, J = 4, S = 4, Pg = 0, Pn = 0, F = 0, asleep = 0;
  for (const [i, [code, level, people]] of lots.entries()) {
    if (code === 'h') {
      P += people;
      if (greens[i]) Pg += people;
      if (near[i].some(n => lots[n][0] === 'w')) Pn += people;
    }
    if (awake[i]) {
      C += room(lots[i]);
      J += (code === 's' ? 2 : code === 'w' ? 6 : 0) * level;
      S += (code === 's' ? 8 : 0) * level;
    } else if (building(code)) asleep++;
    if (code === '.' && fronted[i]) F++;
  }
  const hearts = Math.max(0, Math.min(P, J) + Math.min(P, S) + Pg - Pn);
  const happy = P ? Math.floor(100 * hearts / (3 * P)) : 100;
  const stars = hearts >= 200 ? 3 : hearts >= 120 ? 2 : hearts >= 60 ? 1 : 0;
  const parkHome = lots.findIndex(([code, , people], i) => code === 'h' && people && !greens[i]);
  const quietHome = lots.findIndex(([code, , people], i) => code === 'h' && people &&
    near[i].some(n => lots[n][0] === 'w'));
  const repairs = repairPaths(lots, fronted, awake);
  return { P, C, J, S, Pg, Pn, F, asleep, hearts, happy, stars, fronted, awake, greens,
    parkHome, quietHome, repairs };
}

/** Rank positive advice with stable value, cost, lot and kind tie breaks. */
function legacyMoves(game) {
  if (game.t > 24) return [];
  const st = stats(game);
  const lots = game.lots;
  const need = n => Math.max(0, n);
  const value = (kind, i) => {
    if (kind === 'home') return 1 + Math.min(4, need(st.J - st.C)) +
      Math.min(4, need(st.S - st.C)) + (st.greens[i] ? 4 : 0) -
      (near[i].some(n => lots[n][0] === 'w') ? 4 : 0);
    if (kind === 'work') return Math.min(6, need(st.C - st.J)) -
      4 * near[i].filter(n => lots[n][0] === 'h').length;
    if (kind === 'shop') return Math.min(8, need(st.C - st.S)) + Math.min(2, need(st.C - st.J));
    if (kind === 'park') return around[i].reduce((sum, n) =>
      sum + (st.greens[n] ? 0 : room(lots[n])), 0);
    const wake = near[i].filter(n => building(lots[n][0]) && !st.awake[n]).length;
    const open = near[i].filter(n => ['.', '*'].includes(lots[n][0]) && !st.fronted[n]).length;
    return 6 * wake + (st.F <= 2 && open > 0 ? 20 + 2 * open : 0);
  };
  const why = { home: 'homes', work: 'jobs', shop: 'shops', park: 'parks', road: 'roads' };
  const result = [];
  const add = (kind, i, grow = false) => {
    const code = lots[i][0];
    const pen = grow ? 0 : code === '*' ? 2 : code === 'p' ? 6 : 0;
    const score = value(kind, i) - pen;
    if (score <= 0) return;
    result.push({
      op: grow ? ['grow', i % 6, Math.floor(i / 6)] : ['build', kind, i % 6, Math.floor(i / 6)],
      cost: grow ? growCosts[code] : costs[kinds[kind]], value: score, why: why[kind]
    });
  };
  for (const [i, [code, level]] of lots.entries()) {
    if (st.fronted[i] && ['.', '*'].includes(code)) {
      for (const kind of ['home', 'work', 'shop']) add(kind, i);
    }
    if (code === '.') add('park', i);
    if (['.', '*', 'p'].includes(code) && (st.fronted[i] || edge(i))) add('road', i);
    if (st.awake[i] && level === 1) {
      add(Object.keys(kinds).find(kind => kinds[kind] === code), i, true);
    }
  }
  const index = move => move.op.at(-1) * 6 + move.op.at(-2);
  const order = move => move.op[0] === 'grow' ? 5 : Object.keys(kinds).indexOf(move.op[1]);
  return result.sort((a, b) => b.value - a.value || a.cost - b.cost ||
    index(a) - index(b) || order(a) - order(b));
}

/** Rank affordable choices, prioritising repairs and occupied homes' shortfalls. */
export function moves(game) {
  if (game.t > 24) return [];
  return rankMoves(game, stats(game), legacyMoves(game), stats);
}

function validate(game, op) {
  const length = { build: 4, grow: 3, auto: 1, turn: 1 }[op[0]];
  if (op.length !== length) throw failure('form');
  if (game.t > 24) throw failure('over');
  if (op[0] === 'auto' || op[0] === 'turn') return;
  if (op[0] === 'build' && !Object.hasOwn(kinds, op[1])) throw failure('kind');
  const [c, r] = op.slice(-2);
  if (![c, r].every(n => Number.isInteger(n) && n >= 0 && n < 6)) throw failure('lot');
  const lot = game.lots[r * 6 + c];
  if (op[0] === 'build' && lot[0] === '~') throw failure('pond');
  if (op[0] === 'build' && lot[0] === kinds[op[1]]) throw failure('same');
  if (op[0] === 'grow' && (!building(lot[0]) || lot[1] !== 1)) throw failure('grow');
  const cost = op[0] === 'grow' ? growCosts[lot[0]] : costs[kinds[op[1]]];
  if (game.coins < cost) {
    const kind = op[0] === 'grow' ? 'grow' : op[1];
    throw failure('coins', { kind, cost, coins: game.coins });
  }
}

/** Apply one validated rule operation and return its changed lot, if any. */
export function play(game, op) {
  validate(game, op);
  if (op[0] === 'auto') {
    const move = moves(game)[0];
    return move && move.cost <= game.coins ? play(game, move.op) : -1;
  }
  if (op[0] === 'turn') {
    const before = stats(game);
    const movers = before.happy >= 70 ? 2 : before.happy >= 40 ? 1 : game.t % 2;
    for (const [i, lot] of game.lots.entries()) {
      if (lot[0] === 'h' && before.awake[i]) lot[2] += Math.min(movers, room(lot) - lot[2]);
    }
    const after = stats(game);
    game.coins += 3 + Math.floor(Math.min(after.P, after.J) / 4);
    game.t++;
    return -1;
  }
  const [c, r] = op.slice(-2);
  const i = r * 6 + c;
  const lot = game.lots[i];
  if (op[0] === 'grow') {
    game.coins -= growCosts[lot[0]];
    lot[1] = 2;
  } else {
    game.coins -= costs[kinds[op[1]]];
    game.lots[i] = [kinds[op[1]], 1, 0];
  }
  return i;
}

/** Run the helper's six-move allowance using the same rules as auto. */
export function plan(seed, rng = randomFactory) {
  const game = startGame(seed, rng);
  const batches = [];
  while (game.t <= 24) {
    const batch = [];
    for (let n = 0; n < 6; n++) {
      const move = moves(game)[0];
      if (!move || move.cost > game.coins) break;
      play(game, move.op);
      batch.push(move.op);
    }
    play(game, ['turn']);
    batches.push([...batch, ['turn']]);
  }
  return { game, batches };
}

/** Return the helper's memoised final hearts for this seed. */
export function par(seed) {
  if (!pars.has(seed)) pars.set(seed, stats(plan(seed).game).hearts);
  return pars.get(seed);
}
const put = (world, x, y, z, id) => {
  if (world.get(x, y, z) !== id) world.set(x, y, z, id);
};
function placement(game, i) {
  const [code, level] = game.lots[i];
  const name = { h: ['cottage', 'house'], s: ['shop', 'market'], w: ['workshop', 'tower'] }
    [code]?.[level - 1];
  if (!name) return null;
  const turns = (i % 6 + Math.floor(i / 6)) % 2;
  const [width, depth] = turns ? [PREFABS[name].size[1], PREFABS[name].size[0]]
    : PREFABS[name].size;
  return { name, turns, width, depth,
    x: i % 6 * 6 + Math.floor((6 - width) / 2),
    z: Math.floor(i / 6) * 6 + Math.floor((6 - depth) / 2) };
}
function lantern(world, i) {
  const lot = world.game.lots[i];
  if (lot[0] !== 'h' || lot[2] !== room(lot)) return;
  const p = placement(world.game, i);
  const x = p.x + Math.floor(p.width / 2);
  const z = p.z + Math.floor(p.depth / 2);
  // The centre roof is one cell lower than the house chimney.
  put(world, x, lot[1] === 1 ? 6 : 7, z, world.byName.sun);
}
function draw(world, i) {
  const x0 = i % 6 * 6;
  const z0 = Math.floor(i / 6) * 6;
  const code = world.game.lots[i][0];
  for (let x = 0; x < 6; x++) {
    for (let z = 0; z < 6; z++) {
      for (let y = 1; y < world.h; y++) put(world, x0 + x, y, z0 + z, 0);
      let block = 'grass';
      if (code === '#' && (x === 2 || x === 3 || z === 2 || z === 3)) block = 'road';
      if (code === '~' && x >= 1 && x <= 4 && z >= 1 && z <= 4) block = 'water';
      if (code === 'p' && z === 2) block = 'path';
      put(world, x0 + x, 0, z0 + z, world.byName[block]);
    }
  }
  const stamp = (name, x, z, turns = 0) => {
    for (const cell of stampCells(world, name, x, z, turns)) put(world, ...cell);
  };
  if (code === '*') {
    stamp('tree', x0, z0);
    stamp('pine', x0 + 3, z0 + 3);
  }
  if (code === 'p') {
    stamp('tree', x0, z0 + 3);
    stamp('bench', x0 + 3, z0 + 1);
    stamp('well', x0 + 4, z0 + 4);
  }
  const p = placement(world.game, i);
  if (p) stamp(p.name, p.x, p.z, p.turns);
  lantern(world, i);
}
function life(world, i) {
  const x = i % 6 * 6;
  const z = Math.floor(i / 6) * 6;
  world.life = world.life.filter(op => ![2, 4].some(k =>
    op[k] >= x && op[k] < x + 6 && op[k + 1] >= z && op[k + 1] < z + 6));
  const count = kind => world.life.filter(op => op[0] === kind).length;
  const colour = n => ['cream', 'sun', 'brick', 'slate'][n % 4];
  const lots = world.game.lots;
  if (lots[i][0] === 'p' && count('pet') < 6 && world.life.length < 12) {
    world.life.push(['pet', colour(count('pet')), x + 1, z]);
  }
  const n = near[i].find(n => lots[n][0] === '#');
  if (lots[i][0] === '#' && lots.filter(lot => lot[0] === '#').length % 4 === 0 &&
    n !== undefined && count('car') < 4 && world.life.length < 12) {
    world.life.push(['car', colour(count('car')), x + 2, z + 2,
      n % 6 * 6 + 2, Math.floor(n / 6) * 6 + 2]);
  }
}
function apply(world, op) {
  const advice = world.setId === 'base@3' ? moves : legacyMoves;
  const move = op[0] === 'auto' ? advice(world.game)[0] : null;
  const chosen = op[0] === 'auto'
    ? (move?.cost <= world.game.coins ? move.op : null) : op;
  if (!chosen) return;
  const i = play(world.game, chosen);
  if (i >= 0) {
    if (chosen[0] === 'build') life(world, i);
    draw(world, i);
  } else {
    for (let i = 0; i < 36; i++) lantern(world, i);
  }
}
export const town = {
  id: 'town@1', size: [36, 36, 16], systems: [],
  ops: Object.fromEntries(['build', 'grow', 'auto', 'turn'].map(name => [name, {
    validate: (world, op) => validate(world.game, op), expand: op => [op], apply
  }])),
  start(world, engine) {
    randomFactory = engine.rng;
    world.game = startGame(world.seed, randomFactory);
    for (let i = 0; i < 36; i++) if (world.game.lots[i][0] !== '.') draw(world, i);
  },
  facts(world) {
    const st = stats(world.game);
    return { turn: world.game.t, coins: world.game.coins, people: st.P,
      hearts: st.hearts, happy: st.happy, stars: st.stars, done: world.game.t > 24 };
  },
  report: world => townReport(world.game, stats(world.game), moves(world.game),
    world.game.t > 24 ? par(world.seed) : undefined),
  view: world => townView(
    world, stats(world.game), moves(world.game), par(world.seed), hash(world)
  ),
  hud: world => {
    const st = stats(world.game);
    return { turn: Math.min(24, world.game.t), turns: 24, coins: world.game.coins,
      people: st.P, happy: st.happy, hearts: st.hearts, goal: 120, stars: st.stars,
      done: world.game.t > 24, par: par(world.seed), needs: townNeeds(world.game, st) };
  }
};
