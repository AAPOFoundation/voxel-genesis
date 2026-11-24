// Select versioned rule packs without changing the default extension seam.
import { town } from '../games/town.mjs';
export const rules = { id: 'none@0', systems: [], ops: {} };
export const PACKS = { [rules.id]: rules, [town.id]: town };
/** Select the pack belonging to this world. */
export const packOf = world => PACKS[world.rulesId];
