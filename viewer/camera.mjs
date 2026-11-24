// Fit the full occupied world and its details into the available canvas.
/** Return a conservative occupied height, including surface details. */
export function worldHeight(world) {
  let height = 1;
  for (let index = world.cells.length - 1; index >= 0; index--) {
    if (world.cells[index]) {
      height = Math.floor(index / (world.w * world.d)) + 2;
      break;
    }
  }
  for (const body of world.bodies) {
    height = Math.max(height, body.y + body.size);
  }
  return height;
}
/** Fit with eight percent total margin; closer zooms keep the world centre in view. */
export function fitCamera(renderer, width, height, zoom = 1) {
  const world = renderer.world;
  const top = worldHeight(world);
  const sine = Math.abs(Math.sin(renderer.yaw));
  const cosine = Math.abs(Math.cos(renderer.yaw));
  const across = world.w * cosine + world.d * sine;
  const vertical = (world.w * sine + world.d * cosine) * Math.sin(renderer.pitch) +
  top * Math.cos(renderer.pitch);
  renderer.focus = [world.w / 2, top / 2, world.d / 2];
  renderer.span = Math.max(across, vertical * width / Math.max(1, height)) / 0.92 * Math.max(
    .6,
    Math.min(2, zoom)
  );
}
