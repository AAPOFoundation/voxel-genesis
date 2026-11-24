// Inspect land beside the two ends of a rotated bridge without changing its cells.
/** True when either bridge end has no dry land at deck height within one cell. */
export function openBridgeEnds(world, [, , x, z, turns]) {
  const alongX = turns % 2 === 0;
  const end = offset => {
    for (let side = 0; side < 3; side++) {
      const xx = x + (alongX ? offset : side);
      const zz = z + (alongX ? side : offset);
      if (!world.inside(xx, 0, zz)) continue;
      const y = world.ground(xx, zz);
      const type = world.type(xx, y, zz);
      const bx = x + (alongX ? Math.max(0, Math.min(5, offset)) : side);
      const bz = z + (alongX ? side : Math.max(0, Math.min(5, offset)));
      const deck = world.top(bx, bz) - (side === 1 ? 0 : 1);
      if (type && !type.liquid && y >= deck - 1) return true;
    }
    return false;
  };
  return !end(-1) || !end(6);
}
