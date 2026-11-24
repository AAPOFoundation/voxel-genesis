// COPY-DRAFT: run shared advice and freeze a verified property game once.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createCore } from '../src/core/index.mjs';
import { hash } from '../src/core/codec.mjs';
import { createKitFiles } from '../src/kit-files.mjs';
import { advice, moveIssue } from '../src/kit/advise.mjs';
import { playReport } from '../src/kit/view.mjs';
import { terseResult } from '../src/copy.mjs';
import { kitBuild, KIT_COPY as C } from '../src/kit-copy.mjs';
import { panelOf, storyOf } from '../src/kit/story.mjs';
import { town } from '../src/games/town.mjs';
import { packOf } from '../src/core/rules.mjs';
const E = createRequire(import.meta.url)('../vendor/voxel-engine.js');
const bytes = value => Buffer.byteLength(typeof value === 'string' ? value : JSON.stringify(value));

/** Plan from successive legal advice, then send the complete turn in one batch. */
export function botGame(seed = 7, idle = false) {
  return bundleGame(createKitFiles().bundle('property'), { seed, idle, turns: 13, legacy: true });
}
/** Shared kit-arc probe: only cells, rendered panels and town HUD count as visible. */
export function arcProbe(world) {
  const visible = w => JSON.stringify({ cells: [...w.cells], panel: panelOf(w),
    town: w.game ? town.hud(w) : null });
  let previous = visible(world);
  const arc = { calls: 0, changed: 0, first: null, firstBeat: null };
  return { arc, observe(next) {
    arc.calls++;
    const view = visible(next), done = storyOf(next).done;
    if (view !== previous) arc.changed++;
    previous = view;
    if (arc.first === null && (done > 0 || next.kit?.s.over?.winner)) arc.first = arc.calls;
    if (arc.firstBeat === null && done > 0) arc.firstBeat = arc.calls - 1;
  } };
}
/** Play arbitrary data, or a supplied script, without consulting a bundle id. */
export function bundleGame(bundle, { seed = 7, idle = false, turns = 40,
  script, legacy = false, onTurn } = {}) {
  const core = createCore(E);
  const initial = core.newWorld({ ...script?.open,
    name: legacy ? 'property-game' : 'game-check', seed,
    size: bundle.size, rules: bundle.rules });
  const probe = legacy ? null : arcProbe(initial);
  const opened = core.applyBatch(initial, [['kit', bundle]]);
  let world = opened.world;
  world.rev = opened.result.rev;
  probe?.observe(world);
  onTurn?.(world, null, null);
  const batches = [], sizes = [], replyBytes = [];
  let adviceChecked = 0, adviceFailures = 0;
  while ((script ? batches.length < script.batches.length : !world.kit?.s.over) &&
    batches.length < turns) {
    let planned = world;
    const ops = [];
    const turn = Object.values(world.kit?.parts ?? {}).find(p => p.part.startsWith('turn/'));
    const limit = legacy ? 3 : turn?.moves || 1;
    if (script) ops.push(...script.batches[batches.length]);
    else if (!idle) for (let move = 0; move < limit; move++) {
      const options = advice(planned);
      for (const option of options) {
        adviceChecked++;
        if (moveIssue(planned, option.op) || !/\d/.test(option.text)) adviceFailures++;
        try { core.applyBatch(planned, [option.op]); } catch { adviceFailures++; }
      }
      const talk = legacy || options.length ? null : panelOf(planned).talk;
      const op = talk ? ['say', ...talk.asks.slice(0, 1).map(a => a.id)] : options[0]?.op;
      if (!op || planned.kit?.s.over) break;
      planned = core.applyBatch(planned, [op]).world;
      ops.push(op);
    }
    if (!script && (legacy || turn) && !planned.kit?.s.over) ops.push(['end']);
    if (!ops.length) break;
    const before = world;
    const next = core.applyBatch(world, ops);
    world = next.world;
    world.rev = next.result.rev;
    const reply = kitBuild(terseResult(next.result),
      legacy ? '' : packOf(world).report?.(world), world, playReport(world));
    probe?.observe(world);
    onTurn?.(world, before, ops, reply);
    batches.push(ops);
    replyBytes.push(bytes(reply));
    sizes.push(bytes({ ops }) + bytes(reply));
  }
  const expected = { hash: hash(world), rev: world.rev, scores: world.kit?.s.over?.scores,
    winner: world.kit?.s.over?.winner, turn: world.kit?.s.turn };
  return { expected, batches, bytes: sizes, replyBytes, adviceChecked, adviceFailures,
    ...(legacy ? {} : { world, arc: probe.arc }) };
}
/** Replay a fixed bundle script using the same resolver and primitive core. */
function scriptGame(id) {
  const fixture = JSON.parse(readFileSync('fixtures/kit/' + id + '-game.json', 'utf8'));
  const core = createCore(E), files = createKitFiles(), bundle = files.bundle(id);
  const opened = core.applyBatch(core.newWorld({ ...fixture.open, size: bundle.size,
    rules: bundle.rules }),
    [['kit', bundle]]);
  let world = opened.world;
  world.rev = opened.result.rev;
  for (const ops of fixture.batches) {
    const next = core.applyBatch(world, files.resolve(ops));
    world = next.world;
    world.rev = next.result.rev;
  }
  return { hash: hash(world), rev: world.rev, scores: world.kit.s.over?.scores,
    winner: world.kit.s.over?.winner, ...(world.kit.s.turn ? { turn: world.kit.s.turn } : {}) };
}
function writeScript(id) {
  const path = 'fixtures/kit/expected.json';
  const expected = JSON.parse(readFileSync(path, 'utf8'));
  if (Object.hasOwn(expected, id)) throw new Error(C.botFrozen);
  const result = scriptGame(id);
  if (result.winner !== undefined && result.winner !== 'you') throw new Error(C.botOutcome);
  const raw = readFileSync(path, 'utf8');
  const entry = JSON.stringify({ [id]: result }, null, 2).slice(2, -2);
  writeFileSync(path, raw.trimEnd().slice(0, -2) + ',\n' + entry + '\n}\n');
  console.log(JSON.stringify(result));
}
function refreezeProperty() {
  const path = 'fixtures/kit/expected.json';
  const expected = JSON.parse(readFileSync(path, 'utf8'));
  if (expected.property.hash !== '70ef19c1') throw new Error(C.botFrozen);
  const script = JSON.parse(readFileSync('fixtures/kit/property-game.json', 'utf8'));
  const games = Array.from({ length: 12 }, (_, i) => botGame(i + 1));
  const result = games[6];
  const same = JSON.stringify({ ...result.expected, hash: expected.property.hash }) ===
    JSON.stringify(expected.property);
  if (!same || JSON.stringify(script.batches) !== JSON.stringify(result.batches) ||
    games.some(g => g.expected.winner !== 'you' || g.expected.turn !== 12) ||
    result.batches.flat().filter(op => op[0] === 'do').length !== 36) {
    throw new Error(C.botOutcome);
  }
  expected.property = result.expected;
  writeFileSync(path, JSON.stringify(expected, null, 2) + '\n');
  console.log(JSON.stringify({ old: '70ef19c1', ...result.expected, wins: games.length }));
}
function refreezeGarden() {
  const path = 'fixtures/kit/expected.json';
  const raw = readFileSync(path, 'utf8'), expected = JSON.parse(raw);
  if (expected.garden.hash !== '7a172f6a') throw new Error(C.botFrozen);
  const result = scriptGame('garden');
  if (result.rev !== 10 || result.turn !== 7 || result.winner !== 'you' ||
    JSON.stringify({ ...result, hash: expected.garden.hash }) !==
      JSON.stringify(expected.garden)) throw new Error(C.botOutcome);
  writeFileSync(path, raw.replace('"7a172f6a"', JSON.stringify(result.hash)));
  console.log(JSON.stringify({ old: '7a172f6a', ...result }));
}
function main() {
  if (process.argv[2] === '--write' && process.argv.length === 4) {
    const id = process.argv[3];
    if (!/^[a-z]+(?:-[a-z]+)*$/.test(id)) throw new Error(C.botArguments);
    return writeScript(id);
  }
  if (process.argv.slice(2).join(' ') === '--refreeze-property') return refreezeProperty();
  if (process.argv.slice(2).join(' ') === '--refreeze-garden') return refreezeGarden();
  const [id, rawSeed, ...rest] = process.argv.slice(2);
  const writing = [rawSeed, ...rest].includes('--write');
  const seed = Number(rawSeed === '--write' ? 7 : rawSeed ?? 7);
  if (id !== 'property' || !Number.isSafeInteger(seed) || seed < 0 || seed > 2147483647) {
    throw new Error(C.botArguments);
  }
  const result = botGame(seed);
  if (writing) {
    const paths = ['fixtures/kit/property-game.json', 'fixtures/kit/expected.json'];
    if (paths.some(path => existsSync(path))) throw new Error(C.botFrozen);
    const games = Array.from({ length: 12 }, (_, n) => botGame(n + 1));
    const idle = Array.from({ length: 12 }, (_, n) => botGame(n + 1, true));
    const wins = games.filter(game => game.expected.winner === 'you').length;
    const losses = idle.filter(game => game.expected.winner === 'rival').length;
    if (seed !== 7 || wins < 10 || losses !== 12 ||
      [...games, ...idle].some(game => game.batches.length !== 12 || game.expected.turn !== 12)) {
      throw new Error(JSON.stringify({ wins, idleLosses: losses,
        turns: games.map(game => game.batches.length) }));
    }
    const fixture = { open: { name: 'property-game', kit: 'property', seed: 7 },
      batches: result.batches };
    writeFileSync(paths[0], JSON.stringify(fixture, null, 2) + '\n', { flag: 'wx' });
    writeFileSync(paths[1], JSON.stringify({ property: result.expected }, null, 2) + '\n',
      { flag: 'wx' });
  }
  console.log(JSON.stringify({ seed, ...result.expected,
    moves: result.batches.flat().length - result.batches.length,
    bytesPerTurn: result.bytes.reduce((a, b) => a + b, 0) / result.batches.length,
    worstBytes: Math.max(...result.bytes) }));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) {
    console.log(JSON.stringify({ error: error.message }));
    process.exitCode = 1;
  }
}
