// Cache the static canvas image and repaint only regions containing moving geometry.
import { pick } from './pick.mjs';
import { visibleBody } from './geometry.mjs';
import { tapMarks } from './tap.mjs';
function project(renderer, x, y, z) {
  const scale = renderer.canvas.width / renderer.span;
  const [ox, oy, oz] = renderer.focus;
  const sine = Math.sin(renderer.yaw);
  const cosine = Math.cos(renderer.yaw);
  return [
    renderer.canvas.width / 2 + ((x - ox) * cosine - (z - oz) * sine) * scale,
    renderer.canvas.height / 2 + (
      ((x - ox) * sine + (z - oz) * cosine) * Math.sin(renderer.pitch) - (y - oy) * Math.cos(
        renderer.pitch
      )
    ) * scale
  ];
}
function bounds(renderer, box) {
  const points = [];
  for (const x of [- 1, 1]) {
    for (const y of [- 1, 1]) {
      for (const z of [- 1, 1]) {
        points.push(
          project(
            renderer,
            box.x + x * box.w / 2,
            box.y + y * box.h / 2,
            box.z + z * box.d / 2
          )
        );
      }
    }
  }
  return [
    Math.min(...points.map(point => point[0])) - 2,
    Math.min(...points.map(point => point[1])) - 2,
    Math.max(...points.map(point => point[0])) + 2,
    Math.max(...points.map(point => point[1])) + 2
  ];
}
const intersects = (left, right) => left[0] <= right[2] && left[2] >= right[0] &&
left[1] <= right[3] && left[3] >= right[1];
function paintMarks(renderer, marks) {
  if (!marks.length) return;
  const context = renderer.canvas.getContext('2d');
  const scale = renderer.canvas.width / renderer.span;
  context.save();
  context.globalAlpha = 0.85;
  context.lineWidth = Math.max(1.5, scale * 0.06);
  for (const mark of marks) {
    const [px, py] = project(renderer, mark.x, mark.y, mark.z);
    const rx = Math.max(3, mark.w * scale * 0.7);
    const ry = Math.max(2, rx * Math.sin(renderer.pitch));
    context.beginPath();
    context.strokeStyle = 'rgb(' + mark.rgb.join(',') + ')';
    context.ellipse(px, py, rx, ry, 0, 0, Math.PI * 2);
    context.stroke();
  }
  context.restore();
}
/** Wrap the vendored renderer without modifying engine code or canonical world state. */
export class CachedCanvasRenderer {
  constructor(engine, canvas, world, { reduced = false } = {}) {
    this.engine = engine;
    this.canvas = canvas;
    this.world = world;
    this.kind = 'canvas';
    this.reduced = reduced;
    this.yaw = 0.7;
    this.pitch = 0.56;
    this.span = Math.max(world.w, world.d) * 1.5;
    this.focus = [world.w / 2, 2, world.d / 2];
    this.surface = canvas.ownerDocument.createElement('canvas');
    this.staticRenderer = new engine.Renderer(this.surface, world);
    this.dynamicRenderer = new engine.Renderer(canvas, world);
    this.key = '';
    this.rebuilds = 0;
  }
  pick(px, py) {
    return pick(this.world, this, this.canvas.width, this.canvas.height, px, py);
  }
  render() {
    const world = this.world;
    if (this.watchedWorld !== world) {
      this.dispose();
      this.watchedWorld = world;
      this.originalSet = world.set;
      const renderer = this;
      this.watchedSet = function (x, y, z, id) {
        if (this.get(x, y, z) !== id) {
          renderer.key = '';
        }
        return renderer.originalSet.call(this, x, y, z, id);
      };
      world.set = this.watchedSet;
    }
    const camera = {
      yaw: this.yaw,
      pitch: this.pitch,
      span: this.span,
      focus: this.focus
    };
    const key = JSON.stringify(
      [world.rev, world.opsApplied, this.canvas.width, this.canvas.height, camera]
    );
    // During settling, canonical cells can change between frames within one operation.
    if (
      this.key !== key || this.cachedWorld !== world || world.bodies.length ||
      world.dirty
    ) {
      this.surface.width = this.canvas.width;
      this.surface.height = this.canvas.height;
      const staticWorld = Object.create(world);
      staticWorld.agents = [];
      staticWorld.bodies = [];
      Object.assign(this.staticRenderer, camera, { world: staticWorld });
      this.staticRenderer.render();
      this.regions = this.staticRenderer.polys.map(
        box => (
          {
            box,
            area: bounds(this, box),
            index: box.cell ? (box.cell[1] * world.d + box.cell[2]) * world.w +
            box.cell[0]: - 1
          }
        )
      );
      this.key = key;
      this.cachedWorld = world;
      this.rebuilds++;
    }
    const context = this.canvas.getContext('2d');
    context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    context.drawImage(this.surface, 0, 0);
    const moving = world.agents.flatMap(agent => agent.boxes(world));
    const bodies = world.bodies.map(visibleBody).filter(body => body.size > 0);
    for (const body of bodies) {
      moving.push({ ...body, w: body.size, h: body.size, d: body.size });
    }
    const time = this.reduced ? 0 : performance.now() / 1000;
    if (moving.length) {
      const areas = moving.map(box => bounds(this, box));
      const visible = new Set(
        this.regions.filter(region => areas.some(area => intersects(region.area, area))).map(
          region => region.index
        )
      );
      const dynamicWorld = Object.create(world);
      dynamicWorld.bodies = bodies;
      dynamicWorld.type = (x, y, z) => visible.has((y * world.d + z) * world.w + x) ?
      world.type(x, y, z): null;
      context.save();
      context.beginPath();
      for (const [left, top, right, bottom] of areas) {
        context.rect(left, top, right - left, bottom - top);
      }
      context.clip();
      Object.assign(this.dynamicRenderer, camera, { world: dynamicWorld });
      this.dynamicRenderer.render();
      context.restore();
    }
    paintMarks(this, tapMarks(world, { reduced: this.reduced, time }));
  }
  dispose() {
    if (this.watchedWorld && this.watchedWorld.set === this.watchedSet) {
      this.watchedWorld.set = this.originalSet;
    }
    this.watchedWorld = null;
    this.regions = [];
    this.cachedWorld = null;
  }
}
