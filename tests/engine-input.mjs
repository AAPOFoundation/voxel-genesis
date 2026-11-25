// Frozen engine input checks.
// Run alone: node tests/engine-input.mjs. Not imported by the four suites until wave 4 merges.
// Judgements, each the least specific reading that still proves the behaviour:
// - pick-cells: targets are full, non-liquid cells with an empty cell above, whose top face
//   centre has a clear line to the viewer by an exact grid march along the renderers' depth
//   axis (sin yaw cos pitch, sin pitch, cos yaw cos pitch). A target is left out when that
//   line meets a liquid or part-size block, or when its centre projects off the canvas. The
//   centre is projected with the canvas renderer's maths (the GL shader's is the same) and
//   passed to pick as a float pixel. Yaws are 0.7 plus k eighths of pi, pitch 0.56 as both
//   renderers set it, focus and span from fitCamera. A hit is right when x, y and z match;
//   face only has to be present and the same on every top hit. Sky is pixel (1, 1) at zoom 1
//   and 2, inside fitCamera's margin; zoom 0.6 can fill the corner, so it has no sky probe.
// - Cells visited: pick gets a view of the world whose own get and cells count distinct cell
//   indices. World.prototype.get is the vendored engine's public cell lookup: type, solid and
//   top all go through this.get, so the wrapper sees them; the cells proxy catches direct
//   reads. A hit with no cell read fails, since then the lookup was bypassed.
// - The route is driven raw on loopback with content-type application/json. Accepted is any
//   2xx; refused is 400 or more or a dropped connection. A foreign Origin or Host is 403, as
//   /shot answers today. /shot today checks Origin only when one is sent, so an input with no
//   Origin must be treated as /shot treats it, probed at run time.
// - Rate: bursts start just after a whole second, so a sliding or a fixed window both see
//   them; batches are 1.1 s apart. Waiting is every input posted to the world; no rule posts
//   more than 32 except input-route, which never looks, so any reading of waiting holds.
// - n is read from HOME/inputs/NAME.jsonl; `of` is the first n less one, so n may start at
//   0 or 1. A record's rev is the world rev; place is not checked on records.
// - A look line is one starting with a number; other lines are allowed. When not every line
//   fits in 600 bytes the oldest after N are shown, in order, with no gap. A key line only has
//   to name the key; a click line holds `click X,Y,Z`, and `place ID` only inside a place.
// - Hint: K is the count of inputs past the session's cursor. A look of view input that lists
//   every waiting input brings the cursor level, whatever else moves it.
// - J5 bytes are arguments JSON plus reply text for one look and one build, as J4 counted.
import { readFileSync, mkdirSync, mkdtempSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { request } from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
const failures = [], notes = [];
const check = (rule, ok, detail = '') =>
  ok || !failures.push({ rule, detail: String(detail).replaceAll('\n', ' / ') });
const info = (topic, text) => notes.push(topic + ': ' + text);
const test = (rule, fn) => Promise.resolve().then(fn).catch(error =>
  check(rule, false, String(error.message).split('\n')[0].slice(0, 160)));
const only = process.argv.find(arg => arg.startsWith('--only='))?.slice(7).split(',');
const run = (rule, fn) => !only || only.includes(rule) ? test(rule, fn) : null;
const WORK = resolve('.agent-work/engine-input'), home = () => mkdtempSync(join(WORK, 'run-'));
mkdirSync(WORK, { recursive: true });
Object.assign(process.env, { VOXEL_GENESIS_HOME: home(), VOXEL_GENESIS_PORT: '0' });
process.env.VOXEL_GENESIS_NO_LOG = '1';
delete process.env.VOXEL_GENESIS_KIT;
process.on('unhandledRejection', error => info('unhandled', String(error?.message ?? error)));
const [{ createToolSession }, { hash }, { startHttp }, { fitCamera },
  { TOOL_COPY, SERVER_INSTRUCTIONS }] = await Promise.all(['../src/session.mjs',
  '../src/core/codec.mjs', '../src/http.mjs', '../viewer/camera.mjs', '../src/copy.mjs']
  .map(path => import(path)));
const session = (h = home()) => createToolSession({ home: h });
const build = (s, ...ops) => s.call('world_build', { ops });
const small = name => ({ name, size: [16, 16, 12], seed: 3, fresh: true });
const text = reply => typeof reply === 'string' ? reply : JSON.stringify(reply);
const bytes = value => Buffer.byteLength(value);
const pause = ms => new Promise(done => setTimeout(done, ms));
const second = () => pause(1005 - Date.now() % 1000);
const ok = status => status >= 200 && status < 300;
const refused = status => status === 0 || status >= 400;
const LOOK_SAYS = 'Read the world as a small text map. Views: top, height, side, info, town.' +
  ' Kit view lists kinds; of store,goal gives both docs.';

// pick-cells: the projected centre of every visible top face picks that cell, sky picks null.
const project = (cam, width, height, [x, y, z]) => {
  const scale = width / cam.span, [ox, oy, oz] = cam.focus;
  const sine = Math.sin(cam.yaw), cosine = Math.cos(cam.yaw);
  return [width / 2 + ((x - ox) * cosine - (z - oz) * sine) * scale, height / 2 +
    (((x - ox) * sine + (z - oz) * cosine) * Math.sin(cam.pitch) -
    (y - oy) * Math.cos(cam.pitch)) * scale];
};
const odd = def => !def || def.liquid || def.size;
// March cell by cell from the face centre towards the viewer; say what the line meets first.
function sight(world, yaw, pitch, x, y, z) {
  const v = [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)];
  const p = [x + .5, y + 1, z + .5], c = [x, y + 1, z], step = v.map(d => d > 0 ? 1 : -1);
  const next = v.map((d, i) => ((d > 0 ? c[i] + 1 : c[i]) - p[i]) / d);
  const delta = v.map(d => Math.abs(1 / d));
  for (;;) {
    const i = next[0] < next[1] ? (next[0] < next[2] ? 0 : 2) : next[1] < next[2] ? 1 : 2;
    c[i] += step[i]; next[i] += delta[i];
    if (!world.inside(c[0], 0, c[2]) || c[1] >= world.h) return 'clear';
    const id = world.get(c[0], c[1], c[2]);
    if (id) return odd(world.types[id]) ? 'unsure' : 'hidden';
  }
}
function counted(world) {
  const seen = new Set(), at = (x, y, z) => (y * world.d + z) * world.w + x;
  const cells = new Proxy(world.cells, { get(target, key) {
    if (typeof key === 'string' && /^\d+$/.test(key)) seen.add(Number(key));
    const value = target[key];
    return typeof value === 'function' ? value.bind(target) : value;
  } });
  const view = Object.create(world, { cells: { value: cells }, get: { value(x, y, z) {
    if (world.inside(x, y, z)) seen.add(at(x, y, z));
    return world.get(x, y, z);
  } } });
  return { view, seen };
}
await run('pick-cells', async () => {
  let pick = null;
  try { ({ pick } = await import('../viewer/pick.mjs')); } catch (error) {
    check('pick-cells', false, 'viewer/pick.mjs: ' + String(error.message).split('\n')[0]);
    return;
  }
  if (!check('pick-cells', typeof pick === 'function', 'viewer/pick.mjs exports no pick')) return;
  const f = JSON.parse(readFileSync('fixtures/small-town.json', 'utf8')), s = session();
  s.call('world_open', { ...f.open, fresh: true });
  f.batches.forEach(ops => build(s, ...ops));
  const world = s.world, cap = world.w + world.d + world.h, pitch = 0.56;
  const tops = [];
  for (let y = 0; y < world.h; y++) for (let z = 0; z < world.d; z++) {
    for (let x = 0; x < world.w; x++) {
      if (world.get(x, y, z) && !odd(world.type(x, y, z)) && !world.get(x, y + 1, z)) {
        tops.push([x, y, z]);
      }
    }
  }
  let total = 0, right = 0, most = 0, blind = 0, sky = 0, skyBad = 0;
  const faces = new Set(), misses = [];
  for (let k = 0; k < 16; k++) {
    const yaw = 0.7 + k * Math.PI / 8;
    const seen = tops.filter(([x, y, z]) => sight(world, yaw, pitch, x, y, z) === 'clear');
    for (const [width, height] of [[1280, 800], [375, 812]]) {
      for (const zoom of [0.6, 1, 2]) {
        const rig = { world, yaw, pitch };
        fitCamera(rig, width, height, zoom);
        const cam = { yaw, pitch, span: rig.span, focus: [...rig.focus] };
        const probe = (px, py) => {
          const { view, seen: cells } = counted(world);
          const hit = pick(view, { ...cam, focus: [...cam.focus] }, width, height, px, py);
          most = Math.max(most, cells.size);
          blind += !!hit && cells.size === 0;
          return hit;
        };
        for (const cell of seen) {
          const [x, y, z] = cell, [px, py] = project(cam, width, height, [x + .5, y + 1, z + .5]);
          if (px < 0 || py < 0 || px >= width || py >= height) continue;
          const hit = probe(px, py);
          total++;
          if (hit && hit.x === cell[0] && hit.y === cell[1] && hit.z === cell[2] &&
            'face' in hit) {
            right++; faces.add(JSON.stringify(hit.face));
          } else if (misses.length < 3) {
            misses.push(cell.join(',') + ' gave ' + JSON.stringify(hit));
          }
        }
        if (zoom >= 1) { sky++; skyBad += probe(1, 1) !== null; }
      }
    }
  }
  info('pick', right + ' of ' + total + ' right, sky ' + (sky - skyBad) + ' of ' + sky +
    ', at most ' + most + ' cells visited (cap ' + cap + ')');
  check('pick-cells', total > 1000, 'only ' + total + ' visible top faces were probed');
  check('pick-cells', right >= total * 0.99, right + ' of ' + total + ' right; ' +
    misses.join('; '));
  check('pick-cells', faces.size === 1, 'top hits gave faces ' + [...faces].join(' '));
  check('pick-cells', skyBad === 0, skyBad + ' of ' + sky + ' sky pixels picked a cell');
  check('pick-cells', most <= cap, 'a pick visited ' + most + ' cells, cap ' + cap);
  check('pick-cells', blind === 0, blind + ' hits read no cell through get or cells');
});

// HTTP helpers: raw loopback posts, a served session, and the input queue file.
const post = (port, path, headers, body) => new Promise(done => request({ port, path,
  host: '127.0.0.1', method: 'POST', agent: false, headers: Object.fromEntries(Object.entries({
    'content-type': 'application/json', ...headers, 'content-length': body.length })
    .filter(([, value]) => value !== undefined)) },
res => res.resume().on('end', () => done(res.statusCode))).on('error', () => done(0)).end(body));
const input = (srv, value, headers = {}) => post(srv.port, '/api/input',
  { origin: srv.base, ...headers }, Buffer.from(typeof value === 'string' ? value
    : JSON.stringify(value)));
const served = async (s, body) => {
  const server = await startHttp({ port: 0, session: s }), port = server.address().port;
  try {
    return await body({ server, port, base: 'http://127.0.0.1:' + port });
  } finally {
    server.closeAllConnections?.(); await server.stop();
  }
};
const queue = (h, name, file = join(h, 'inputs', name + '.jsonl')) => existsSync(file)
  ? readFileSync(file, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line)) : [];
// Post a run of inputs; stop at the first that is not accepted and name it.
async function burst(rule, srv, values) {
  for (const [index, value] of values.entries()) {
    const status = await input(srv, value);
    if (!check(rule, ok(status), 'input ' + (index + 1) + ' ' + JSON.stringify(value) +
      ' answered ' + status)) return false;
  }
  return true;
}
const clicks = (n, cell = [2, 1, 2]) => Array.from({ length: n }, () => ({ click: cell }));
const yard = (s, name, place = 'orchard') => {
  s.call('world_open', small(name));
  build(s, ['box', 'brick', 1, 1, 1, 3, 1, 3], ['part', { part: 'place/' + place,
    at: [1, 1, 3, 3] }]);
};
const looked = (s, of) => text(s.call('world_look', { view: 'input', of: String(of) }));
const numbered = reply => reply.split('\n').filter(line => /^\d+ /.test(line));
const nOf = line => Number(line.split(' ')[0]);

// input-route: loopback, Host and Origin rules, body cap, rate and waiting caps, and the world
// log, rev and hash untouched by any input.
await run('input-route', () => {
  const s = session();
  s.call('world_open', small('route'));
  build(s, ['box', 'brick', 1, 1, 1, 3, 1, 3]);
  const state = () => (s.catchUp(), JSON.stringify([readFileSync(s.logPath, 'utf8'),
    s.world.rev, hash(s.world)]));
  const before = state();
  return served(s, async srv => {
    const count = () => queue(s.home, 'route').length;
    check('input-route', srv.server.address().address === '127.0.0.1', 'not bound to loopback');
    await second();
    if (!await burst('input-route', srv, [...clicks(7), { key: 'up' }])) return;
    check('input-route', await input(srv, { click: [3, 1, 3] }) === 429,
      'the 9th input in one second was not 429');
    const records = queue(s.home, 'route');
    check('input-route', records.length === 8, records.length + ' inputs saved, want 8');
    const [first, last] = [records[0] ?? {}, records[7] ?? {}];
    check('input-route', Number.isInteger(first.n) && first.rev === s.world.rev &&
      JSON.stringify(first.click) === '[2,1,2]' && last.key === 'up' && records.every((r, i) =>
      i === 0 || r.n > records[i - 1].n), 'records ' + JSON.stringify([first, last]));
    await pause(1100);
    const saved = count();
    check('input-route', await input(srv, { click: [2, 1, 2] }, { origin: 'http:' +
      '//evil.test' }) === 403, 'a foreign Origin was not 403');
    check('input-route', await input(srv, { click: [2, 1, 2] }, { host: 'evil.test:' +
      srv.port }) === 403, 'a foreign Host was not 403');
    const big = await input(srv, JSON.stringify({ click: [2, 1, 2] }) + ' '.repeat(260));
    check('input-route', refused(big) && big !== 429, 'a 277-byte body answered ' + big);
    check('input-route', count() === saved, 'a refused input was saved');
    const tiny = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9Q' +
      'DwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
    const shot = await post(srv.port, '/shot', { 'content-type': 'image/png' }, tiny);
    const bare = await input(srv, { click: [2, 1, 2] }, { origin: undefined });
    info('input-route', '/shot with no Origin answered ' + shot + ', /api/input ' + bare);
    check('input-route', shot === 403 ? bare === 403 : ok(bare),
      'no Origin: /shot answered ' + shot + ', the input ' + bare);
    for (let waiting = count(); waiting < 32; waiting = count()) {
      await pause(1100);
      if (!await burst('input-route', srv, clicks(Math.min(8, 32 - waiting)))) return;
    }
    await pause(1100);
    check('input-route', await input(srv, { click: [2, 1, 2] }) === 429,
      'the 33rd waiting input was not 429');
    check('input-route', count() === 32, count() + ' inputs saved, want 32');
    check('input-route', state() === before, 'an input changed the world log, rev or hash');
    const again = session(s.home);
    again.call('world_open', { name: 'route' });
    check('input-route', hash(again.world) === hash(s.world), 'reopen hash moved');
  });
});

// input-look: inputs after N, oldest first, 600 bytes at most, place ids, the same text twice;
// J5 is measured inside it.
await run('input-look', () => {
  const s = session();
  yard(s, 'look');
  return served(s, async srv => {
    await second();
    if (!await burst('input-look', srv, [{ click: [2, 1, 2] }, { click: [8, 0, 8] },
      { key: 'space' }, { click: [3, 1, 3] }])) return;
    const ns = queue(s.home, 'look').map(r => r.n), of = ns[0] - 1;
    const one = looked(s, of), two = looked(s, of), lines = numbered(one);
    check('input-look', one === two, 'two looks differ: ' + one + ' | ' + two);
    check('input-look', bytes(one) <= 600, 'look is ' + bytes(one) + ' bytes');
    check('input-look', JSON.stringify(lines.map(nOf)) === JSON.stringify(ns),
      'listed ' + lines.map(nOf).join() + ', saved ' + ns.join());
    check('input-look', /\bclick 2,1,2\b/.test(lines[0]) && /\bplace orchard\b/.test(lines[0]),
      'a click in the orchard reads ' + lines[0]);
    check('input-look', /\bclick 8,0,8\b/.test(lines[1]) && !/\bplace\b/.test(lines[1]),
      'a click outside any place reads ' + lines[1]);
    check('input-look', /\bspace\b/.test(lines[2] ?? ''), 'a key reads ' + lines[2]);
    const after = numbered(looked(s, ns[1])).map(nOf);
    check('input-look', JSON.stringify(after) === JSON.stringify(ns.slice(2)),
      'after ' + ns[1] + ' listed ' + after.join());
    for (let batch = 0; batch < 3; batch++) {
      await pause(1100);
      if (!await burst('input-look', srv, clicks(8))) return;
    }
    const all = queue(s.home, 'look').map(r => r.n), full = looked(s, of);
    const shown = numbered(full).map(nOf);
    check('input-look', bytes(full) <= 600, all.length + ' inputs look ' + bytes(full) +
      ' bytes');
    check('input-look', shown.length > 0 &&
      JSON.stringify(shown) === JSON.stringify(all.slice(0, shown.length)),
    'the clipped look listed ' + shown.join() + ' of ' + all.join());
    // J5: answer a click, one look and one build after one input is posted.
    await pause(1100);
    yard(s, 'j5');
    if (!await burst('input-look', srv, [{ click: [2, 1, 2] }])) return;
    const calls = [['world_look', { view: 'input' }],
      ['world_build', { ops: [['box', 'brick', 2, 2, 2, 2, 2, 2]] }]];
    let cost = 0, done = 0;
    try {
      for (const [tool, args] of calls) {
        cost += bytes(JSON.stringify(args)) + bytes(text(s.call(tool, args))); done++;
      }
    } finally {
      info('J5', done + ' of 2 calls, ' + (done < 2 ? 'refused' : cost + ' bytes') +
        ' (cap 2 calls, 900 bytes)');
    }
    check('input-look', cost <= 900, 'J5 costs ' + cost + ' bytes, cap 900');
  });
});

// input-hint: a build reply ends `input K new` while inputs wait past the session's cursor.
await run('input-hint', () => {
  const s = session(), hinted = reply => reply.split('\n').some(line => /^input\b/.test(line));
  const tail = reply => reply.trimEnd().split('\n').at(-1);
  s.call('world_open', small('hint'));
  build(s, ['box', 'brick', 1, 1, 1, 3, 1, 3]);
  return served(s, async srv => {
    const quiet = text(build(s, ['box', 'brick', 5, 1, 5, 5, 1, 5]));
    check('input-hint', !hinted(quiet), 'no input waits, yet the reply says ' + quiet);
    await second();
    if (!await burst('input-hint', srv, clicks(3))) return;
    const three = text(build(s, ['box', 'brick', 6, 1, 6, 6, 1, 6]));
    const want = (reply, k) => check('input-hint', tail(reply) === 'input ' + k + ' new' &&
      bytes(tail(reply)) <= 20, k + ' waiting, the reply ends ' + tail(reply));
    want(three, 3);
    looked(s, queue(s.home, 'hint')[0].n - 1);
    const read = text(build(s, ['box', 'brick', 7, 1, 7, 7, 1, 7]));
    check('input-hint', !hinted(read), 'after a look of every input: ' + read);
    if (!await burst('input-hint', srv, clicks(1))) return;
    want(text(build(s, ['box', 'brick', 8, 1, 8, 8, 1, 8])), 1);
  });
});

// input-door: inputs posted to a `serve` process are read by a `call` door look in one home.
await run('input-door', async () => {
  const h = home(), env = { ...process.env, VOXEL_GENESIS_HOME: h };
  const cli = (...args) => spawnSync(process.execPath, ['bin/voxel-genesis.mjs', ...args],
    { env, encoding: 'utf8', timeout: 30000 });
  cli('call', 'world_open', JSON.stringify(small('door')));
  cli('call', 'world_build', JSON.stringify({ ops: [['box', 'brick', 1, 1, 1, 3, 1, 3]] }));
  const child = spawn(process.execPath, ['bin/voxel-genesis.mjs', 'serve', '0'],
    { env, stdio: ['ignore', 'pipe', 'pipe'] });
  const gone = new Promise(done => child.once('exit', done));
  let timer = null;
  try {
    const url = await new Promise((done, fail) => {
      let out = '';
      timer = setTimeout(() => fail(new Error('serve printed no viewer in 15 s')), 15000);
      child.stdout.on('data', chunk => {
        out += chunk;
        const line = out.split('\n').slice(0, -1).find(l => l.startsWith('{'));
        if (line) done(JSON.parse(line).viewer);
      });
      gone.then(() => fail(new Error('serve exited: ' + out.slice(0, 120))));
    });
    if (!check('input-door', typeof url === 'string', 'serve gave viewer ' + url)) return;
    const port = Number(new URL(url).port), srv = { port, base: 'http://127.0.0.1:' + port };
    await second();
    if (!await burst('input-door', srv, [{ click: [2, 1, 2] }, { click: [3, 1, 3] }])) return;
    const records = queue(h, 'door');
    check('input-door', records.length === 2, 'serve saved ' + records.length + ' inputs');
    const out = cli('call', 'world_look', JSON.stringify({ view: 'input',
      of: String((records[0]?.n ?? 1) - 1) }));
    let reply = '';
    try { reply = text(JSON.parse(out.stdout)); } catch { reply = String(out.stdout); }
    const lines = numbered(reply);
    check('input-door', out.status === 0 && lines.length === 2 &&
      /\bclick 2,1,2\b/.test(lines[0]) && /\bclick 3,1,3\b/.test(lines[1]),
    'call door look: ' + reply.slice(0, 120));
  } finally {
    clearTimeout(timer);
    child.kill();
    await gone;
  }
});

// input-budget: four tools, 2,400 bytes at most (updated on 2026-11-14),
// "input" joins the world_look view enum only.
await run('input-budget', () => {
  const tools = TOOL_COPY, look = tools.find(tool => tool.name === 'world_look');
  const size = bytes(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { tools } })) +
    bytes(SERVER_INSTRUCTIONS), views = look?.inputSchema?.properties?.view?.enum ?? [];
  info('input-budget', size + ' bytes (cap 2,400), views ' + views.join(' '));
  check('input-budget', tools.length === 4 && tools.every(tool => /^world_/.test(tool.name)),
    tools.length + ' tools');
  check('input-budget', size <= 2800, 'tool list plus instructions ' + size + ' bytes');
  check('input-budget', views.includes('input'), 'world_look view enum ' + views.join());
  const kept = ['top', 'height', 'side', 'info', 'town', 'kit'];
  check('input-budget', kept.every(view => views.includes(view)) && views.every(view =>
    [...kept, 'input'].includes(view)), 'other views changed: ' + views.join());
  check('input-budget', look?.description === LOOK_SAYS, 'the world_look description changed');
});

for (const note of notes) console.log('info ' + note);
for (const failure of failures) console.log('FAIL ' + failure.rule + ': ' + failure.detail);
console.log('engine-input: ' + failures.length + ' failures');
process.exitCode = failures.length ? 1 : 0;
