// Decode PNG pixels and expand deterministic v1 image columns into saved build batches.
import { inflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { BLOCKS } from './core/palette.mjs';
import { failure } from './errors.mjs';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const RGB = BLOCKS.map(b => [1, 3, 5].map(i => parseInt(b.colour.slice(i, i + 2), 16)));
// v1 fixed column heights above grass (y=1 through height, inclusive).
const HEIGHTS = Object.freeze({ brick: 3, cream: 3, sun: 3, slate: 3,
  roof: 2, timber: 2, trunk: 4, leaf: 1, needle: 1,
  plaster: 3, amber: 3, blue: 3, tile: 2 });
const div = (a, b) => Math.floor(a / b);
const ceil = (a, b) => div(a + b - 1, b);
const refuse = () => { throw failure('fromPNG'); };
function crc32(data) {
  let crc = 0xffffffff;
  for (const b of data) {
    crc ^= b;
    for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function paeth(a, b, c) {
  const p = a + b - c, x = Math.abs(p - a), y = Math.abs(p - b), z = Math.abs(p - c);
  return x <= y && x <= z ? a : y <= z ? b : c;
}
function decodePNG(bytes) {
  if (!bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) refuse();
  let w, h, channels, ended = false, dataEnded = false, palette = false;
  const parts = [];
  for (let p = 8; p < bytes.length;) {
    if (p + 12 > bytes.length || ended) refuse();
    const n = bytes.readUInt32BE(p), end = p + 12 + n;
    if (end > bytes.length) refuse();
    const type = bytes.toString('ascii', p + 4, p + 8), data = bytes.subarray(p + 8, p + 8 + n);
    if (!/^[A-Za-z]{4}$/.test(type) || type[2] !== type[2].toUpperCase() ||
      crc32(bytes.subarray(p + 4, p + 8 + n)) !== bytes.readUInt32BE(p + 8 + n)) refuse();
    if (!w && type !== 'IHDR') refuse();
    if (type === 'IHDR') {
      if (w || n !== 13) refuse();
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      if (!w || !h || w > 0x7fffffff || h > 0x7fffffff || data[8] !== 8 ||
        ![2,6].includes(data[9]) || data[10] || data[11] || data[12]) refuse();
      channels = data[9] === 2 ? 3 : 4;
    } else if (type === 'IDAT') {
      if (dataEnded) refuse();
      parts.push(data);
    } else {
      if (parts.length) dataEnded = true;
      if (type === 'IEND') {
        if (n || !parts.length || end !== bytes.length) refuse();
        ended = true;
      } else if (type === 'PLTE') {
        if (palette || parts.length || n < 3 || n > 768 || n % 3) refuse();
        palette = true;
      } else if (['tRNS', 'acTL', 'fcTL', 'fdAT'].includes(type) ||
        type[0] === type[0].toUpperCase()) refuse();
    }
    p = end;
  }
  if (!ended) refuse();
  const stride = w * channels, length = (stride + 1) * h;
  if (!Number.isSafeInteger(length) || length > 256 * 1024 * 1024) refuse();
  const result = inflateSync(Buffer.concat(parts), { maxOutputLength: length, info: true });
  if (result.buffer.length !== length ||
    result.engine.bytesWritten !== parts.reduce((n,p) => n+p.length,0)) refuse();
  const raw = result.buffer, pixels = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    const filter = raw[y * (stride + 1)];
    if (filter > 4) refuse();
    for (let x = 0; x < stride; x++) {
      const i = y * stride + x, a = x >= channels ? pixels[i-channels] : 0;
      const b = y ? pixels[i-stride] : 0, c = y && x >= channels ? pixels[i-stride-channels] : 0;
      const predict = [0, a, b, div(a+b,2), paeth(a,b,c)][filter];
      pixels[i] = (raw[y*(stride+1)+1+x] + predict) & 255;
    }
  }
  return { w, h, channels, pixels };
}
function snapGrid({ w, h, channels, pixels }) {
  const cell = ceil(Math.max(w,h),48);
  const width = Math.max(8,ceil(w,cell)), depth = Math.max(8,ceil(h,cell));
  const grass = BLOCKS.findIndex(b => b.name === 'grass');
  const grid = Array.from({ length: depth }, () => Array(width).fill(grass));
  for (let z = 0; z < ceil(h,cell); z++) for (let x = 0; x < ceil(w,cell); x++) {
    const sum = [0,0,0]; let count = 0;
    for (let py = z*cell; py < Math.min(h,(z+1)*cell); py++) {
      for (let px = x*cell; px < Math.min(w,(x+1)*cell); px++) {
        const i = (py*w+px)*channels;
        for (let k = 0; k < 3; k++) {
          sum[k] += channels === 4 && pixels[i+3] < 128 ? RGB[grass][k] : pixels[i+k];
        }
        count++;
      }
    }
    const avg = sum.map(n => div(n,count)); let best = 0, distance = Infinity;
    RGB.forEach((rgb,i) => {
      const d = rgb.reduce((n,v,k) => n+(v-avg[k])*(v-avg[k]),0);
      if (d < distance) { distance = d; best = i; }
    });
    grid[z][x] = best;
  }
  return { width, depth, cell, grid };
}
export function convert(bytes) {
  const { width, depth, grid } = snapGrid(decodePNG(bytes));
  const hash = sha(bytes), batches = []; let batch = [], writes = 0;
  const add = (op, cost) => {
    if (batch.length >= 200 || writes + cost >= 20000) {
      batches.push(batch); batch = []; writes = 0;
    }
    batch.push(op); writes += cost;
  };
  add(['note', 'img sha256:' + hash + ' v1'], 0);
  const seen = grid.map(row => row.map(() => false));
  for (let z = 0; z < depth; z++) for (let x = 0; x < width; x++) {
    if (seen[z][x]) continue;
    const id = grid[z][x]; let right = x, bottom = z;
    while (right+1 < width && !seen[z][right+1] && grid[z][right+1] === id) right++;
    outer: while (bottom+1 < depth) {
      for (let xx = x; xx <= right; xx++) {
        if (seen[bottom+1][xx] || grid[bottom+1][xx] !== id) break outer;
      }
      bottom++;
    }
    for (let zz = z; zz <= bottom; zz++) for (let xx = x; xx <= right; xx++) seen[zz][xx] = true;
    const block = BLOCKS[id], area = (right-x+1)*(bottom-z+1);
    if (block.fixed) add(['paint', block.name, x,z,right,bottom],area);
    else {
      const height = HEIGHTS[block.name];
      if (!Number.isInteger(height)) refuse();
      add(['box', block.name, x,1,z,right,height,bottom],area*height);
    }
  }
  if (batch.length) batches.push(batch);
  return { open: { name: 'img-' + hash.slice(0,24), size: [width,depth,8], seed: 1 }, batches };
}
