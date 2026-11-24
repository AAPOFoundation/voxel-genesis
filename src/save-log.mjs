// Read saved worlds, encode snapshots and guard cooperating writers.
import { readFileSync, openSync, closeSync, unlinkSync } from 'node:fs';
import { failure } from './errors.mjs';
import { valid } from './validate.mjs';
import { TOOL_COPY } from './copy.mjs';
import { SETS } from './core/palette.mjs';
import { PACKS } from './core/rules.mjs';
import { encode, hash } from './core/codec.mjs';
function parse(text) {
  try {
    return JSON.parse(text);
  } catch {
    throw failure('save');
  }
}
export function readLog(path) {
  const raw = readFileSync(path, 'utf8');
  if (!raw.endsWith('\n')) {
    throw failure('save');
  }
  const [h,...records] = raw.trimEnd().split('\n').map(parse);
  if (!Object.hasOwn(SETS, h.set)) {
    throw failure('set');
  }
  if (h.v !== 1) {
    throw failure('version');
  }
  if (!Object.hasOwn(PACKS, h.rules)) {
    throw failure('rules');
  }
  if (!valid({ name: h.world, size: h.size, seed: h.seed }, TOOL_COPY[0].inputSchema)) {
    throw failure('save');
  }
  return { h, records };
}
export function snapshot(world) {
  if (!world) {
    return null;
  }
  return {
    set: world.setId,
    rules: world.rulesId,
    ...(world.game ? { game: JSON.parse(JSON.stringify(world.game)) } : {}),
    ...(world.kit ? { kit: JSON.parse(JSON.stringify(world.kit)) } : {}),
    world: world.name,
    size: [world.w, world.d, world.h],
    seed: world.seed,
    rev: world.rev,
    hash: hash(world),
    rle: encode(world.cells),
    life: world.life,
    opsApplied: world.opsApplied
  };
}
export function locked(path, fn) {
  let fd;
  const lock = path + '.lock';
  try {
    fd = openSync(lock, 'wx');
  } catch (e) {
    if (e.code === 'EEXIST') {
      throw failure('busy');
    }
    throw failure('io');
  }
  try {
    return fn();
  } finally {
    closeSync(fd);
    unlinkSync(lock);
  }
}
