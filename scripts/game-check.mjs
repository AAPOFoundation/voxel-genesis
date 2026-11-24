// COPY-DRAFT: local game checks and measurements, with no changes to the MCP manifest.
import { readFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { bundleGame } from './kit-bot.mjs';
import { checkKitData, checkKitWords, shortSentences } from './kit-lint.mjs';
import { createCore } from '../src/core/index.mjs';
import { hash } from '../src/core/codec.mjs';
import { canonBundle } from '../src/kit/canon.mjs';
import { inspectParts } from '../src/kit/parts.mjs';
import { panelOf, storyOf } from '../src/kit/story.mjs';
import { scores } from '../src/kit/play.mjs';
import { createToolSession } from '../src/session.mjs';
import { createKitFiles } from '../src/kit-files.mjs';
const E = createRequire(import.meta.url)('../vendor/voxel-engine.js');
const sections = ['lint', 'invariants', 'ab', 'taste'];
const read = path => JSON.parse(readFileSync(path, 'utf8'));
const mean = values => values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
const rounded = n => +n.toFixed(2);
const fail = message => new Error(message);
const usage = 'Use check <bundle.json> [--script file] [--ab file] [--seeds n] ' +
  '[--turns n] [--json] [--only=lint|invariants|ab|taste] [--win-band low,high].';
function optionsOf(options) {
  const value = { seeds: 12, turns: 40, ...options };
  for (const key of ['seeds', 'turns']) {
    if (!Number.isSafeInteger(value[key]) || value[key] < 1) {
      throw fail(key + ': positive integer');
    }
  }
  if (!value.bundle || value.only && !sections.includes(value.only)) throw fail(usage);
  if (value.winBand !== undefined) {
    const band = Array.isArray(value.winBand) ? value.winBand :
      value.winBand.split(',').map(Number);
    if (band.length !== 2 || band.some(n => !Number.isFinite(n) || n < 0 || n > 1) ||
      band[0] > band[1]) throw fail('win-band: use low,high within 0,1');
    value.winBand = band;
  }
  return value;
}
function replayChecks(bundle, game, seed, check) {
  const core = createCore(E);
  let world = core.applyBatch(core.newWorld({ size: bundle.size,
    rules: bundle.rules, seed }), [['kit', bundle]]).world;
  let split = world;
  for (const ops of game.batches) {
    world = core.applyBatch(world, ops).world;
    for (const op of ops) split = core.applyBatch(split, [op]).world;
    check('batch-split', hash(world) === hash(split), 'seed ' + seed);
  }
  check('replay', hash(world) === game.expected.hash, 'seed ' + seed);
  if (!game.batches.length) return;
  const root = resolve('.agent-work/game-check');
  mkdirSync(root, { recursive: true });
  const home = mkdtempSync(root + '/undo-');
  try {
    const s = createToolSession({ home, kitFolder: home });
    s.call('world_open', { ...(bundle.size ? { size: bundle.size } : {}), seed,
      ...(bundle.rules === 'town@1' ? { game: 'town' } : {}) });
    s.call('world_build', { ops: [['kit', bundle]] });
    const before = hash(s.world);
    s.call('world_build', { ops: game.batches[0] });
    s.call('world_undo', {});
    check('undo', hash(s.world) === before, 'seed ' + seed);
  } finally {
    // Only the unique directory just created inside our scratch root is removed.
    if (dirname(resolve(home)) === root) rmSync(home, { recursive: true, force: true });
  }
}
function measure(label, bundle, games) {
  const human = bundle.parts.find(p => p.part.startsWith('player/') && !p.bot)
    ?.part.split('/')[1] ?? 'you';
  const actions = new Set(games.flatMap(g => g.batches.flat()
    .filter(op => op[0] === 'do').map(op => op[1])));
  const values = games.map(g => scores(g.world)[human] ?? 0);
  const beats = games.map(g => g.arc.firstBeat).filter(n => n !== null);
  return { variant: label, wins: games.filter(g => g.expected.winner === human).length,
    seeds: games.length, score: rounded(mean(values)), spread: values.length ?
      [Math.min(...values), Math.max(...values)] : [0, 0],
    turns: rounded(mean(games.map(g => g.batches.length))),
    bytesPerTurn: rounded(mean(games.flatMap(g => g.bytes))), actions: actions.size,
    defined: bundle.parts.filter(p => p.part.startsWith('action/')).length,
    firstBeat: beats.length ? Math.min(...beats) : null };
}
function taste(bundle, games, check, actionGames = games) {
  const uses = new Map();
  for (const [index, game] of games.entries()) {
    const { arc } = game;
    check('visible', arc.changed / arc.calls >= 0.8, 'seed ' + (index + 1));
    const objective = bundle.parts.some(p => /^(beat|goal)\//.test(p.part));
    if (objective) check('first-objective', arc.first !== null && arc.first <= 3,
      'seed ' + (index + 1) + ': ' + (arc.first ?? 'none'));
  }
  for (const game of actionGames) for (const op of game.batches.flat()) if (op[0] === 'do') {
    uses.set(op[1], (uses.get(op[1]) ?? 0) + 1);
  }
  const total = [...uses.values()].reduce((a, b) => a + b, 0);
  for (const part of bundle.parts.filter(p => p.part.startsWith('action/'))) {
    const used = uses.get(part.part.split('/')[1]) ?? 0;
    check('unused-action', used > 0, part.part);
    check('dominant-action', !total || used / total <= 0.7, part.part);
  }
  const visit = (value, path = '', field = '') => {
    if (typeof value === 'string' && ['says', 'goal', 'lines'].includes(field)) {
      check('sentence', shortSentences(value), path);
    } else if (Array.isArray(value)) value.forEach((v, i) => visit(v, path + '.' + i, field));
    else if (value && typeof value === 'object') {
      for (const [key, v] of Object.entries(value)) visit(v, path + '.' + key, key);
    }
  };
  visit(bundle);
}
/** Return compact data; importing this module never runs a check or prints. */
export function gameCheck(options = {}) {
  const result = { failures: 0 };
  let opts;
  try { opts = optionsOf(options); }
  catch (error) { return { failures: 1, error: error.message }; }
  const active = opts.only ? [opts.only] : sections;
  for (const name of active) result[name] = { failures: [] };
  const checkFor = name => (rule, ok, detail = '') => {
    if (!ok && result[name]) {
      result[name].failures.push(rule + ': ' + detail);
      result.failures++;
    }
  };
  const attempt = (name, path, fn) => {
    try { return fn(); }
    catch (error) { checkFor(name)('load-or-run', false, path + ': ' + error.message); }
  };
  let raw, bundle;
  try {
    raw = typeof opts.bundle === 'string' ? read(opts.bundle) : opts.bundle;
    bundle = canonBundle(raw, typeof opts.bundle === 'string' ? opts.bundle : 'bundle').bundle;
  } catch (error) {
    for (const name of active) checkFor(name)('load', false, opts.bundle + ': ' + error.message);
    return result;
  }
  const path = typeof opts.bundle === 'string' ? opts.bundle : bundle.id ?? 'bundle';
  const loadWorld = () => {
    const core = createCore(E);
    return core.applyBatch(core.newWorld({ size: bundle.size, rules: bundle.rules }),
      [['kit', bundle]]).world;
  };
  if (result.lint) attempt('lint', path, () => {
    checkKitData(path, checkFor('lint'), raw);
    checkKitWords(path, checkFor('lint'), raw);
    for (const issue of inspectParts(loadWorld())) {
      checkFor('lint')('kit-data', false, path + ':' + issue.path + ': ' + issue.problem);
    }
  });
  if (active.every(name => name === 'lint')) return result;
  let script;
  if (opts.script && (result.invariants || result.taste)) {
    try {
      script = typeof opts.script === 'string' ? read(opts.script) : opts.script;
      if (!Array.isArray(script.batches)) throw fail('script: expected batches');
      const files = createKitFiles({ folder: typeof opts.bundle === 'string' ?
        dirname(resolve(opts.bundle)) : undefined });
      script = { ...script, batches: script.batches.map(ops => files.resolve(ops.map(op =>
        op[0] === 'kit' && op[1] === bundle.id ? [op[0], bundle, ...op.slice(2)] : op))) };
    } catch (error) {
      for (const name of active.filter(n => ['invariants', 'taste'].includes(n))) {
        checkFor(name)('script', false, String(opts.script) + ': ' + error.message);
      }
      if (!result.ab) return result;
      script = null;
    }
  }
  const observed = checkFor('taste');
  const observe = world => {
    if (!result.taste) return;
    const panel = panelOf(world), story = storyOf(world);
    if (story.total && story.done < story.total) {
      observed('goal-line', !!panel.objective.trim(), 'turn ' + (world.kit?.s.turn ?? 0));
    }
    const strings = [panel.objective, ...panel.chips, ...(panel.talk?.lines ?? []),
      ...(panel.talk?.asks.map(a => a.says) ?? []), panel.talk?.voice ?? ''];
    for (const text of strings) observed('sentence', shortSentences(text), text);
  };
  const games = [], plays = [];
  const section = result.invariants ? 'invariants' : result.ab ? 'ab' : 'taste';
  const scriptSeed = script?.open?.seed ?? 1;
  const scripted = script && (result.invariants || result.taste) ? attempt(section, path, () =>
    bundleGame(bundle, { seed: scriptSeed, script, turns: opts.turns, onTurn: observe })) : null;
  if (scripted) plays.push(scripted);
  if (script && !scripted && result.taste && section !== 'taste') {
    observed('script-crash', false, String(opts.script));
  }
  for (let seed = 1; seed <= opts.seeds; seed++) {
    const game = attempt(section, path + ' seed ' + seed, () =>
      bundleGame(bundle, { seed, turns: opts.turns, onTurn: script ? undefined : observe }));
    if (!game) {
      for (const name of active.filter(n => n !== 'lint' && n !== section)) {
        checkFor(name)('crash', false, path + ' seed ' + seed);
      }
      continue;
    }
    games.push(game);
    if (!script) plays.push(game);
    if (result.invariants) attempt('invariants', path, () => {
      const check = checkFor('invariants');
      const again = bundleGame(bundle, { seed, turns: opts.turns });
      check('determinism', game.expected.hash === again.expected.hash, 'seed ' + seed);
      check('advice-legal', game.adviceFailures === 0, 'seed ' + seed);
      replayChecks(bundle, game, seed, check);
      const ends = bundle.parts.some(p => p.part.startsWith('goal/') && p.ends);
      if (ends && !script) check('ending', !!game.world.kit?.s.over, 'seed ' + seed);
    });
  }
  if (result.invariants) attempt('invariants', path, () => {
    const check = checkFor('invariants');
    if (scripted) {
      const twice = bundleGame(bundle, { seed: scriptSeed, script, turns: opts.turns });
      check('script-replay', scripted.expected.hash === twice.expected.hash, String(opts.script));
      check('script-cap', scripted.batches.length === script.batches.length, 'turn cap');
      const ends = bundle.parts.some(p => p.part.startsWith('goal/') && p.ends);
      if (ends) check('ending', !!scripted.world.kit?.s.over, 'script');
      replayChecks(bundle, scripted, scriptSeed, check);
    }
    const world = loadWorld();
    for (const issue of inspectParts(world)) {
      checkFor('invariants')('load', false, path + ':' + issue.path + ': ' + issue.problem);
    }
    const sizes = plays.flatMap(g => g.bytes);
    result.invariants.bytes = { mean: rounded(mean(sizes)), worst: Math.max(0, ...sizes) };
  });
  if (result.ab) attempt('ab', opts.ab ?? path, () => {
    const other = opts.ab ? canonBundle(read(opts.ab), opts.ab).bundle : bundle;
    const baseline = [];
    for (let seed = 1; seed <= opts.seeds; seed++) baseline.push(bundleGame(other,
      { seed, turns: opts.turns, idle: !opts.ab }));
    result.ab.rows = [measure('A', bundle, games),
      measure(opts.ab ? 'B' : 'idle', other, baseline)];
    if (opts.winBand) {
      result.ab.winBand = result.ab.rows.map(row => ({ variant: row.variant,
        pass: row.wins / row.seeds >= opts.winBand[0] &&
          row.wins / row.seeds <= opts.winBand[1] }));
      for (const row of result.ab.winBand) checkFor('ab')('win-band', row.pass, row.variant);
    }
  });
  if (result.taste) attempt('taste', path, () =>
    taste(bundle, plays, observed, scripted ? [...games, scripted] : games));
  return result;
}
const short = value => {
  let out = '';
  for (const char of value.replace(/[\r\n]+/g, ' ')) {
    if (Buffer.byteLength(out + char) > 120) break;
    out += char;
  }
  return out;
};
export function formatGameCheck(result) {
  if (result.error) return short(result.error);
  const lines = [];
  for (const name of sections.filter(name => result[name])) {
    const section = result[name];
    lines.push(name + ': ' + section.failures.length + ' failures');
    lines.push(...section.failures.slice(0, 8).map(f => short('FAIL ' + f)));
    if (section.bytes) lines.push('bytes/turn: mean ' + section.bytes.mean +
      ' worst ' + section.bytes.worst + ' in+out');
    if (section.rows) {
      lines.push('variant | wins/seeds | score | min..max | turns | bytes/turn | actions | beat');
      for (const r of section.rows) lines.push([r.variant, r.wins + '/' + r.seeds,
        r.score, r.spread.join('..'), r.turns, r.bytesPerTurn,
        r.actions + '/' + r.defined, r.firstBeat ?? '-'].join(' | '));
    }
    for (const band of section.winBand ?? []) {
      if (band.pass) lines.push('PASS win-band: ' + band.variant);
    }
  }
  return lines.join('\n');
}
export function gameCheckCli(args = process.argv.slice(2)) {
  const options = {}, json = args.includes('--json');
  let result;
  try {
    options.bundle = args[0];
    for (let i = 1; i < args.length; i++) {
      const arg = args[i];
      if (arg === '--json') continue;
      if (arg.startsWith('--only=')) options.only = arg.slice(7);
      else if (['--script', '--ab', '--seeds', '--turns', '--win-band'].includes(arg)) {
        const value = args[++i];
        if (!value || value.startsWith('--')) throw fail(usage);
        const key = arg === '--win-band' ? 'winBand' : arg.slice(2);
        options[key] = ['seeds', 'turns'].includes(key) ? Number(value) : value;
      } else throw fail(usage);
    }
    result = gameCheck(options);
  } catch (error) { result = { failures: 1, error: error.message }; }
  console.log(json ? JSON.stringify(result) : formatGameCheck(result));
  process.exitCode = result.failures ? 1 : 0;
  return result;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) gameCheckCli();
