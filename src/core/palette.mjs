// Extend the frozen base@1 palette without changing legacy ids or definitions.
import { BLOCKS as BASE_ONE, ALLOWED } from './palette-v1.mjs';
import { failure } from '../errors.mjs';
export { ALLOWED };
export const SET_ID = 'base@3';
export const BLOCKS = [
  ...BASE_ONE.map(block => block.windows ? { ...block, details: [] } : block),
  { name: 'plaster', glyph: 'c', colour: '#f6eedd' },
  { name: 'amber', glyph: 's', colour: '#fdb817' },
  { name: 'blue', glyph: 't', colour: '#7d98a8' },
  { name: 'tile', glyph: 'r', colour: '#be5727' }
];
export const SETS = { 'base@1': BASE_ONE, 'base@2': BLOCKS, [SET_ID]: BLOCKS };
/** Read the catalogue pinned to a world. */
export const blocksOf = world => SETS[world.setId];
/** Register the requested version without migrating its cells. */
export function definePalette(world, set = SET_ID) {
  if (!Object.hasOwn(SETS, set)) throw failure('set');
  world.setId = set;
  for (const { name, glyph, colour, ...flags } of SETS[set]) {
    world.defineBlock(name, { ...JSON.parse(JSON.stringify(flags)), glyph, color: colour });
  }
}
