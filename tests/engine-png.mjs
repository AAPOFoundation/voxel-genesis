// Frozen Stage 2b: PNG bytes through world_open (2026-11-20).
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, unlinkSync, readdirSync }
  from 'node:fs';
import { resolve, join, relative } from 'node:path';
import { deflateSync } from 'node:zlib';
import { createRequire } from 'node:module';
const failures = [], notes = [];
const check = (n, ok, detail) => {
  if (!ok) failures.push({ rule: 'png', detail: 'case ' + n + ': ' + detail });
};
mkdirSync('.agent-work/engine-png', { recursive: true });
const home = () => mkdtempSync(resolve('.agent-work/engine-png/run-'));
process.env.VOXEL_GENESIS_HOME = home();
process.env.VOXEL_GENESIS_PORT = '0';
process.env.VOXEL_GENESIS_NO_LOG = '1';
delete process.env.VOXEL_GENESIS_KIT;
const { createToolSession } = await import('../src/session.mjs');
const { summary } = await import('../src/core/codec.mjs');
const { createCore } = await import('../src/core/index.mjs');
const core = createCore(createRequire(import.meta.url)('../vendor/voxel-engine.js'));
const session = (h = home()) => createToolSession({ home: h });
const call = (s, tool, args) => {
  try { return s.call(tool, args); } catch (error) {
    if (!error.code) throw error;
    return { ok: false, code: error.code, message: error.message };
  }
};
const refused = r => r?.ok === false || Boolean(r?.code);
const shape = s => s.world && JSON.stringify({ rev: s.world.rev, ...summary(s.world) });
const open = (s, args) => call(s, 'world_open', args);
const pngOpen = (s, name, from) => {
  const start = performance.now(), reply = open(s, { name, from });
  notes.push(name + ': reply ' + Buffer.byteLength(JSON.stringify(reply)) +
    ' bytes, ' + (performance.now() - start).toFixed(2) + ' ms');
  return reply;
};
// Minimal 8-bit, non-interlaced PNG writer; filter 0, valid chunk CRCs, no dependencies.
const chunk = (name, data) => {
  const body = Buffer.concat([Buffer.from(name), data]), out = Buffer.alloc(data.length + 12);
  let crc = 0xffffffff;
  for (const byte of body) {
    crc ^= byte;
    for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  out.writeUInt32BE(data.length); body.copy(out, 4);
  out.writeUInt32BE((crc ^ 0xffffffff) >>> 0, out.length - 4);
  return out;
};
const png = (w, h, channels, pixel) => {
  const head = Buffer.alloc(13), stride = w * channels + 1, raw = Buffer.alloc(stride * h);
  head.writeUInt32BE(w); head.writeUInt32BE(h, 4);
  head[8] = 8; head[9] = channels === 3 ? 2 : 6;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    raw.set(pixel(x, y), y * stride + 1 + x * channels);
  }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', head), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
};
// Frozen palette colours and glyphs; 32px areas become 16-cell areas (96 -> 48).
const blocks = [
  ['grass', [143, 179, 90], '.'], ['water', [90, 169, 201], '~'],
  ['road', [61, 58, 54], '#'], ['brick', [190, 87, 39], 'B'], ['leaf', [79, 138, 74], '*']
];
const areas = [0, 1, 2, 3, 4, 0, 1, 2, 3];
const grid = png(96, 96, 3, (x, y) => blocks[areas[Math.floor(y / 32) * 3 +
  Math.floor(x / 32)]][1]);
let seed = 0x13579bdf;
const noise = png(60, 40, 4, () => {
  seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
  return [seed & 255, (seed >>> 8) & 255, (seed >>> 16) & 255, seed >>> 24];
});
const images = home();
for (const [kind, bytes] of [['grid', grid], ['noise', noise]]) {
  const path = join(images, kind + '.png'), copy = join(images, kind + '-copy.png');
  writeFileSync(path, bytes); writeFileSync(copy, bytes);
  const runs = [];
  for (let i = 0; i < 4; i++) {
    const h = home(), s = session(h), name = kind + '-' + i;
    const reply = pngOpen(s, name, i === 3 ? copy : path);
    runs.push({ h, s, name, reply });
    check(1, !refused(reply) && Boolean(s.world), name + ' one call, 0 refused');
    check(1, Boolean(s.world) && reply.hash === summary(s.world).hash &&
      reply.rev === s.world.rev && reply.count === summary(s.world).count,
    name + ' reply hash/rev/count');
  }
  // Open replies omit physics counters; replay their saved ops to measure every batch.
  const first = runs[0];
  let clean = false;
  if (first.s.world && first.s.logPath) {
    const rows = readFileSync(first.s.logPath, 'utf8').trim().split('\n');
    const [h, ...records] = rows.map(JSON.parse);
    let w = core.newWorld({ size: h.size, seed: h.seed, set: h.set, rules: h.rules });
    clean = records.length > 0;
    for (const row of records) {
      const next = core.applyBatch(w, row.ops);
      clean &&= ['fell', 'lost', 'sank'].every(key => next.result[key] === 0);
      w = next.world;
    }
  }
  check(1, clean, kind + ' fell/lost/sank all zero');
  const want = shape(first.s);
  check(2, Boolean(want) && runs.slice(0, 3).every(r => shape(r.s) === want),
    kind + ' three fresh homes: same hash/rev/count');
  check(2, Boolean(first.s.world) && Boolean(runs[3].s.world) &&
    summary(first.s.world).hash === summary(runs[3].s.world).hash,
  kind + ' same bytes at another path: same hash');
  if (kind === 'grid') for (const [i, id] of areas.entries()) {
    const x = (i % 3) * 16 + 8, z = Math.floor(i / 3) * 16 + 8;
    const look = call(first.s, 'world_look', { view: 'top', at: [x, z, x, z] });
    check(3, typeof look === 'string' && look.split('\n')[1] === blocks[id][2],
      'area ' + i + ' centre ' + blocks[id][0] + ' glyph');
  }
  unlinkSync(path); unlinkSync(copy);
  const loaded = session(first.h), reply = open(loaded, { name: first.name });
  check(4, Boolean(first.s.world) && !refused(reply) && Boolean(loaded.world) &&
    summary(loaded.world).hash === summary(first.s.world).hash,
  kind + ' reload from log after deleting PNG');
}
const bad = join(images, 'not-png.png'), valid = join(images, 'relative.png');
writeFileSync(bad, 'not a PNG'); writeFileSync(valid, grid);
for (const [label, from] of [['non-PNG', bad], ['missing', join(images, 'missing.png')],
  ['relative', relative(process.cwd(), valid)]]) {
  const h = home(), s = session(h), reply = pngOpen(s, 'invalid', from);
  check(5, reply.ok === false && !s.world && readdirSync(join(h, 'worlds')).length === 0,
    label + ' refused, world not created');
}
for (const name of ['small-town', 'tiny-garden', 'hill-village']) {
  const s = session(), reply = open(s, { name, from: name });
  check(6, !refused(reply) && Boolean(s.world), name + ' named open');
  if (name === 'small-town') {
    const f = JSON.parse(readFileSync('fixtures/small-town.json', 'utf8')), reference = session();
    const replies = [open(reference, f.open)];
    for (const ops of f.batches) replies.push(call(reference, 'world_build', { ops }));
    check(6, replies.every(r => !refused(r)) && Boolean(reference.world) &&
      reply.hash === summary(reference.world).hash, name + ' fixture hash');
  }
}
{
  const s = session(), reply = open(s, { name: 'order-bad', size: [160, 64, 160] });
  const text = String(reply?.message ?? '');
  check('7 size-order', refused(reply) && !s.world && text.includes('width, depth, height') &&
    text.includes('[160, 160, 64]'), 'refusal needs width, depth, height and [160, 160, 64]: ' +
    text);
  const ok = session(), good = open(ok, { name: 'order-ok', size: [160, 160, 64] });
  check('7 size-order', !refused(good) && Boolean(ok.world), '[160, 160, 64] must open');
  const lower = join(images, 'case.png'), upper = join(images, 'case.PNG');
  writeFileSync(lower, grid); writeFileSync(upper, grid);
  const a = session(), b = session(), ra = open(a, { name: 'case-a', from: lower });
  const rb = open(b, { name: 'case-b', from: upper });
  check('8 png-case', !refused(rb) && Boolean(b.world) && Boolean(a.world) &&
    summary(b.world).hash === summary(a.world).hash, '.PNG must open with the .png hash: ' +
    (rb?.message ?? ''));
}
for (const note of notes) console.log('info png: ' + note);
for (const failure of failures) console.log('FAIL ' + failure.rule + ': ' + failure.detail);
for (let n = 1; n <= 6; n++) if (!failures.some(f => f.detail.startsWith('case ' + n + ':'))) {
  console.log('PASS png: case ' + n);
}
console.log('engine-png: ' + failures.length + ' failures');
process.exitCode = failures.length ? 1 : 0;
