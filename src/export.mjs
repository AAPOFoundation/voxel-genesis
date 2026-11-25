// Export current parts and active builds without opening or changing a saved world.
import { existsSync, mkdirSync, realpathSync, statSync, writeFileSync }
  from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { createRequire } from 'node:module';
import { createCore } from './core/index.mjs';
import { hash } from './core/codec.mjs';
import { readLog } from './save-log.mjs';
import { dataHome } from './usage.mjs';
import { failure } from './errors.mjs';
import { valid } from './validate.mjs';
import { TOOL_COPY } from './copy.mjs';
import { canonBundle, sorted } from './kit/canon.mjs';
import { KINDS, SECTIONS } from './kit/kinds.mjs';

function options(args) {
  const [name, ...flags] = args;
  if (!name || !valid({ name }, TOOL_COPY[0].inputSchema)) throw failure('exportArgs');
  const out = { name, kit: join('voxel-kit', name + '.json'), run: name + '.run.json' };
  const seen = new Set();
  for (let i = 0; i < flags.length; i++) {
    const flag = flags[i];
    if (seen.has(flag)) throw failure('exportArgs');
    seen.add(flag);
    if (flag === '--force') out.force = true;
    else if (['--kit', '--run', '--section'].includes(flag)) {
      const value = flags[++i];
      if (!value || value.startsWith('--')) throw failure('exportArgs');
      out[flag.slice(2)] = value;
    } else throw failure('exportArgs');
  }
  if (out.section && !SECTIONS.includes(out.section)) throw failure('exportSection');
  return out;
}
// Resolve existing ancestors too, so aliases cannot target the save directory.
function physical(path) {
  if (existsSync(path)) return realpathSync(path);
  return join(physical(dirname(path)), basename(path));
}
const within = (parent, path) => {
  const rest = relative(parent, path);
  return !rest || rest !== '..' && !rest.startsWith('..' + sep) && !isAbsolute(rest);
};
function targets(paths, home, force) {
  const real = paths.map(physical);
  const saved = physical(resolve(home));
  if (real.some(path => within(saved, path)) || !relative(real[0], real[1])) {
    throw failure('exportPath');
  }
  for (const path of paths) {
    if (existsSync(path)) {
      if (!force) throw failure('exportExists');
      if (!statSync(path).isFile()) throw failure('exportPath');
    }
    let parent = dirname(path);
    while (!existsSync(parent)) parent = dirname(parent);
    if (!statSync(parent).isDirectory()) throw failure('exportPath');
  }
  if (real.some((path, i) => real.some((other, j) =>
    i !== j && within(path, other)))) throw failure('exportPath');
}

export function exportWorld(args, { home = dataHome(), cwd = process.cwd() } = {}) {
  const out = options(args);
  const { h, records } = readLog(join(home, 'worlds', out.name + '.jsonl'));
  const engine = createRequire(import.meta.url)('../vendor/voxel-engine.js');
  const { world, builds } = createCore(engine).replay(h, records);
  const parts = Object.values(world.kit?.parts ?? {}).filter(part =>
    !out.section || KINDS[part.part.split('/')[0]]?.section === out.section);
  const bundle = { kit: 1, id: out.name, size: [world.w, world.d, world.h],
    rules: h.rules, parts };
  if (parts.length > 48 || Buffer.byteLength(JSON.stringify(bundle)) > 8192) {
    throw failure('exportCap');
  }
  const kit = JSON.stringify(canonBundle(bundle).bundle);
  if (Buffer.byteLength(kit) > 8192) throw failure('exportCap');
  const open = { name: out.name, size: h.size, seed: h.seed, fresh: true,
    ...(h.rules === 'town@1' ? { game: 'town' } : {}) };
  const run = JSON.stringify(sorted({ open, batches: builds })) + '\n';
  const paths = [resolve(cwd, out.kit), resolve(cwd, out.run)];
  targets(paths, home, out.force);
  // Both destinations and both payloads are checked before creating any output.
  for (const path of paths) mkdirSync(dirname(path), { recursive: true });
  writeFileSync(paths[0], kit, { flag: out.force ? 'w' : 'wx' });
  writeFileSync(paths[1], run, { flag: out.force ? 'w' : 'wx' });
  return { kit: out.kit, run: out.run, parts: parts.length, bytes: Buffer.byteLength(kit),
    hash: hash(world) };
}
