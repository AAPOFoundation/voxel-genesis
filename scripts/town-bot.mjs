// Run the shared town advisor and freeze its reference game only once.
import { existsSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createCore } from '../src/core/index.mjs';
import { hash, summary } from '../src/core/codec.mjs';
import { town, plan, stats } from '../src/games/town.mjs';
import { C, terseResult } from '../src/copy.mjs';
const E = createRequire(import.meta.url)('../vendor/voxel-engine.js');

/** Return 24 explicit batches from the same first-ranked move used by auto. */
export const botBatches = (seed = 7) => plan(seed, E.rng).batches;

/** Replay the helper and measure raw tool argument plus reply bytes per turn. */
export function botGame(seed = 7) {
  const core = createCore(E);
  let world = core.newWorld({ name: 'town-game', rules: town.id, seed });
  const batches = botBatches(seed);
  const bytes = [];
  for (const ops of batches) {
    const next = core.applyBatch(world, ops);
    world = next.world;
    world.rev = next.result.rev;
    const reply = terseResult(next.result) + '\n' + town.report(world);
    bytes.push(Buffer.byteLength(JSON.stringify({ ops })) + Buffer.byteLength(reply));
  }
  const st = stats(world.game);
  const expected = { hash: hash(world), count: summary(world).count, rev: world.rev,
    hearts: st.hearts, people: st.P, happy: st.happy, coins: world.game.coins, stars: st.stars };
  return { expected, batches, bytes };
}

function main() {
  const args = process.argv.slice(2);
  const seed = Number(args.find(arg => !['--write', '--refreeze'].includes(arg)) ?? 7);
  if (!Number.isInteger(seed) || seed < 0 || seed > 2147483647) {
    throw new Error(C.error.arguments);
  }
  const result = botGame(seed);
  if (args.includes('--write') || args.includes('--refreeze')) {
    const paths = ['fixtures/town-game.json', 'fixtures/town-expected.json'];
    if (!args.includes('--refreeze') && paths.some(path => existsSync(path))) {
      throw new Error(C.town.frozen);
    }
    const e = result.expected;
    if (seed !== 7 || result.batches.flat().length - 24 !== 42 ||
      e.hearts !== 168 || e.people !== 56 || e.happy !== 100 || e.coins !== 59 || e.stars !== 2) {
      throw new Error(C.town.reference);
    }
    const fixture = { open: { name: 'town-game', game: 'town', seed: 7 }, batches: result.batches };
    const flag = args.includes('--refreeze') ? 'w' : 'wx';
    writeFileSync(paths[0], JSON.stringify(fixture, null, 2) + '\n', { flag });
    writeFileSync(paths[1], JSON.stringify(result.expected, null, 2) + '\n', { flag });
  }
  console.log(JSON.stringify({ seed, ...result.expected,
    moves: result.batches.flat().length - 24,
    bytesPerTurn: result.bytes.reduce((sum, n) => sum + n, 0) / 24 }));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.log(JSON.stringify({ error: error.message }));
    process.exitCode = 1;
  }
}
