// March an orthographic screen ray through cells from the viewer towards the world.
export function pick(world, camera, width, height, px, py) {
  if (!world || width <= 0 || height <= 0 || px < 0 || py < 0 ||
    px >= width || py >= height) return null;
  const { yaw, pitch, span, focus } = camera;
  const sy = Math.sin(yaw), cy = Math.cos(yaw);
  const sp = Math.sin(pitch), cp = Math.cos(pitch);
  const u = (px - width / 2) * span / width, v = (py - height / 2) * span / width;
  const origin = [focus[0] + u * cy + v * sy * sp, focus[1] - v * cp,
    focus[2] - u * sy + v * cy * sp];
  const direction = [-sy * cp, -sp, -cy * cp], size = [world.w, world.h, world.d];
  let near = -Infinity, far = Infinity, face = null;
  for (let i = 0; i < 3; i++) {
    const d = direction[i];
    if (Math.abs(d) < 1e-12) {
      if (origin[i] < 0 || origin[i] >= size[i]) return null;
      continue;
    }
    const a = -origin[i] / d, b = (size[i] - origin[i]) / d;
    if (Math.min(a, b) > near) {
      near = Math.min(a, b);
      face = [0, 0, 0]; face[i] = d > 0 ? -1 : 1;
    }
    far = Math.min(far, Math.max(a, b));
  }
  if (near >= far) return null;
  const start = origin.map((p, i) => p + direction[i] * (near + 1e-8));
  const cell = start.map(Math.floor), step = direction.map(d => d > 0 ? 1 : -1);
  const delta = direction.map(d => Math.abs(d) < 1e-12 ? Infinity : Math.abs(1 / d));
  const next = direction.map((d, i) => delta[i] === Infinity ? Infinity :
    ((d > 0 ? cell[i] + 1 : cell[i]) - origin[i]) / d);
  while (world.inside(...cell)) {
    if (world.get(...cell)) return { x: cell[0], y: cell[1], z: cell[2], face };
    const i = next[0] < next[1] ? (next[0] < next[2] ? 0 : 2) : next[1] < next[2] ? 1 : 2;
    if (next[i] > far) break;
    cell[i] += step[i]; next[i] += delta[i];
    face = [0, 0, 0]; face[i] = -step[i];
  }
  return null;
}
