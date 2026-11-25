// Validate growth before touching storage and match settings against the current world.
import { failure } from './errors.mjs';
import { PACKS } from './core/rules.mjs';
export function sameSize(a, b) {
  return Array.isArray(a) && Array.isArray(b) && a.length === b.length &&
    a.every((n, i) => n === b[i]);
}
export function checkGrowArgs(args) {
  if (args.shift !== undefined && args.grow !== true) throw failure('arguments');
  if (args.grow && (!args.size || ['fresh', 'from', 'kit', 'seed', 'game']
    .some(key => args[key] !== undefined))) throw failure('arguments');
}
export function reopen(core, args, header, records) {
  if (args.game && header.rules !== 'town@1') throw failure('game');
  if (header.rules === 'town@1' && args.size &&
    !sameSize(args.size, PACKS[header.rules].size)) throw failure('townSize');
  const result = core.replay(header, records);
  if (args.grow) return { ...result, grown: core.grow(result.world, args.size, args.shift) };
  if (args.size && !sameSize(args.size, [result.world.w, result.world.d, result.world.h]) ||
    args.seed !== undefined && args.seed !== header.seed) throw failure('match');
  return result;
}
