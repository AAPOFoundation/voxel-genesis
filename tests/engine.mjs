// Verify the vendored engine physics, persistence and simple agents.
// Engine tests: node tests/engine.mjs
import { createRequire } from 'node:module';
const E = createRequire(import.meta.url)('../vendor/voxel-engine.js');
const failures = [];
const check = (rule, ok, detail = '') => {
  if (!ok) {
    failures.push({ rule, detail });
  }
};
function world(seed = 3) {
  const w = new E.World({ w: 5, d: 5, h: 12, seed });
  const id = {
    ground: w.defineBlock('ground', { color: '#aaaaaa', fixed: true }),
    water: w.defineBlock('water', { color: '#0000ff', fixed: true, liquid: true }),
    brick: w.defineBlock('brick', { color: '#ff0000' }),
    trunk: w.defineBlock('trunk', { color: '#553311', support: true }),
    leaf: w.defineBlock('leaf', { color: '#00ff00', clings: true })
  };
  for (let x = 0; x < 5; x++) {
    for (let z = 0; z < 5; z++) {
      w.set(x, 0, z, id.ground);
    }
  }
  w.dirty = false;
  return { w, id };
}
const run = (w, seconds) => {
  for (let i = 0; i < seconds * 60; i++) {
    w.step(1 / 60);
  }
};
/* The rule every settled world must obey: nothing loose hangs in the air. */
function floating(w) {
  for (let x = 0; x < w.w; x++) {
    for (let z = 0; z < w.d; z++) {
      for (let y = 1; y < w.h; y++) {
        const t = w.type(x, y, z);
        if (t && !t.fixed && !w.solid(x, y - 1, z) && !(t.clings && w.supported(x, y, z))) {
          return [x, y, z].join(',');
        }
      }
    }
  }
  return null;
}
{
  // gravity-settle: a dropped block lands on the ground and joins the grid
  const { w, id } = world();
  w.drop(2, 2, id.brick, 6);
  run(w, 4);
  check(
    'gravity-settle',
    w.get(2, 1, 2) === id.brick && w.bodies.length === 0,
    `cell=${w.get(2, 1, 2)} bodies=${w.bodies.length}`
  );
} {
  // stacking: three drops in one column, released together, stack three high
  const { w, id } = world();
  w.drop(1, 1, id.brick, 4);
  w.drop(1, 1, id.brick, 7);
  w.drop(1, 1, id.brick, 10);
  run(w, 6);
  check(
    'stacking',
    [1, 2, 3].every(y => w.get(1, y, 1) === id.brick) && !w.get(1, 4, 1) &&
    w.bodies.length === 0,
    `top=${w.top(1, 1)} bodies=${w.bodies.length}`
  );
} {
  // no-overlap: blocks falling in one column never pass through each other, even on a bounce
  const { w, id } = world();
  w.drop(3, 3, id.brick, 5);
  w.drop(3, 3, id.brick, 6.1);
  w.drop(3, 3, id.brick, 7.2);
  let worst = 0;
  for (let i = 0; i < 400; i++) {
    w.step(1 / 60);
    const ys = w.bodies.map(b => b.y).sort((p, q) => p - q);
    for (let k = 1; k < ys.length; k++) {
      worst = Math.max(worst, 1 - (ys[k] - ys[k - 1]));
    }
  }
  check(
    'no-overlap',
    worst < 0.2 && w.top(3, 3) === 3,
    `overlap=${worst.toFixed(2)} top=${w.top(3, 3)}`
  );
} {
  // blast-collapse: blasting the base of a tower removes it and the rest falls into place
  const { w, id } = world();
  for (let y = 1; y <= 5; y++) {
    w.set(2, y, 2, id.brick);
  }
  const n = w.blast(2.5, 1.5, 2.5, 1.2, 8);
  run(w, 8);
  check('blast-count', n >= 1 && n < 5, `removed=${n}`);
  check(
    'blast-collapse',
    floating(w) === null && w.bodies.length === 0,
    `floating=${floating(w)} bodies=${w.bodies.length}`
  );
  check('fixed-ground', w.get(2, 0, 2) === id.ground, 'ground was destroyed');
} {
  // cling: leaves stay on a trunk and fall when the trunk goes
  const { w, id } = world();
  w.set(2, 1, 2, id.trunk);
  w.set(2, 2, 2, id.trunk);
  w.set(3, 2, 2, id.leaf);
  w.set(1, 2, 2, id.leaf);
  w.dirty = true;
  run(w, 1);
  check(
    'cling-holds',
    w.get(3, 2, 2) === id.leaf && w.get(1, 2, 2) === id.leaf,
    'leaves fell off a standing trunk'
  );
  w.set(2, 2, 2, 0);
  run(w, 5);
  check('cling-falls', !w.get(3, 2, 2) && !w.get(1, 2, 2), 'leaves hung in mid air');
} {
  // liquid: a block dropped into water sinks and the water stays
  const { w, id } = world();
  let sank = 0;
  w.on('sink', () => sank++);
  w.set(4, 1, 4, id.water);
  w.drop(4, 4, id.brick, 5);
  run(w, 4);
  check(
    'liquid-sink',
    sank === 1 && w.get(4, 1, 4) === id.water && w.bodies.length === 0,
    `sank=${sank} bodies=${w.bodies.length}`
  );
} {
  // deterministic: the same seed and the same moves give the same world
  const play = () => {
    const { w, id } = world(9);
    for (let y = 1; y <= 4; y++) {
      w.set(1, y, 1, id.brick);
      w.set(3, y, 2, id.brick);
    }
    w.drop(2, 2, id.brick, 8);
    w.blast(1.5, 2.5, 1.5, 1.6, 9);
    run(w, 8);
    return w.cells.join('');
  };
  check('deterministic', play() === play(), 'two identical runs differed');
} {
  // save-load: a world survives a round trip
  const { w, id } = world();
  w.set(0, 1, 0, id.brick);
  const copy = world().w;
  copy.load(JSON.parse(JSON.stringify(w)));
  check(
    'save-load',
    copy.get(0, 1, 0) === id.brick && copy.cells.join('') === w.cells.join('')
  );
} {
  // agents: traffic keeps to its route, walkers only stand where allowed
  const { w } = world();
  const path = [[0, 0], [1, 0], [2, 0], [2, 1], [1, 1], [0, 1]];
  const car = new E.PathAgent({ path, speed: 2, y: 1, color: '#ff0000' });
  const pet = new E.HopAgent(
    {
      x: 0,
      z: 3,
      color: '#00ff00',
      canStand: (ww, x, z) => z >= 3 && ww.top(x, z) === 0
    }
  );
  w.agents.push(car, pet);
  let ok = true,
  moved = false;
  for (let i = 0; i < 1200; i++) {
    w.step(1 / 60);
    const b = car.boxes()[0];
    if (
      !path.some(
        p => Math.abs(p[0] + 0.5 - b.x) < 1.01 && Math.abs(p[1] + 0.5 - b.z) < 1.01
      )
    ) {
      ok = false;
    }
    if (pet.z < 3) {
      ok = false;
    }
    if (pet.x !== 0 || pet.z !== 3) {
      moved = true;
    }
  }
  check('agents-stay-put', ok, 'an agent left its allowed cells');
  check('agents-move', moved, 'the walker never moved');
} {
  // hop-clearance: a hopping agent never passes through blocks, on stepped ground with obstacles
  const { w, id } = world(5);
  for (let x = 0; x < 5; x++) {
    for (let z = 0; z < 5; z++) {
      for (let y = 1; y <= (x + z) % 3; y++) {
        w.set(x, y, z, id.ground);
      }
    }
  }
  w.set(2, w.top(2, 2) + 1, 2, id.brick);
  w.set(2, w.top(2, 2) + 1, 2, id.brick);
  w.dirty = false;
  const pet = new E.HopAgent(
    {
      x: 0,
      z: 0,
      color: '#00ff00',
      canStand: (ww, x, z) => ww.type(x, ww.top(x, z), z).fixed
    }
  );
  w.agents.push(pet);
  let worst = 0,
  hops = 0,
  was = 1;
  for (let i = 0; i < 6000; i++) {
    w.step(1 / 60);
    if (pet.p < 1 && was >= 1) {
      hops++;
    }
    was = pet.p;
    const b = pet.boxes(w)[0];
    if (!b) {
      continue;
    }
    for (const dx of [- b.w / 2, b.w / 2]) {
      for (const dz of [- b.d / 2, b.d / 2]) {
        worst = Math.max(
          worst,
          w.top(Math.floor(b.x + dx), Math.floor(b.z + dz)) +
          1 - (b.y - b.h / 2)
        );
      }
    }
  }
  check(
    'hop-clearance',
    worst < 0.02 && hops > 20,
    `sank ${worst.toFixed(2)} into a block over ${hops} hops`
  );
} for (const f of failures) {
  console.log(`FAIL ${f.rule}: ${f.detail}`);
}
console.log(`engine: ${failures.length} failures`);
process.exit(failures.length ? 1: 0);
