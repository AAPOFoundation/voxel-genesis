// Frozen PNG-note viewer checks: hide provenance without changing the saved world.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { createPanel } from '../viewer/kit-panel.mjs';
const failures = [];
const check = (rule, ok, detail = '') =>
  ok || !failures.push({ rule, detail: String(detail).replaceAll('\n', ' / ') });
const test = async (rule, fn) => {
  try { await fn(); } catch (error) { check(rule, false, error.message); }
};
mkdirSync('.agent-work/engine-note', { recursive: true });
const home = () => mkdtempSync(resolve('.agent-work/engine-note/run-'));
process.env.VOXEL_GENESIS_HOME = home();
process.env.VOXEL_GENESIS_PORT = '0';
process.env.VOXEL_GENESIS_NO_LOG = '1';
delete process.env.VOXEL_GENESIS_KIT;
const { createToolSession } = await import('../src/session.mjs');
const { hash } = await import('../src/core/codec.mjs');
const document = {
  createElement(tag) {
    return { tagName: tag.toUpperCase(), children: [], attrs: {}, hidden: false, own: '',
      get textContent() { return this.own + this.children.map(n => n.textContent).join(''); },
      set textContent(value) { this.children = []; this.own = String(value ?? ''); },
      setAttribute(key, value) { this.attrs[key] = String(value); },
      replaceChildren(...children) { this.own = ''; this.children = children; } };
  }
};
const model = { chips: [], objective: '', talk: null };
const img = 'img sha256:' + 'a'.repeat(64) + ' v1';
const plain = ['First note', 'Second note', 'Third note', 'Fourth note'];
const cases = [
  [1, [img], []],
  [2, [img, 'Seaside town'], ['Seaside town']],
  [3, [...plain, img], plain.slice(-3)],
  [4, plain.slice(0, 3), plain.slice(0, 3)]
];
for (const [rule, lines, want] of cases) await test(rule, () => {
  const root = document.createElement('section'), speech = document.createElement('section');
  const feed = document.createElement('section');
  feed.setAttribute('id', 'feed');
  createPanel(document, root, speech, feed).update(model, lines.map(says => ({ says })));
  const got = feed.children.map(n => n.textContent);
  check(rule, feed.hidden === !want.length && feed.children.every(n => n.tagName === 'P') &&
    JSON.stringify(got) === JSON.stringify(want),
  'hidden=' + feed.hidden + ', children=' + JSON.stringify(got));
});
// Same filter-0 PNG encoding and CRC algorithm as engine-png, with a 2x2 grass picture.
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
await test(5, () => {
  const head = Buffer.alloc(13), raw = Buffer.alloc(14);
  head.writeUInt32BE(2); head.writeUInt32BE(2, 4); head[8] = 8; head[9] = 2;
  for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
    raw.set([143, 179, 90], y * 7 + 1 + x * 3);
  }
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', head), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
  const h = home(), path = join(h, 'grass.png'), name = 'note-grass';
  writeFileSync(path, png);
  const s = createToolSession({ home: h });
  s.call('world_open', { name, from: path });
  // Pin captured on pkg/png-note before the viewer implementation changes.
  const expected = 'f45d42fc';
  const note = 'img sha256:' + createHash('sha256').update(png).digest('hex') + ' v1';
  const saved = createToolSession({ home: h });
  saved.call('world_open', { name });
  check(5, hash(s.world) === expected && hash(saved.world) === expected &&
    s.world.feed.some(entry => entry.says === note) &&
    saved.world.feed.some(entry => entry.says === note),
  'opened hash=' + hash(s.world) + ', saved hash=' + hash(saved.world) +
    ', feed=' + JSON.stringify(saved.world.feed));
});
for (const failure of failures) console.log('FAIL case ' + failure.rule + ': ' + failure.detail);
for (let n = 1; n <= 5; n++) if (!failures.some(f => f.rule === n)) {
  console.log('PASS case ' + n);
}
process.exitCode = failures.length ? 1 : 0;
console.log('engine-note: ' + failures.length + ' failures');
