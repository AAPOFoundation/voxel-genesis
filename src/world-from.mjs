// Built worlds for world_open from a name or PNG path, applied batch by batch as the run door does.
import { readFileSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { convert } from './png.mjs';
import { failure } from './errors.mjs';

export function readStarter(a) {
  if (a.from === undefined) return null;
  const png = typeof a.from === 'string' && isAbsolute(a.from) && /\.png$/i.test(a.from);
  if (!png && !['small-town', 'tiny-garden', 'hill-village'].includes(a.from)) {
    throw failure('fromName');
  }
  if (a.game !== undefined || a.kit !== undefined) throw failure('fromMix');
  if (png) {
    try { return convert(readFileSync(a.from)); }
    catch { throw failure('fromPNG'); }
  }
  return JSON.parse(readFileSync(new URL('../fixtures/' + a.from + '.json', import.meta.url)));
}

export function buildStarter(core, world, source, files) {
  const records = [], builds = [];
  for (const batch of source.batches) {
    const ops = files.resolve(batch);
    world = core.applyBatch(world, ops).world;
    records.push({ ops });
    builds.push(ops);
    world.rev = records.length;
  }
  return { q: { world, builds }, records };
}
