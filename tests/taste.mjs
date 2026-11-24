// Check palette, motion, copy and renderer work without claiming visual approval.
import { readFileSync, writeFileSync, existsSync, mkdirSync, mkdtempSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';
import { BLOCKS, ALLOWED } from '../src/core/palette.mjs';
import { PREFABS } from '../src/core/prefabs.mjs';
import { OPS } from '../src/core/ops.mjs';
import { createCore } from '../src/core/index.mjs';
import { MOTION, createPlayer } from '../viewer/player.mjs';
import { C, TOOL_COPY } from '../src/copy.mjs';
import { buildMesh, buildDynamicMesh } from '../viewer/gl-renderer.mjs';
import { encode, hash } from '../src/core/codec.mjs';
import { CachedCanvasRenderer } from '../viewer/canvas-renderer.mjs';
import { checkLayout } from './layout.mjs';
import { checkKitTaste } from './kit-view.mjs';
import { checkKitArc } from './kit-bundles.mjs';
mkdirSync('.agent-work/taste', { recursive: true });
process.env.VOXEL_GENESIS_HOME = mkdtempSync(resolve('.agent-work/taste/run-'));
const E = createRequire(import.meta.url)('../vendor/voxel-engine.js');
const core = createCore(E);
const failures = [];
const check = (rule, ok, detail = '') => {
  if (!ok) {
    failures.push({ rule, detail });
  }
};
const html = readFileSync('viewer/index.html', 'utf8');
const viewer = readFileSync('viewer/viewer.mjs', 'utf8');
const css = html.match(/<style>([\s\S]*?)<\/style>/)[1];
checkLayout(html, check);
await checkKitTaste({ check, html, css, viewer, ALLOWED, core, E });
checkKitArc({ check, core });
for (const b of BLOCKS) {
  check('palette', ALLOWED.includes(b.colour), b.name);
  for (const d of b.details || []) {
    check('palette', ALLOWED.includes(d.color), b.name + ' detail');
  }
}
for (const colour of css.match(/#[a-fA-F0-9]{6}/g) || []) {
  check('palette', ALLOWED.includes(colour.toLowerCase()), colour);
}
check(
  'palette',
  /background:\s*#f8f4ed/.test(css) && /color:\s*#1d1d1d/.test(css) &&
  css.includes('#be5727') && css.includes('#fdb817'),
  'page colours'
);
check(
  'motion-caps',
  MOTION.turnSpeed <=.6 && MOTION.carSpeed <= 2.5 && MOTION.opGap >= 80 &&
  MOTION.opGap <= 250 && MOTION.autoRotate === false,
  'player motion'
);
check(
  'motion-caps',
  !css.includes('infinite') && ![...css.matchAll(/transition[^;]*?([\d.]+)(ms|s)/g)].some(
    m => Number(m[1]) * (m[2] === 's' ? 1000: 1) > 300
  ),
  'CSS motion'
);
check(
  'reduced-motion',
  css.includes('prefers-reduced-motion: reduce') && viewer.includes('matchMedia'),
  'preference'
);
const median = a => [...a].sort((a, b) => a - b)[Math.floor(a.length / 2)];
const renderMetrics = [];
for (const [name, limit] of [['tiny-garden', 4], ['small-town', 4], ['hill-village', 8]]) {
  const f = JSON.parse(readFileSync('fixtures/' + name + '.json'));
  let w = core.newWorld(f.open);
  for (const ops of f.batches) {
    w = core.applyBatch(w, ops).world;
  }
  const ctx = new Proxy({}, { get: () => () => {} });
  const renderer = new E.Renderer(
    { width: 1280, height: 800, clientWidth: 1280, getContext: () => ctx },
    w
  );
  const times = [];
  for (let i = 0; i < 35; i++) {
    const t = performance.now();
    renderer.render();
    if (i >= 5) {
      times.push(performance.now() - t);
    }
  }
  const meshTimes = [];
  const dynamicTimes = [];
  const player = createPlayer(E);
  player.load(
    {
      world: w.name,
      size: [w.w, w.d, w.h],
      seed: w.seed,
      rev: w.rev,
      rle: encode(w.cells),
      life: w.life,
      opsApplied: w.opsApplied,
      hash: hash(w)
    }
  );
  let mesh;
  for (let i = 0; i < 35; i++) {
    const t = performance.now();
    mesh = buildMesh(w);
    const built = performance.now();
    buildDynamicMesh(player.world);
    const end = performance.now();
    if (i >= 5) {
      meshTimes.push(built - t);
      dynamicTimes.push(end - built);
    }
  }
  const meshMs = median(meshTimes);
  const dynamicMs = median(dynamicTimes);
  renderMetrics.push(
    {
      fixture: name,
      canvasMs: median(times),
      canvasLimitMs: limit,
      meshMs,
      dynamicMs,
      vertices: mesh.length / 8,
      meshBytes: mesh.byteLength
    }
  );
  check(
    'frame-budget',
    meshMs <= 30 && dynamicMs <= 2,
    name + ' mesh ' + meshMs.toFixed(2) + ' ms, dynamic ' + dynamicMs.toFixed(2) +
    ' ms'
  );
}
writeFileSync('.agent-work/renderer-metrics.json', JSON.stringify(renderMetrics, null, 2) + '\n');
if (existsSync('bench.json')) {
  const b = JSON.parse(readFileSync('bench.json'));
  check('frame-budget', b.p95 <= 8 && b.gapP95 <= 18, 'browser bench');
}
const banned = new RegExp(
  "\\b(blast|explode|explosion|destroy|demolish|smash|crush|" +
  "kill|die|dead|bomb|shoot|gun|weapon|" +
  "attack|fight|war)\\b",
  "i"
);
const spelling = new RegExp(
  "\\b(color|center|gray|neighbor|meter|organize|" + "summarize|initialize|behavior|favorite)\\b",
  "i"
);
const sentences = [
  ...Object.values(C).filter(v => typeof v === 'string'),
  ...Object.values(C.error),
  ...TOOL_COPY.map(t => t.description),
  readFileSync('README.md', 'utf8').replace(/\x60{3}[\s\S]*?\x60{3}/g, '').replace(
    /\x60[^\x60]*\x60/g,
    ''
  )
];
for (const text of sentences) {
  check(
    'copy-rules',
    !banned.test(text) && !spelling.test(text) && !/[\u2013\u2014!]/.test(text),
    text.slice(0, 65)
  );
  for (const sentence of text.replace(/\[[^\]]*\]/g, '').split(/[.\n?]+/)) {
    check('copy-rules', sentence.trim().split(/\s+/).length <= 20, sentence.trim().slice(0, 90));
  }
}
check(
  'copy-rules',
  readFileSync('src/copy.mjs', 'utf8').includes('COPY-DRAFT') &&
  readFileSync('README.md', 'utf8').includes('COPY-DRAFT'),
  'draft marker'
);
const names = [
  'build', 'grow', 'auto', 'turn', 'road', 'home', 'shop', 'work', 'park',
  ...TOOL_COPY.map(t => t.name.slice(6)),
  ...Object.keys(OPS),
  'rep',
  ...BLOCKS.map(b => b.name),
  ...Object.keys(PREFABS)
];
for (const name of names) {
  check('family-names', /^[a-z]+$/.test(name) && !banned.test(name), name);
}
try {
  const { town } = await import('../src/games/town.mjs');
  const { botBatches } = await import('../scripts/town-bot.mjs');
  const textValues = value => typeof value === 'string' ? [value]
    : Object.values(value).flatMap(textValues);
  for (const text of textValues(C.town)) {
    check('copy-rules', !banned.test(text) && !spelling.test(text) &&
      !/[\u2013\u2014!]/.test(text), text);
  }
  const hud = html.match(/<section id="hud"[\s\S]*?<\/section>/)?.[0] || '';
  check('town-hud', hud.includes('aria-live="polite"') && hud.includes('<progress') &&
    !hud.includes('<button') && css.includes('accent-color: #fdb817'), 'HUD structure');
  const batches = botBatches(7);
  check('town-arc', batches.filter(ops => ops.length > 1).length >= 18 &&
    batches.every(ops => ops.length <= 7), 'activity');
  let world = core.newWorld({ size: town.size, rules: town.id, seed: 7 });
  for (const [index, ops] of batches.entries()) {
    world = core.applyBatch(world, ops).world;
    if (index === 0) check('town-arc', town.hud(world).people > 0, 'first people');
  }
  const ctx = new Proxy({}, { get: () => () => {} });
  const surface = () => ({ width: 1280, height: 800, clientWidth: 1280,
    getContext: () => ctx, ownerDocument: { createElement: () => surface() } });
  const renderer = new CachedCanvasRenderer(E, surface(), world);
  const times = [];
  for (let i = 0; i < 35; i++) {
    const start = performance.now();
    renderer.render();
    if (i >= 5) times.push(performance.now() - start);
  }
  const ms = median(times);
  check('town-hud', ms <= 6, 'canvas proxy ' + ms.toFixed(2) + ' ms');
  check('town-hud', renderer.rebuilds === 1, 'static town painted once');
  renderer.dispose();
  writeFileSync('.agent-work/town-renderer.json', JSON.stringify({ canvasMs: ms,
    rebuilds: renderer.rebuilds, renderer: 'cached-canvas' }) + '\n');
} catch (error) {
  check('town-hud', false, error.message);
}
for (const f of failures) {
  console.log('FAIL ' + f.rule + ': ' + f.detail);
}
console.log('taste: ' + failures.length + ' failures');
process.exitCode = failures.length ? 1: 0;
