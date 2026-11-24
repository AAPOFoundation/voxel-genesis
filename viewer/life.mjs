// Give both renderers the same readable silhouettes without changing saved life or movement.
/** Decorate an engine agent with toy-scale body parts. */
export function dressAgent(agent, kind) {
  const original = agent.boxes.bind(agent);
  agent.boxes = world => {
    const boxes = original(world);
    if (!boxes.length) return boxes;
    const body = boxes[0];
    const box = (dx, dy, dz, w, h, d, rgb = body.rgb) => ({
      x: body.x + dx, y: body.y + dy, z: body.z + dz, w, h, d, rgb
    });
    if (kind === 'pet') {
      return [box(0, .07, 0, .6, .5, .6),
        box(-.18, .43, 0, .16, .24, .18), box(.18, .43, 0, .16, .24, .18)];
    }
    const alongX = body.w > body.d;
    const wheels = [];
    for (const end of [-.25, .25]) {
      for (const side of [-.25, .25]) {
        wheels.push(box(alongX ? end : side, -.05, alongX ? side : end,
          .18, .2, .18, [61, 58, 54]));
      }
    }
    return [box(0, .06, 0, alongX ? 1 : .5, .3, alongX ? .5 : 1),
      box(0, .3, 0, .4, .2, .4, [246, 238, 221]), ...wheels];
  };
  return agent;
}

const TURN = .25; // share of a step spent swinging the body round a corner
function alongOf(from, to) {
  const dx = Math.abs(to[0] - from[0]), dz = Math.abs(to[2] - from[2]);
  return dx === 0 && dz === 0 || dx > dz ? 1 : 0;
}

/** Rebuild mover silhouettes with an optional one-shot route from the shared core. */
export function moverAgents(world, speed, route, reduced = () => false) {
  world.agents = world.agents.filter(agent => !agent.moverId);
  for (const [id, mover] of Object.entries(world.movers ?? {})) {
    const cells = route?.id === id ? route.cells : [[mover.x, mover.z]];
    const path = cells.map(([x, z]) => [x, world.top(x, z) + 1, z]);
    let at = 0, fraction = 0;
    const rest = world.moverAxis?.[id] ?? 1; // a one-cell agent keeps the axis it last walked
    const agent = {
      moverId: id,
      get moving() { return at < path.length - 1; },
      step(world, dt) {
        let distance = Math.min(.5, Math.max(0, dt) * speed);
        while (this.moving && distance > 0) {
          const amount = Math.min(1 - fraction, distance);
          fraction += amount;
          distance -= amount;
          if (fraction >= 1) { at++; fraction = 0; }
          if (!this.moving && path.length > 1) {
            (world.moverAxis ??= {})[id] = alongOf(path[path.length - 2], path[path.length - 1]);
          }
        }
      },
      boxes(world) {
        const from = path[at], to = path[Math.min(at + 1, path.length - 1)];
        const [x, y, z] = from.map((n, i) => n + (to[i] - n) * fraction);
        // 1 = long side along x, 0 = along z. Blend from the previous step over its first quarter.
        const last = at >= path.length - 1; // still: keep the last step's orientation
        const now = !last ? alongOf(from, to)
          : at > 0 ? alongOf(path[at - 1], from) : rest;
        const before = at > 0 && !last ? alongOf(path[at - 1], from) : now;
        const turn = Math.min(1, fraction / TURN);
        // reduced motion keeps today's look: lie along x whatever axis is stored
        const mix = reduced() ? 1 : before + (now - before) * turn;
        return [{ x: x + .5, y: y + .225, z: z + .5,
          w: .45 + .35 * mix, h: .45, d: .8 - .35 * mix,
          rgb: world.types[world.byName[mover.block]].rgb }];
      }
    };
    world.agents.push(agent);
  }
}
