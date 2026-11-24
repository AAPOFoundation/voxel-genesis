// Frozen engine bind checks.
// Run alone: node tests/engine-bind.mjs. Not imported by the four suites until wave 6 merges.
// Judgements, each the least specific reading that still proves the behaviour:
// - In-process means acceptInput(session, value) from src/input.mjs, the function behind
//   POST /api/input, then session.catchUp(). Click to new revision is the time of both calls;
//   the revision must be one higher straight after. HTTP posts use the viewer's own Origin.
// - A binding is a part `input/ID` built with the existing `part` op. `at` is an exact place
//   id; no rule uses an empty `at`, and no two bindings match one input, so "first" is not
//   asserted. A key binding names `key` with `on` "key". The clicked place as context is shown
//   by an `ops` effect painting at $x1,$z1 of that place.
// - An input "appends one in op" when the log gains one line whose ops hold exactly one `in`
//   op, deep-equal to ["in","click",x,y,z] or ["in","key",K]. Other line fields are free.
// - The cap of 4 a second holds under a sliding or a fixed window: bursts of 4 or fewer start
//   1,050 ms after the previous input, so 200 timed inputs take about 55 s. The rate burst
//   starts just after a whole second. Queued means saved to HOME/inputs/NAME.jsonl and listed
//   by world_look view input; the 5th input must not be refused. A bound input under the cap is
//   not queued. A bound input after the burst binds again.
// - Unbound inputs: a click in a place with no binding, a click outside every place, and a
//   key no binding names. Each leaves the log, rev and hash alone and is queued. A control
//   click on the bound lot in the same world must bind first, so the rule proves the split.
// - Editing a binding is re-declaring the part with new `then`. Earlier `in` ops keep the old
//   effects in live play, reopen, core replay of the saved log and `run`. Run is
//   bin/voxel-genesis.mjs run with the log's ops as batches, in a fresh home.
// - An agent-sent `in` op is not refused: `run` feeds a log back through world_build, so an
//   `in` op must pass there and act as the server's own. Only the run door is asserted.
// - Log bytes per bound input are reported as info against the A/B 12 cap of 130, not failed.
// - door-tools: stdout of `tools` parses as JSON deep-equal (keys sorted) to the GET /tools
//   body. "Opens no world" means no .jsonl under HOME/worlds and no HOME/current file. The
//   README names it when it holds the text `voxel-genesis.mjs tools`.
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, existsSync,
  readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { request } from 'node:http';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';
const failures = [], notes = [];
const check = (rule, ok, detail = '') =>
  ok || !failures.push({ rule, detail: String(detail).replaceAll('\n', ' / ') });
const info = (topic, text) => notes.push(topic + ': ' + text);
const test = (rule, fn) => Promise.resolve().then(fn).catch(error =>
  check(rule, false, String(error.message).split('\n')[0].slice(0, 160)));
const only = process.argv.find(arg => arg.startsWith('--only='))?.slice(7).split(',');
const run = (rule, fn) => !only || only.includes(rule) ? test(rule, fn) : null;
const WORK = resolve('.agent-work/engine-bind'), home = () => mkdtempSync(join(WORK, 'run-'));
mkdirSync(WORK, { recursive: true });
Object.assign(process.env, { VOXEL_GENESIS_HOME: home(), VOXEL_GENESIS_PORT: '0' });
process.env.VOXEL_GENESIS_NO_LOG = '1';
delete process.env.VOXEL_GENESIS_KIT;
process.on('unhandledRejection', error => info('unhandled', String(error?.message ?? error)));
const [{ createToolSession }, { hash }, { createCore }, { startHttp }, { acceptInput },
  { readLog }] = await Promise.all(['../src/session.mjs', '../src/core/codec.mjs',
  '../src/core/index.mjs', '../src/http.mjs', '../src/input.mjs', '../src/save-log.mjs']
  .map(path => import(path)));
const E = createRequire(import.meta.url)('../vendor/voxel-engine.js');
const session = (h = home()) => createToolSession({ home: h });
const build = (s, ...ops) => s.call('world_build', { ops });
const small = name => ({ name, size: [16, 16, 12], seed: 3, fresh: true });
const text = reply => typeof reply === 'string' ? reply : JSON.stringify(reply);
const bytes = value => Buffer.byteLength(value);
const load = name => JSON.parse(readFileSync('fixtures/' + name + '.json', 'utf8'));
const pause = ms => new Promise(done => setTimeout(done, ms));
const second = () => pause(1005 - Date.now() % 1000);
const ok = status => status >= 200 && status < 300;
const stable = value => JSON.stringify(value, (key, item) =>
  item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(
    Object.entries(item).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : item);

// The bound yard: lot is bound to a click, yard is not, space is bound to a key.
const TAP = [['add', 'taps', 1], ['ops', [['box', 'amber', '$x1', 1, '$z1', '$x1', 1, '$z1']]]];
const tap = then => ['part', { part: 'input/tap', at: 'lot', then }];
function bound(s, name) {
  s.call('world_open', small(name));
  build(s, ['part', { part: 'place/lot', at: [2, 2, 5, 5] }],
    ['part', { part: 'place/yard', at: [8, 8, 11, 11] }],
    ['part', { part: 'store/taps', per: 'game' }], tap(TAP),
    ['part', { part: 'input/jump', on: 'key', key: 'space', then: [['add', 'taps', 100]] }]);
}
const taps = s => s.world.kit?.s?.store?.taps?.game ?? null;
const click = (x, z, y = 0) => ({ click: [x, y, z] });
const records = s => (s.catchUp(), readLog(s.logPath).records);
const inOps = rows => rows.flatMap(row => row.ops ?? []).filter(op => op[0] === 'in');
const state = s => (s.catchUp(), JSON.stringify([readFileSync(s.logPath, 'utf8'),
  s.world.rev, hash(s.world)]));
const queue = (s, file = join(s.home, 'inputs', s.world.name + '.jsonl')) => existsSync(file)
  ? readFileSync(file, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line)) : [];
const looked = (s, of) => text(s.call('world_look', { view: 'input', of: String(of) }));
const listed = (s, of, word) => looked(s, of).split('\n')
  .some(line => /^\d+ /.test(line) && line.includes(word));
// Pace every input in the file: a burst starts 1,050 ms after the last input sent anywhere.
let last = 0;
const gap = () => pause(Math.max(0, last + 1050 - Date.now()));
const send = (s, value) => {
  try { acceptInput(s, value); s.catchUp(); } finally { last = Date.now(); }
};
async function burst(s, values) {
  await gap();
  for (const value of values) send(s, value);
}

// HTTP helpers: raw loopback requests to a served session.
const call = (port, method, path, headers, body = null) => new Promise(done => request({ port,
  path, host: '127.0.0.1', method, agent: false, headers: Object.fromEntries(Object.entries({
    ...(body ? { 'content-type': 'application/json', 'content-length': body.length } : {}),
    ...headers }).filter(([, value]) => value !== undefined)) }, res => {
  let out = '';
  res.setEncoding('utf8');
  res.on('data', chunk => { out += chunk; }).on('end', () => done({ status: res.statusCode,
    text: out }));
}).on('error', () => done({ status: 0, text: '' })).end(body ?? undefined));
const post = async (srv, value) => (await call(srv.port, 'POST', '/api/input',
  { origin: srv.base }, Buffer.from(JSON.stringify(value)))).status;
const served = async (s, body) => {
  const server = await startHttp({ port: 0, session: s }), port = server.address().port;
  try {
    return await body({ server, port, base: 'http://127.0.0.1:' + port });
  } finally {
    server.closeAllConnections?.(); await server.stop();
  }
};

// bind-click: a click on a bound place appends one `in` op and runs its effects; a key does the
// same; the HTTP route binds; click to new revision p95 50 ms or less over 200 in-process.
await run('bind-click', async () => {
  const s = session();
  bound(s, 'click');
  const rows = records(s).length, rev = s.world.rev;
  await burst(s, [click(3, 3)]);
  const added = records(s).slice(rows);
  check('bind-click', added.length === 1 && stable(inOps(added)) ===
    stable([['in', 'click', 3, 0, 3]]), 'a bound click logged ' + stable(added));
  check('bind-click', s.world.rev === rev + 1, 'rev ' + rev + ' became ' + s.world.rev);
  check('bind-click', taps(s) === 1 && s.world.get(2, 1, 2) === s.world.byName.amber,
    'effects did not run with the lot as context: taps ' + taps(s));
  const keyed = records(s).length;
  await burst(s, [{ key: 'space' }]);
  const key = records(s).slice(keyed);
  check('bind-click', key.length === 1 && stable(inOps(key)) === stable([['in', 'key', 'space']])
    && taps(s) === 101, 'a bound key logged ' + stable(key) + ', taps ' + taps(s));
  // The HTTP route binds too.
  const w = session();
  bound(w, 'route');
  const before = w.world.rev;
  await served(w, async srv => {
    await gap();
    for (const value of [click(4, 4), click(5, 5)]) {
      const status = await post(srv, value);
      last = Date.now();
      check('bind-click', ok(status), 'POST /api/input ' + stable(value) + ' answered ' + status);
    }
  });
  check('bind-click', w.world.rev === before + 2 && taps(w) === 2 &&
    inOps(records(w)).length === 2, 'two HTTP clicks gave rev ' + before + ' to ' +
    w.world.rev + ', taps ' + taps(w));
  // 200 in-process bound clicks, in paced bursts of four.
  const times = [], size = bytes(readFileSync(s.logPath, 'utf8'));
  let misses = 0;
  for (let i = 0; i < 200 && !misses; i += 4) {
    await gap();
    for (let j = i; j < i + 4; j++) {
      const was = s.world.rev, start = performance.now();
      send(s, click(2 + j % 4, 2 + (j >> 2) % 4));
      times.push(performance.now() - start);
      misses += s.world.rev !== was + 1;
    }
  }
  const sorted = [...times].sort((a, b) => a - b);
  const p95 = sorted[Math.ceil(sorted.length * 0.95) - 1] ?? Infinity;
  const per = (bytes(readFileSync(s.logPath, 'utf8')) - size) / Math.max(1, times.length);
  info('bind-click', 'p95 ' + p95.toFixed(1) + ' ms over ' + times.length +
    ' in-process inputs (cap 50), ' + per.toFixed(1) + ' log bytes per bound input' +
    ' (A/B 12 cap 130)');
  check('bind-click', !misses && times.length === 200, misses + ' of ' + times.length +
    ' bound clicks made no new revision');
  check('bind-click', p95 <= 50, 'click to new revision p95 ' + p95.toFixed(1) + ' ms');
  check('bind-click', taps(s) === 301 && inOps(records(s)).length === 202,
    'after 200 more clicks taps ' + taps(s) + ', in ops ' + inOps(records(s)).length);
  check('bind-click', queue(s).length === 0, queue(s).length + ' bound inputs were queued');
});

// bind-replay: replay, reopen and run of a log with `in` ops give one hash; editing the binding
// later changes only later inputs; worlds with no input part hash as before.
await run('bind-replay', async () => {
  const core = createCore(E), plain = load('expected'), two = load('base-two-expected');
  const names = [...Object.keys(plain), 'town-game'];
  for (const name of names) {
    const f = load(name), s = session(), want = plain[name] ?? load('town-expected');
    s.call('world_open', { ...f.open, fresh: true });
    f.batches.forEach(ops => build(s, ...ops));
    check('bind-replay', hash(s.world) === want.hash && s.world.rev === want.rev,
      name + ' ' + hash(s.world) + ' rev ' + s.world.rev);
  }
  for (const [set, frozen] of [
    ['base@1', { ...load('base-one-expected'), 'town-game': load('town-base-one-expected') }],
    ['base@2', { ...two, 'town-game': two.town }]]) {
    for (const name of names) {
      const f = load(name), game = name === 'town-game', world = core.replay({ v: 1, set,
        world: f.open.name, seed: f.open.seed ?? 1, rules: game ? 'town@1' : 'none@0',
        size: f.open.size ?? (game ? [36, 36, 16] : [32, 32, 24]) },
      (game ? two.batches : f.batches).map(ops => ({ ops }))).world;
      check('bind-replay', hash(world) === frozen[name].hash, set + ' ' + name + ' ' +
        hash(world));
    }
  }
  const kit = load('kit/expected');
  for (const id of Object.keys(kit)) {
    const f = load('kit/' + id + '-game'), s = session();
    s.call('world_open', f.open);
    f.batches.forEach(ops => build(s, ...ops));
    check('bind-replay', hash(s.world) === kit[id].hash && s.world.rev === kit[id].rev,
      'kit ' + id + ' ' + hash(s.world) + ' rev ' + s.world.rev);
  }
  // Three clicks, an edited binding, two more clicks.
  const s = session();
  bound(s, 'replay');
  await burst(s, [click(3, 3), click(4, 4), click(5, 5)]);
  check('bind-replay', taps(s) === 3, 'three clicks gave taps ' + taps(s));
  build(s, tap([['add', 'taps', 10]]));
  check('bind-replay', taps(s) === 3, 'editing the binding changed taps to ' + taps(s));
  await burst(s, [click(3, 3), click(2, 2)]);
  const live = hash(s.world);
  check('bind-replay', taps(s) === 23 && inOps(records(s)).length === 5,
    'live taps ' + taps(s) + ' (want 3 + 2 x 10), in ops ' + inOps(records(s)).length);
  const again = session(s.home);
  again.call('world_open', { name: 'replay' });
  check('bind-replay', hash(again.world) === live && taps(again) === 23,
    'reopen gave ' + hash(again.world) + ', taps ' + taps(again));
  const { h, records: rows } = readLog(s.logPath), replayed = core.replay(h, rows).world;
  check('bind-replay', hash(replayed) === live, 'replay gave ' + hash(replayed));
  const file = join(home(), 'replay.run.json');
  writeFileSync(file, JSON.stringify({ open: small('replay'), batches: rows.map(r => r.ops) }));
  const r = spawnSync(process.execPath, ['bin/voxel-genesis.mjs', 'run', file], { encoding: 'utf8',
    env: { ...process.env, VOXEL_GENESIS_HOME: home() }, timeout: 60000 });
  let out = null;
  try { out = JSON.parse(String(r.stdout).trim().split('\n').at(-1)); } catch { out = null; }
  check('bind-replay', out?.hash === live, 'run gave ' + String(r.stdout).slice(0, 120));
});

// bind-rate: the 5th bound input in a second is queued for the agent, never dropped silently.
await run('bind-rate', async () => {
  const s = session();
  bound(s, 'rate');
  await gap();
  await second();
  const rev = s.world.rev, revs = [], cells = [[2, 2], [3, 3], [4, 4], [5, 5], [3, 4]];
  for (const [x, z] of cells) {
    send(s, click(x, z));
    revs.push(s.world.rev - rev);
  }
  check('bind-rate', revs.join() === '1,2,3,4,4', 'revisions after each of five ' +
    'bound clicks in a second: ' + revs.join());
  const saved = queue(s);
  check('bind-rate', saved.length === 1 && stable(saved[0]?.click) === '[3,0,4]',
    'the 5th bound click was queued as ' + stable(saved));
  check('bind-rate', saved.length > 0 && listed(s, saved[0].n - 1, 'click 3,0,4'),
    'world_look view input does not list the 5th click');
  check('bind-rate', inOps(records(s)).length === 4 && taps(s) === 4,
    'in ops ' + inOps(records(s)).length + ', taps ' + taps(s));
  const was = s.world.rev;
  await burst(s, [click(2, 5)]);
  check('bind-rate', s.world.rev === was + 1, 'a bound click a second later did not bind');
});

// bind-unbound: a click on an unbound cell goes to the wave 4 queue.
await run('bind-unbound', async () => {
  const s = session();
  bound(s, 'unbound');
  await burst(s, [click(3, 3)]);
  check('bind-unbound', inOps(records(s)).length === 1 && queue(s).length === 0,
    'the control click on the bound lot was not bound: ' + stable(queue(s)));
  const before = state(s), values = [click(9, 9), click(14, 1), { key: 'up' }];
  await burst(s, values);
  check('bind-unbound', state(s) === before, 'an unbound input changed the log, rev or hash');
  const saved = queue(s);
  check('bind-unbound', stable(saved.map(row => row.click ?? row.key)) ===
    stable(values.map(value => value.click ?? value.key)), 'queued ' + stable(saved));
  check('bind-unbound', saved[0]?.place === 'yard', 'the yard click was queued as ' +
    stable(saved[0]));
  const of = (saved[0]?.n ?? 1) - 1;
  check('bind-unbound', ['click 9,0,9', 'click 14,0,1', 'up'].every(word =>
    listed(s, of, word)), 'world_look view input: ' + looked(s, of).slice(0, 160));
});

// bind-undo: world_undo after an `in` op restores the earlier hash.
await run('bind-undo', async () => {
  const s = session();
  bound(s, 'undo');
  const first = hash(s.world);
  await burst(s, [click(3, 3)]);
  check('bind-undo', hash(s.world) !== first && inOps(records(s)).length === 1,
    'a bound click left the hash unchanged or logged no in op');
  s.call('world_undo');
  check('bind-undo', hash(s.world) === first && taps(s) === 0 &&
    s.world.get(2, 1, 2) !== s.world.byName.amber, 'undo gave ' + hash(s.world) +
    ', taps ' + taps(s));
  const again = session(s.home);
  again.call('world_open', { name: 'undo' });
  check('bind-undo', hash(again.world) === first, 'reopen after undo gave ' + hash(again.world));
});

// door-tools: `tools` prints the GET /tools body, opens no world, and the README names it.
await run('door-tools', async () => {
  const h = home();
  const r = spawnSync(process.execPath, ['bin/voxel-genesis.mjs', 'tools'], { encoding: 'utf8',
    env: { ...process.env, VOXEL_GENESIS_HOME: h }, timeout: 30000 });
  let printed = null;
  try { printed = JSON.parse(String(r.stdout)); } catch { printed = null; }
  const body = await served(session(), async srv => call(srv.port, 'GET', '/tools', {}));
  let want = null;
  try { want = JSON.parse(body.text); } catch { want = null; }
  check('door-tools', body.status === 200 && want !== null, 'GET /tools answered ' +
    body.status);
  check('door-tools', r.status === 0, 'tools exited ' + r.status + ': ' +
    String(r.stdout).slice(0, 120));
  check('door-tools', printed !== null && stable(printed) === stable(want),
    'tools printed ' + String(r.stdout).slice(0, 120));
  const worlds = join(h, 'worlds'), saves = existsSync(worlds) ? readdirSync(worlds)
    .filter(name => name.endsWith('.jsonl')) : [];
  check('door-tools', !saves.length && !existsSync(join(h, 'current')),
    'tools opened a world: ' + saves.join(' '));
  check('door-tools', readFileSync('README.md', 'utf8').includes('voxel-genesis.mjs tools'),
    'README.md does not name node bin/voxel-genesis.mjs tools');
});

for (const note of notes) console.log('info ' + note);
for (const failure of failures) console.log('FAIL ' + failure.rule + ': ' + failure.detail);
console.log('engine-bind: ' + failures.length + ' failures');
process.exitCode = failures.length ? 1 : 0;
