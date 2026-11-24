/*
 * AAPO voxel engine. A small block world with physics, agents and a canvas renderer.
 * No dependencies. Works in a browser (window.AapoVoxel) and in Node (require).
 * Design notes: ENGINE.md.
 *
 *   World     the grid of blocks, block types, bodies, agents, timers, events
 *   physics   fixed 120 Hz step: gravity, bounce, stacking, settling, collapse, blasts
 *   agents    PathAgent (follows a route, e.g. traffic), HopAgent (wanders, e.g. animals)
 *   Renderer  orthographic canvas view with turning, face culling, shadows, details and picking
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AapoVoxel = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var STEP = 1 / 120;

  function rgb(hex) {
    return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
  }
  /* Seeded random numbers, so the same moves always give the same world. */
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------- World ---------- */

  function World(o) {
    this.w = o.w; this.d = o.d; this.h = o.h;
    this.cells = new Uint8Array(o.w * o.d * o.h);
    this.types = [null];
    this.byName = {};
    this.bodies = [];
    this.agents = [];
    this.systems = [];
    this.timers = [];
    this.handlers = {};
    this.gravity = o.gravity || -28;
    this.random = rng(o.seed || 1);
    this.time = 0;
    this.acc = 0;
    this.dirty = false;
  }

  /* def: color, solid by default, plus flags:
     fixed (never falls or blasts), liquid, clings (hangs off a support), support,
     windows (drawn on side faces), size [w,h,d] for blocks smaller than a cell,
     details: small boxes drawn on top of the block while nothing sits on it, each
       {at:[x,h,z] inside the cell, size:[w,h,d], color, every:n, seed:k}.
       `every` shows the detail on roughly one cell in n, chosen by position.
     Any other keys are kept, so a game can tag blocks (road, plant, zone...). */
  World.prototype.defineBlock = function (name, def) {
    def = def || {};
    def.name = name;
    def.id = this.types.length;
    def.rgb = rgb(def.color || '#cccccc');
    if (def.details) for (var i = 0; i < def.details.length; i++) def.details[i].rgb = rgb(def.details[i].color);
    this.types.push(def);
    this.byName[name] = def.id;
    return def.id;
  };
  World.prototype.inside = function (x, y, z) {
    return x >= 0 && y >= 0 && z >= 0 && x < this.w && y < this.h && z < this.d;
  };
  World.prototype.get = function (x, y, z) {
    return this.inside(x, y, z) ? this.cells[(y * this.d + z) * this.w + x] : 0;
  };
  World.prototype.type = function (x, y, z) {
    return this.types[this.get(x, y, z)];
  };
  World.prototype.set = function (x, y, z, id) {
    if (!this.inside(x, y, z)) return false;
    this.cells[(y * this.d + z) * this.w + x] = id;
    if (!id) this.dirty = true;
    return true;
  };
  World.prototype.solid = function (x, y, z) {
    var t = this.type(x, y, z);
    return !!t && !t.liquid;
  };
  /* Height of the highest block in a column, or -1 if the column is empty. */
  World.prototype.top = function (x, z) {
    for (var y = this.h - 1; y >= 0; y--) if (this.get(x, y, z)) return y;
    return -1;
  };
  /* Terrain level of a column: the highest fixed block, ignoring anything built or grown on it. */
  World.prototype.ground = function (x, z) {
    for (var y = this.h - 1; y >= 0; y--) { var t = this.type(x, y, z); if (t && t.fixed) return y; }
    return -1;
  };
  World.prototype.clear = function () {
    this.cells.fill(0); this.bodies = []; this.timers = []; this.dirty = false;
  };
  World.prototype.on = function (name, fn) {
    (this.handlers[name] = this.handlers[name] || []).push(fn);
  };
  World.prototype.emit = function (name, data) {
    var list = this.handlers[name];
    if (list) for (var i = 0; i < list.length; i++) list[i](data);
  };
  /* Run fn after a delay measured in world time, so it stays deterministic. */
  World.prototype.after = function (seconds, fn) {
    this.timers.push({ at: this.time + seconds, fn: fn });
  };
  World.prototype.toJSON = function () {
    return { w: this.w, d: this.d, h: this.h, cells: Array.prototype.slice.call(this.cells) };
  };
  World.prototype.load = function (data) {
    if (data.w !== this.w || data.d !== this.d || data.h !== this.h) throw new Error('World size mismatch');
    this.clear(); this.cells.set(data.cells);
  };

  /* ---------- Bodies: blocks in motion ---------- */

  /* A body is a loose cube. settle:true bodies snap back into the grid when they land.
     settle:false bodies are debris: they bounce, then fade after `life` seconds. */
  World.prototype.spawn = function (o) {
    var b = {
      x: o.x, y: o.y, z: o.z, vx: o.vx || 0, vy: o.vy || 0, vz: o.vz || 0,
      size: o.size || 1, type: o.type, settle: !!o.settle, life: o.life || 0,
      bounce: o.bounce === undefined ? 0.28 : o.bounce, age: 0, wet: false
    };
    this.bodies.push(b);
    return b;
  };
  /* Drop a block of the given type into a column from `height` cells above its top. */
  World.prototype.drop = function (x, z, id, height) {
    return this.spawn({ x: x + 0.5, y: this.top(x, z) + 1.5 + (height || 6), z: z + 0.5, type: id, settle: true });
  };
  /* Turn every loose block within `radius` into flying debris. Returns how many. */
  World.prototype.blast = function (cx, cy, cz, radius, power) {
    var n = 0, r = Math.ceil(radius), R = this.random;
    for (var x = Math.floor(cx) - r; x <= Math.floor(cx) + r; x++)
      for (var y = Math.floor(cy) - r; y <= Math.floor(cy) + r; y++)
        for (var z = Math.floor(cz) - r; z <= Math.floor(cz) + r; z++) {
          var t = this.type(x, y, z);
          if (!t || t.fixed) continue;
          var dx = x + 0.5 - cx, dy = y + 0.5 - cy, dz = z + 0.5 - cz, len = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (len > radius) continue;
          if (len < 0.01) { dx = 0; dy = 1; dz = 0; len = 1; }
          var p = power * (0.55 + R() * 0.6) / len;
          this.set(x, y, z, 0);
          this.spawn({
            x: x + 0.5, y: y + 0.5, z: z + 0.5, type: t.id, size: 0.62,
            vx: dx * p + (R() - 0.5) * 2, vy: 5 + R() * 6 + dy * p * 0.5, vz: dz * p + (R() - 0.5) * 2,
            life: 2.2 + R() * 1.2, bounce: 0.4
          });
          n++;
        }
    this.emit('blast', { x: cx, y: cy, z: cz, count: n });
    return n;
  };
  /* Anything loose with nothing under it starts to fall. Runs after blocks are removed. */
  World.prototype.collapse = function () {
    for (var x = 0; x < this.w; x++)
      for (var z = 0; z < this.d; z++)
        for (var y = 1; y < this.h; y++) {
          var t = this.type(x, y, z);
          if (!t || t.fixed || this.solid(x, y - 1, z)) continue;
          if (t.clings && this.supported(x, y, z)) continue;
          this.set(x, y, z, 0);
          this.spawn({ x: x + 0.5, y: y + 0.5, z: z + 0.5, type: t.id, settle: !t.clings, life: t.clings ? 2 : 0, size: t.clings ? 0.7 : 1 });
        }
  };
  World.prototype.supported = function (x, y, z) {
    var n = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (var i = 0; i < 4; i++) { var t = this.type(x + n[i][0], y, z + n[i][1]); if (t && t.support) return true; }
    return false;
  };

  /* ---------- Simulation ---------- */

  /* Advance by dt seconds of real time, in fixed steps. */
  World.prototype.step = function (dt) {
    this.acc += Math.min(dt, 0.1);
    while (this.acc >= STEP) { this.tick(STEP); this.acc -= STEP; }
  };
  World.prototype.tick = function (h) {
    var i, b;
    this.time += h;
    for (i = this.timers.length - 1; i >= 0; i--)
      if (this.timers[i].at <= this.time) { var tm = this.timers.splice(i, 1)[0]; tm.fn(this); }
    for (i = 0; i < this.systems.length; i++) this.systems[i](this, h);
    for (i = 0; i < this.agents.length; i++) this.agents[i].step(this, h);
    if (this.dirty) { this.dirty = false; this.collapse(); }
    for (i = this.bodies.length - 1; i >= 0; i--) {
      b = this.bodies[i];
      if (this.move(b, h)) this.bodies.splice(i, 1);
    }
  };
  /* Move one body. Returns true when the body is finished and should be removed. */
  World.prototype.move = function (b, h) {
    var half = b.size / 2, fy = Math.floor(b.y), nx, nz, ny, cx, cz, cy, j, o;
    b.age += h;
    b.vy += this.gravity * h;
    if (b.vx) {
      nx = b.x + b.vx * h;
      if (this.solid(Math.floor(nx + (b.vx > 0 ? half : -half)), fy, Math.floor(b.z))) b.vx *= -0.4; else b.x = nx;
    }
    if (b.vz) {
      nz = b.z + b.vz * h;
      if (this.solid(Math.floor(b.x), fy, Math.floor(nz + (b.vz > 0 ? half : -half)))) b.vz *= -0.4; else b.z = nz;
    }
    ny = b.y + b.vy * h;
    cx = Math.floor(b.x); cz = Math.floor(b.z);
    if (b.vy <= 0) {
      cy = Math.floor(ny - half);
      var under = this.type(cx, cy, cz);
      if (under && under.liquid && !b.wet) { b.wet = true; b.vy *= 0.35; this.emit('splash', b); }
      if (b.settle) {
        /* Rest on a falling block in the same column, so drops stack in the air. */
        for (j = 0; j < this.bodies.length; j++) {
          o = this.bodies[j];
          if (o === b || !o.settle || Math.floor(o.x) !== cx || Math.floor(o.z) !== cz || o.y >= b.y) continue;
          if (ny - half < o.y + o.size / 2) { ny = o.y + o.size / 2 + half; b.vy = o.vy; }
        }
      }
      if (this.solid(cx, cy, cz)) {
        ny = cy + 1 + half;
        if (b.wet) { this.emit('sink', b); return true; }
        if (b.vy > -2.4) {
          b.vy = 0;
          if (b.settle) {
            var sy = cy + 1;
            while (this.get(cx, sy, cz) && sy < this.h) sy++;
            if (sy < this.h) { this.set(cx, sy, cz, b.type); this.emit('settle', { x: cx, y: sy, z: cz, type: this.types[b.type] }); }
            return true;
          }
          b.vx *= 0.6; b.vz *= 0.6;
        } else {
          b.vy *= -b.bounce; b.vx *= 0.7; b.vz *= 0.7;
          this.emit('bounce', b);
        }
      }
    } else if (this.solid(cx, Math.floor(ny + half), cz)) {
      b.vy = 0; ny = b.y;
    }
    b.y = ny;
    return b.y < -12 || (b.life > 0 && b.age > b.life);
  };

  /* ---------- Agents ---------- */

  /* Follows a list of [x,z] or [x,z,y] cells at a steady speed. Give cells a y and the
     agent climbs and descends between levels. Use it for traffic, trams, boats. */
  function PathAgent(o) {
    this.path = o.path; this.speed = o.speed || 2; this.s = o.start || 0; this.y = o.y;
    this.rgb = rgb(o.color); this.cab = rgb(o.cab || '#f6eedd'); this.loop = o.loop !== false;
    this.paused = false; this.j = 0; this.jv = 0;
  }
  PathAgent.prototype.step = function (world, h) {
    if (!this.paused) this.s = (this.s + this.speed * h) % this.path.length;
    if (this.j > 0 || this.jv > 0) { this.jv += world.gravity * h; this.j = Math.max(0, this.j + this.jv * h); if (!this.j) this.jv = 0; }
  };
  PathAgent.prototype.jump = function () { if (!this.j) this.jv = 8; };
  PathAgent.prototype.boxes = function () {
    var n = this.path.length, i = Math.floor(this.s) % n, f = this.s - Math.floor(this.s);
    var a = this.path[i], b = this.path[(i + 1) % n], alongX = b[0] !== a[0];
    var ya = a[2] === undefined ? this.y : a[2], yb = b[2] === undefined ? this.y : b[2];
    var x = a[0] + 0.5 + (b[0] - a[0]) * f, z = a[1] + 0.5 + (b[1] - a[1]) * f, y = ya + (yb - ya) * f + this.j;
    return [
      { x: x, y: y + 0.15, z: z, w: alongX ? 0.66 : 0.36, h: 0.26, d: alongX ? 0.36 : 0.66, rgb: this.rgb },
      { x: x, y: y + 0.37, z: z, w: 0.3, h: 0.18, d: 0.3, rgb: this.cab }
    ];
  };

  /* Hops between cells that pass canStand(world, x, z). Use it for animals and people. */
  function HopAgent(o) {
    this.x = o.x; this.z = o.z; this.fx = o.x; this.fz = o.z; this.p = 1; this.wait = 1;
    this.fy = null; this.peak = 0; this.reach = o.reach || 2.8;
    this.canStand = o.canStand; this.rgb = rgb(o.color); this.still = !!o.still; this.hidden = false;
  }
  HopAgent.prototype.step = function (world, h) {
    if (this.p < 1) { this.p += h / 0.55; return; }
    this.hidden = !this.canStand(world, this.x, this.z);
    this.wait -= h;
    if (this.wait > 0 || (this.still && !this.hidden)) return;
    this.hop(world);
  };
  HopAgent.prototype.jump = function (world) { if (this.p >= 1) this.hop(world); };
  /* The height a hop from here to (x,z) must reach to clear every block on the way.
     It checks each column in the box between the two cells. */
  HopAgent.prototype.peakTo = function (world, x, z) {
    var high = -1;
    for (var cx = Math.min(this.x, x); cx <= Math.max(this.x, x); cx++)
      for (var cz = Math.min(this.z, z); cz <= Math.max(this.z, z); cz++) high = Math.max(high, world.top(cx, cz));
    return high + 1.7;
  };
  HopAgent.prototype.hop = function (world) {
    var near = [], all = [];
    for (var x = 0; x < world.w; x++) for (var z = 0; z < world.d; z++) {
      if ((x === this.x && z === this.z) || !this.canStand(world, x, z)) continue;
      var peak = this.peakTo(world, x, z), cell = [x, z, peak];
      all.push(cell);
      /* Only hop where the jump is one this animal could make. */
      if (Math.abs(x - this.x) + Math.abs(z - this.z) <= 2 && peak - world.top(this.x, this.z) - 1 <= this.reach) near.push(cell);
    }
    var list = near.length ? near : this.hidden ? all : [];
    this.wait = 0.8 + world.random() * 1.8;
    if (!list.length) return;
    var to = list[Math.floor(world.random() * list.length)];
    this.fy = world.top(this.x, this.z); this.peak = to[2];
    this.fx = this.x; this.fz = this.z; this.x = to[0]; this.z = to[1]; this.p = 0; this.hidden = false;
  };
  HopAgent.prototype.boxes = function (world) {
    if (this.hidden) return [];
    /* Up first, across at the peak, then down. The animal only moves sideways
       once it is above everything in its way, so it never cuts through a block. */
    var p = Math.min(1, this.p), u = Math.min(1, Math.max(0, (p - 0.2) / 0.6)), e = u * u * (3 - 2 * u);
    var x = this.fx + (this.x - this.fx) * e + 0.5, z = this.fz + (this.z - this.fz) * e + 0.5;
    var ty = world.top(this.x, this.z) + 1, fy = this.fy === null || p >= 1 ? ty : this.fy + 1, pk = Math.max(this.peak, ty, fy);
    var y = p >= 1 ? ty : p < 0.3 ? fy + (pk - fy) * Math.sin(Math.PI / 2 * p / 0.3)
      : p > 0.7 ? ty + (pk - ty) * Math.sin(Math.PI / 2 * (1 - p) / 0.3)
      : pk + 0.1 * Math.sin(Math.PI * (p - 0.3) / 0.4);
    return [
      { x: x, y: y + 0.18, z: z, w: 0.46, h: 0.36, d: 0.46, rgb: this.rgb },
      { x: x - 0.13, y: y + 0.42, z: z, w: 0.12, h: 0.12, d: 0.12, rgb: this.rgb },
      { x: x + 0.13, y: y + 0.42, z: z, w: 0.12, h: 0.12, d: 0.12, rgb: this.rgb }
    ];
  };

  /* ---------- Renderer ---------- */

  function Renderer(canvas, world, o) {
    o = o || {};
    this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.world = world;
    this.yaw = o.yaw === undefined ? 0.7 : o.yaw;
    this.pitch = o.pitch || 0.56;
    this.span = o.span || Math.max(world.w, world.d) * 1.5;
    this.focus = o.focus || [world.w / 2, 2, world.d / 2];
    this.extras = [];   /* free boxes in world space: clouds, markers */
    this.lit = rgb(o.lit || '#fdb817');
    this.polys = [];
  }
  Renderer.prototype.resize = function () {
    var w = this.canvas.clientWidth, d = Math.min((typeof devicePixelRatio === 'number' && devicePixelRatio) || 1, 2);
    if (w && this.canvas.width !== Math.round(w * d)) this.canvas.width = this.canvas.height = Math.round(w * d);
  };
  Renderer.prototype.render = function () {
    var self = this, w = this.world, ctx = this.ctx, W = this.canvas.width, H = this.canvas.height;
    var sn = Math.sin(this.yaw), cs = Math.cos(this.yaw), SP = Math.sin(this.pitch), CP = Math.cos(this.pitch);
    var S = W / this.span, ox = this.focus[0], oy = this.focus[1], oz = this.focus[2], cx = W / 2, cy = H / 2;
    var dx = sn > 0 ? 1 : -1, dz = cs > 0 ? 1 : -1, items = [], polys = this.polys = [];
    var x, y, z, i, j, t, b;

    function open(px, py, pz) { var q = w.type(px, py, pz); return !q || q.liquid || q.size; }
    function depth(px, pz) { return ((Math.floor(px) + 0.5 - ox) * sn + (Math.floor(pz) + 0.5 - oz) * cs) * 1000; }

    for (x = 0; x < w.w; x++) for (z = 0; z < w.d; z++) {
      var kd = depth(x, z);
      for (y = 0; y < w.h; y++) {
        t = w.type(x, y, z);
        if (!t) continue;
        var m = t.size ? 7 : (open(x, y + 1, z) ? 1 : 0) | (open(x + dx, y, z) ? 2 : 0) | (open(x, y, z + dz) ? 4 : 0);
        if (!m) continue;
        var sz = t.size || [1, t.liquid ? 0.85 : 1, 1], pick = { x: x, y: y, z: z, type: t };
        /* A block one level up on the sunny side throws a shadow across this top face. */
        var shade = (m & 1) && !t.size && (w.solid(x - 1, y + 1, z) || w.solid(x, y + 1, z - 1)) ? 0.86 : 1;
        items.push({ x: x + 0.5, y: y + sz[1] / 2, z: z + 0.5, w: sz[0], h: sz[1], d: sz[2], rgb: t.rgb, m: m, key: kd + y, win: t.windows, cell: [x, y, z], pick: pick, ts: shade });
        if (t.details && (m & 1) && !w.get(x, y + 1, z)) for (j = 0; j < t.details.length; j++) {
          var dt = t.details[j];
          if (dt.every && (((x * 73856093) ^ (z * 19349663) ^ ((dt.seed || 0) * 83492791)) >>> 0) % dt.every) continue;
          items.push({ x: x + dt.at[0], y: y + sz[1] + dt.at[1] + dt.size[1] / 2, z: z + dt.at[2], w: dt.size[0], h: dt.size[1], d: dt.size[2], rgb: dt.rgb, m: dt.size[1] < 0.06 ? 1 : 7, key: kd + y + 0.5 + dt.at[1] * 0.01 + j * 0.0001, pick: pick, ts: shade });
        }
      }
    }
    for (i = 0; i < w.bodies.length; i++) {
      b = w.bodies[i];
      var s = b.size * (b.life ? Math.min(1, (b.life - b.age) / 0.4) : 1);
      if (s <= 0) continue;
      items.push({ x: b.x, y: b.y, z: b.z, w: s, h: s, d: s, rgb: w.types[b.type].rgb, m: 7, key: depth(b.x, b.z) + b.y - 0.49 });
    }
    for (i = 0; i < w.agents.length; i++) {
      var bx = w.agents[i].boxes(w);
      var front = -1e9;
      for (j = 0; j < bx.length; j++) {
        b = bx[j];
        front = Math.max(front, depth(b.x - b.w / 2, b.z - b.d / 2), depth(b.x + b.w / 2, b.z - b.d / 2), depth(b.x - b.w / 2, b.z + b.d / 2), depth(b.x + b.w / 2, b.z + b.d / 2));
      }
      for (j = 0; j < bx.length; j++) { b = bx[j]; b.m = 7; b.key = front + b.y - b.h / 2 + 0.02; b.pick = { agent: w.agents[i] }; items.push(b); }
    }
    for (i = 0; i < this.extras.length; i++) {
      b = this.extras[i]; b.m = 7; b.key = ((b.x - ox) * sn + (b.z - oz) * cs) * 1000 + b.y; items.push(b);
    }
    items.sort(function (p, q) { return p.key - q.key; });

    /* Keep what picking needs. Faces are rebuilt only when someone taps. */
    this.view = { sn: sn, cs: cs, SP: SP, CP: CP, S: S, ox: ox, oy: oy, oz: oz, cx: cx, cy: cy };
    ctx.clearRect(0, 0, W, H);
    var lit = this.lit, sxs = sn > 0 ? 1 : -1, szs = cs > 0 ? 1 : -1;
    var shX = 0.76 + 0.15 * (sn > 0 ? cs : -cs), shZ = 0.76 + 0.15 * (cs > 0 ? -sn : sn);
    for (i = 0; i < items.length; i++) {
      b = items[i];
      if (b.pick) polys.push(b);
      /* Project the box centre once, then build every corner from three half-edge vectors. */
      var X = b.x - ox, Z = b.z - oz;
      var px = cx + (X * cs - Z * sn) * S, py = cy + ((X * sn + Z * cs) * SP - (b.y - oy) * CP) * S;
      var ax = b.w / 2 * cs * S, ay = b.w / 2 * sn * SP * S;
      var bx = -b.d / 2 * sn * S, by = b.d / 2 * cs * SP * S;
      var uy = -b.h / 2 * CP * S, fx, fy;
      if (b.m & 2) {
        fx = px + ax * sxs; fy = py + ay * sxs;
        quad(fx - bx, fy - by - uy, fx + bx, fy + by - uy, fx + bx, fy + by + uy, fx - bx, fy - by + uy, b.rgb, shX);
        if (b.win) windows(fx - bx, fy - by - uy, fx + bx, fy + by - uy, fx + bx, fy + by + uy, fx - bx, fy - by + uy, b, shX, 1);
      }
      if (b.m & 4) {
        fx = px + bx * szs; fy = py + by * szs;
        quad(fx - ax, fy - ay - uy, fx + ax, fy + ay - uy, fx + ax, fy + ay + uy, fx - ax, fy - ay + uy, b.rgb, shZ);
        if (b.win) windows(fx - ax, fy - ay - uy, fx + ax, fy + ay - uy, fx + ax, fy + ay + uy, fx - ax, fy - ay + uy, b, shZ, 2);
      }
      if (b.m & 1) {
        fy = py + uy;
        quad(px - ax - bx, fy - ay - by, px + ax - bx, fy + ay - by, px + ax + bx, fy + ay + by, px - ax + bx, fy - ay + by, b.rgb, b.ts || 1);
      }
    }

    /* Colour strings are cached per block colour and shade, so a frame builds almost none. */
    function colour(c, sh) {
      var k = Math.round(sh * 64), cache = c.cache || (c.cache = {});
      return cache[k] || (cache[k] = 'rgb(' + (c[0] * k / 64 | 0) + ',' + (c[1] * k / 64 | 0) + ',' + (c[2] * k / 64 | 0) + ')');
    }
    /* Fill one face. Each corner is pushed out a fraction of a pixel so neighbours
       overlap and no seams show. This is much cheaper than stroking every face. */
    function quad(x0, y0, x1, y1, x2, y2, x3, y3, c, sh) {
      var mx = (x0 + x2) / 2, my = (y0 + y2) / 2, g = 1 + 0.7 / (Math.abs(x0 - mx) + Math.abs(y0 - my) + Math.abs(x1 - mx) + Math.abs(y1 - my) + 0.01) * 2;
      ctx.fillStyle = colour(c, sh);
      ctx.beginPath();
      ctx.moveTo(mx + (x0 - mx) * g, my + (y0 - my) * g);
      ctx.lineTo(mx + (x1 - mx) * g, my + (y1 - my) * g);
      ctx.lineTo(mx + (x2 - mx) * g, my + (y2 - my) * g);
      ctx.lineTo(mx + (x3 - mx) * g, my + (y3 - my) * g);
      ctx.fill();
    }
    /* Two windows per wall. A fixed share glow, chosen by position so they never flicker. */
    function windows(x0, y0, x1, y1, x2, y2, x3, y3, b, sh, side) {
      var c = b.cell;
      for (var k = 0; k < 2; k++) {
        var u0 = k ? 0.58 : 0.16, u1 = u0 + 0.26, on = ((c[0] * 7 + c[1] * 13 + c[2] * 5 + side * 3 + k) % 5) < 2;
        var lx0 = x0 + (x1 - x0) * u0, ly0 = y0 + (y1 - y0) * u0, lx1 = x0 + (x1 - x0) * u1, ly1 = y0 + (y1 - y0) * u1;
        var tx0 = x3 + (x2 - x3) * u0, ty0 = y3 + (y2 - y3) * u0, tx1 = x3 + (x2 - x3) * u1, ty1 = y3 + (y2 - y3) * u1;
        ctx.fillStyle = on ? colour(lit, Math.min(1, sh + 0.05)) : colour(b.rgb, sh * 0.6);
        ctx.beginPath();
        ctx.moveTo(lx0 + (tx0 - lx0) * 0.3, ly0 + (ty0 - ly0) * 0.3);
        ctx.lineTo(lx1 + (tx1 - lx1) * 0.3, ly1 + (ty1 - ly1) * 0.3);
        ctx.lineTo(lx1 + (tx1 - lx1) * 0.72, ly1 + (ty1 - ly1) * 0.72);
        ctx.lineTo(lx0 + (tx0 - lx0) * 0.72, ly0 + (ty0 - ly0) * 0.72);
        ctx.fill();
      }
    }
  };
  /* What is under this canvas pixel? Returns {x,y,z,type} for a block, {agent} for an agent, or null. */
  Renderer.prototype.pick = function (mx, my) {
    var v = this.view;
    if (!v) return null;
    var sxs = v.sn > 0 ? 1 : -1, szs = v.cs > 0 ? 1 : -1;
    function inside(q) {
      var hit = false;
      for (var a = 0, b = 3; a < 4; b = a++)
        if ((q[a][1] > my) !== (q[b][1] > my) && mx < (q[b][0] - q[a][0]) * (my - q[a][1]) / (q[b][1] - q[a][1]) + q[a][0]) hit = !hit;
      return hit;
    }
    for (var i = this.polys.length - 1; i >= 0; i--) {
      var b = this.polys[i], X = b.x - v.ox, Z = b.z - v.oz;
      var px = v.cx + (X * v.cs - Z * v.sn) * v.S, py = v.cy + ((X * v.sn + Z * v.cs) * v.SP - (b.y - v.oy) * v.CP) * v.S;
      var ax = b.w / 2 * v.cs * v.S, ay = b.w / 2 * v.sn * v.SP * v.S;
      var bx = -b.d / 2 * v.sn * v.S, by = b.d / 2 * v.cs * v.SP * v.S;
      var uy = -b.h / 2 * v.CP * v.S, fx, fy;
      if (b.m & 1) { fy = py + uy; if (inside([[px - ax - bx, fy - ay - by], [px + ax - bx, fy + ay - by], [px + ax + bx, fy + ay + by], [px - ax + bx, fy - ay + by]])) return b.pick; }
      if (b.m & 4) { fx = px + bx * szs; fy = py + by * szs; if (inside([[fx - ax, fy - ay - uy], [fx + ax, fy + ay - uy], [fx + ax, fy + ay + uy], [fx - ax, fy - ay + uy]])) return b.pick; }
      if (b.m & 2) { fx = px + ax * sxs; fy = py + ay * sxs; if (inside([[fx - bx, fy - by - uy], [fx + bx, fy + by - uy], [fx + bx, fy + by + uy], [fx - bx, fy - by + uy]])) return b.pick; }
    }
    return null;
  };

  return { World: World, Renderer: Renderer, PathAgent: PathAgent, HopAgent: HopAgent, rng: rng, rgb: rgb, STEP: STEP };
});
