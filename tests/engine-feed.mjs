// Frozen engine feed checks.
// Run alone: node tests/engine-feed.mjs. Not imported by the four suites until wave 3 merges.
// Judgements, each the least specific reading that still proves the behaviour:
// - A reply shows a note when its text holds the stored says. A batch of three or six notes
//   lists one or two of them. A feed entry is exactly {rev, says}, rev the rev after the build.
// - A cut note is 60 to 80 bytes, a prefix of the text ending before a space or a mark, with
//   one trailing ellipsis allowed.
// - The panel is the smallest attached node holding the last three lines, found by text; it or
//   an ancestor has aria-live="polite". Idle callbacks are kit-change events plus its writes.
// - Layout is tests/layout.mjs's kit worst case plus three 80-byte lines at #kit's font, one row
//   a line when the feed's own rule says white-space nowrap, no height when it says absolute.
// - The viewer is the served module graph mirrored under .agent-work, imported with DOM, canvas
//   and EventSource doubles. genesisShot is window.genesisShot after a ?step=1 load, awaited; its
//   request is replayed raw for the refusals, the PNG raw or base64 in the body. A viewer POST
//   carries the page Origin; refused is 400 or more or a dropped connection; a foreign Origin or
//   Host answers 403, as /bench does.
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, existsSync, readdirSync }
  from 'node:fs';
import { resolve, join, dirname, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url'; import { request } from 'node:http';
import { createRequire } from 'node:module'; import { createHash } from 'node:crypto';
const failures = [], notes = [];
const check = (rule, ok, detail = '') =>
  ok || !failures.push({ rule, detail: String(detail).replaceAll('\n', ' / ') });
const info = (topic, text) => notes.push(topic + ': ' + text);
const test = (rule, fn) => Promise.resolve().then(fn).catch(error =>
  check(rule, false, String(error.message).split('\n')[0].slice(0, 160)));
const only = process.argv.find(arg => arg.startsWith('--only='))?.slice(7).split(',');
const run = (rule, fn) => !only || only.includes(rule) ? test(rule, fn) : null;
const WORK = resolve('.agent-work/engine-feed'), home = () => mkdtempSync(join(WORK, 'run-'));
mkdirSync(WORK, { recursive: true });
Object.assign(process.env, { VOXEL_GENESIS_HOME: home(), VOXEL_GENESIS_PORT: '0' });
process.env.VOXEL_GENESIS_NO_LOG = '1';
delete process.env.VOXEL_GENESIS_KIT;
process.on('unhandledRejection', error => info('unhandled', String(error?.message ?? error)));
const [{ createToolSession }, { hash }, { createCore }, { createPlayer }, { panelOf },
  { startHttp }, { checkLayout }] = await Promise.all(['../src/session.mjs',
  '../src/core/codec.mjs', '../src/core/index.mjs', '../viewer/player.mjs',
  '../src/kit/story.mjs', '../src/http.mjs', './layout.mjs'].map(path => import(path)));
const E = createRequire(import.meta.url)('../vendor/voxel-engine.js');
const session = (h = home()) => createToolSession({ home: h });
const build = (s, ...ops) => s.call('world_build', { ops });
const small = name => ({ name, size: [16, 16, 12], seed: 3, fresh: true });
const text = reply => typeof reply === 'string' ? reply : JSON.stringify(reply);
const bytes = value => Buffer.byteLength(value), says = s => (s.world.feed ?? []).map(e => e.says);
const load = name => JSON.parse(readFileSync('fixtures/' + name + '.json', 'utf8'));
const stable = value => JSON.stringify(value, (key, item) =>
  item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(
    Object.entries(item).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : item);
const tree = (dir, at = '') => existsSync(join(dir, at)) ? readdirSync(join(dir, at),
  { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? tree(dir, join(at, entry.name))
  : [join(at, entry.name) + ' ' + createHash('sha256')
    .update(readFileSync(join(dir, at, entry.name))).digest('hex').slice(0, 16)]).sort() : [];
// Exactly 80 bytes each, whole words, so no cut applies.
const line80 = word => 'Note ' + word +
  ': rain on the hill, sun on the farm, wind by the mill and frost on pond.';
const LONG = 'Léa and Zoé walk past the café, the crèche and the old château to see the ' +
  'fête by the lake today.';
const BELLS = ['One bell rings.', 'Two bells ring.', 'Three bells ring.', 'Four bells ring.',
  'Five bells ring.', 'Six bells ring.'], RAIN = 'Rain is coming.';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwAD' +
  'hgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

// feed-op: a plain note appends one line, the reply shows it inside 400 bytes, undo removes it.
await run('feed-op', () => {
  const s = session(), args = { ops: [['note', RAIN]] };
  s.call('world_open', small('feed-op'));
  const before = build(s, ['box', 'brick', 1, 1, 1, 1, 1, 1]) && hash(s.world);
  let reply = null; // J4: show a news line in the viewer, one plain world_build on an open world.
  try { reply = text(s.call('world_build', args)); } finally {
    info('J4', '1 call, ' + (reply === null ? 'refused' : bytes(JSON.stringify(args)) +
      bytes(reply) + ' bytes') + ' (cap 1 call, 300 bytes)');
  }
  const cost = bytes(JSON.stringify(args)) + bytes(reply), feed = s.world.feed ?? [];
  check('feed-op', cost <= 300, 'J4 costs ' + cost + ' bytes, cap 300');
  check('feed-op', reply.includes(RAIN) && bytes(reply) <= 400, 'reply ' + bytes(reply) +
    ' bytes, note shown ' + reply.includes(RAIN));
  check('feed-op', feed.length === 1 && feed[0].says === RAIN && feed[0].rev === s.world.rev &&
    Object.keys(feed[0]).sort().join() === 'rev,says', 'feed ' + JSON.stringify(feed));
  check('feed-op', hash(s.world) !== before, 'the note left the hash unchanged');
  const quiet = text(build(s, ['box', 'brick', 2, 1, 2, 2, 1, 2]));
  check('feed-op', !quiet.includes(RAIN) && says(s).length === 1, 'a later build: ' + quiet);
  const three = ['one', 'two', 'six'].map(line80);
  const many = text(build(s, ['box', 'cream', 3, 1, 3, 3, 1, 3], ...three.map(t => ['note', t])));
  const listed = three.filter(t => many.includes(t)).length, again = session(s.home);
  check('feed-op', listed >= 1 && listed <= 2 && bytes(many) <= 400,
    'three notes: ' + listed + ' listed in ' + bytes(many) + ' bytes');
  check('feed-op', stable(says(s)) === stable([RAIN, ...three]), 'feed ' + says(s).length);
  again.call('world_open', { name: 'feed-op' });
  check('feed-op', hash(again.world) === hash(s.world) &&
    stable(again.world.feed) === stable(s.world.feed), 'reopen lost the feed or the hash');
  s.call('world_undo');
  check('feed-op', stable(says(s)) === stable([RAIN]), 'one undo left ' + says(s).length);
  s.call('world_undo', { steps: 2 });
  check('feed-op', hash(s.world) === before && !s.world.feed?.length,
    'undo of the note left ' + JSON.stringify(s.world.feed) + ', hash ' + hash(s.world));
});

// feed-effect: a beat then and a deck card write the feed through ["note", TEXT]; a long text is
// cut at a whole word within 80 bytes; six notes keep the last five.
await run('feed-effect', () => {
  const s = session(), d = session();
  s.call('world_open', small('feed-effect'));
  build(s, ['part', { part: 'store/water', per: 'game' }],
    ['part', { part: 'action/fill', on: '', then: [['add', 'water', 1]] }],
    ['part', { part: 'beat/full', goal: 'Fill the well.', when: [['>=', 'water', 1]],
      says: 'Done.', then: [['note', LONG]] }]);
  const beat = text(build(s, ['do', 'fill']));
  const cut = s.world.feed?.[0]?.says ?? '', kept = cut.replace(/(…|\.\.\.)$/u, '');
  check('feed-effect', s.world.feed?.length === 1 && s.world.feed[0].rev === s.world.rev,
    'beat then wrote ' + JSON.stringify(s.world.feed));
  check('feed-effect', bytes(cut) <= 80 && bytes(cut) >= 60 && kept.length > 0 &&
    LONG.startsWith(kept) && !/[\p{L}\p{N}]/u.test(LONG[kept.length] ?? ''),
  'cut "' + cut + '" is ' + bytes(cut) + ' bytes');
  check('feed-effect', cut !== '' && beat.includes(cut) && bytes(beat) <= 700,
    'beat reply ' + bytes(beat) + ' bytes, note shown ' + (cut !== '' && beat.includes(cut)));
  d.call('world_open', small('feed-deck'));
  build(d, ['part', { part: 'deck/news', draw: 'none',
    cards: [{ id: 'rain', then: [['note', RAIN]] }] }],
  ['part', { part: 'action/read', on: '', then: [['draw', 'news']] }],
  ['part', { part: 'action/ring', on: '', then: BELLS.map(t => ['note', t]) }]);
  const drawn = text(build(d, ['do', 'read']));
  check('feed-effect', stable(says(d)) === stable([RAIN]) && drawn.includes(RAIN),
    'deck card wrote ' + JSON.stringify(d.world.feed));
  const rung = text(build(d, ['do', 'ring'])), listed = BELLS.filter(t => rung.includes(t)).length;
  check('feed-effect', stable(says(d)) === stable(BELLS.slice(1)) &&
    d.world.feed.every(entry => entry.rev === d.world.rev), 'six notes kept ' + says(d));
  check('feed-effect', listed >= 1 && listed <= 2 && bytes(rung) <= 700,
    'six notes: ' + listed + ' listed in ' + bytes(rung) + ' bytes');
});

// feed-hash: worlds that never note keep every frozen plain, town, base and kit record.
await run('feed-hash', () => {
  const core = createCore(E), plain = load('expected'), two = load('base-two-expected');
  const names = [...Object.keys(plain), 'town-game'];
  const live = (open, batches, label, want, s = session()) => {
    s.call('world_open', open);
    batches.forEach(ops => build(s, ...ops));
    check('feed-hash', hash(s.world) === want.hash && s.world.rev === want.rev,
      label + ' ' + hash(s.world) + ' rev ' + s.world.rev);
  };
  for (const name of names) live({ ...load(name).open, fresh: true }, load(name).batches, name,
    plain[name] ?? load('town-expected'));
  for (const [set, records] of [
    ['base@1', { ...load('base-one-expected'), 'town-game': load('town-base-one-expected') }],
    ['base@2', { ...two, 'town-game': two.town }]]) {
    for (const name of names) {
      const f = load(name), game = name === 'town-game', world = core.replay({ v: 1, set,
        world: f.open.name, seed: f.open.seed ?? 1, rules: game ? 'town@1' : 'none@0',
        size: f.open.size ?? (game ? [36, 36, 16] : [32, 32, 24]) },
      (game ? two.batches : f.batches).map(ops => ({ ops }))).world;
      check('feed-hash', hash(world) === records[name].hash, set + ' ' + name + ' ' + hash(world));
    }
  }
  const kit = load('kit/expected');
  for (const [id, f] of Object.keys(kit).map(id => [id, load('kit/' + id + '-game')])) {
    live(f.open, f.batches, 'kit ' + id, kit[id]);
  }
});

// Viewer harness: mirror the served module graph, then run it against DOM and canvas doubles.
const realFetch = globalThis.fetch, noop = new Proxy({}, { get: () => () => {} });
const post = (port, path, headers, body) => new Promise(done => request({ port, path,
  host: '127.0.0.1', method: 'POST', agent: false, headers: { ...headers,
    'content-length': body.length } }, res => res.resume().on('end', () => done(res.statusCode)))
  .on('error', () => done(0)).end(body));
let site = null, loads = 0;
async function mirror(base, todo = ['/kit-panel.mjs', '/viewer.mjs'], seen = new Set()) {
  for (site ??= mkdtempSync(join(WORK, 'site-')); todo.length;) {
    const path = todo.pop();
    if (seen.has(path) || !seen.add(path)) continue;
    const res = await realFetch(base + path), source = await res.text();
    if (!res.ok) throw new Error('viewer module ' + path + ' answered ' + res.status);
    mkdirSync(dirname(join(site, path)), { recursive: true });
    writeFileSync(join(site, path), source);
    for (const m of source.matchAll(/(?:from|import)\s*\(?\s*['"](\.[^'"]+)['"]/g)) todo.push(
      new URL(m[1], base + path).pathname);
  }
  return site;
}
async function viewer(s, server, { search = '', reduced = false } = {}) {
  const port = server.address().port, base = 'http://127.0.0.1:' + port;
  const html = await (await realFetch(base + '/')).text(), dir = await mirror(base);
  const counts = { events: 0, html: 0 }, posts = [], pending = [], roots = new Map();
  const attrs = (id, m = html.match(new RegExp('<(\\w+)([^>]*\\sid="' + id + '"[^>]*)>'))) =>
    [m?.[1] ?? 'div', Object.fromEntries([...(m?.[2] ?? '')
      .matchAll(/([\w-]+)(?:="([^"]*)")?/g)].map(a => [a[1], a[2] ?? '']))];
  const below = node => node.kids.flatMap(k => [k, ...below(k)]);
  // A small DOM double: every write marks the node and its ancestors; other methods do nothing.
  class El {
    constructor(tag, at = {}) {
      Object.assign(this, { tagName: tag.toUpperCase(), attrs: at, kids: [], parentNode: null,
        own: '', style: {}, dataset: {}, listeners: {}, writes: 0, hidden: 'hidden' in at,
        width: 1280, height: 800, clientHeight: 800, offsetTop: 0,
        classList: { add() {}, remove() {}, toggle() {}, contains: () => false } });
      return new Proxy(this, { get: (t, k) => k in t || typeof k === 'symbol' || k === 'then'
        ? t[k] : () => {} });
    }
    get ownerDocument() { return doc; } get innerHTML() { return ''; }
    get id() { return this.attrs.id ?? ''; } set id(value) { this.attrs.id = value; }
    get textContent() { return this.own + this.kids.map(k => k.textContent).join(''); }
    set textContent(value) { this.replaceChildren(); this.own = String(value ?? ''); }
    set innerHTML(value) { counts.html++; this.textContent = value; }
    wrote() { for (let n = this; n; n = n.parentNode) n.writes++; }
    replaceChildren(...list) { this.kids.forEach(k => { k.parentNode = null; }); this.wrote();
      Object.assign(this, { kids: [], own: '' }).append(...list); }
    insertBefore(k, ref, at = this.kids.indexOf(ref)) {
      k = typeof k === 'string' ? doc.createTextNode(k) : k;
      this.wrote(k.parentNode?.removeChild(k));
      return this.kids.splice(at < 0 ? this.kids.length : at, 0, k) && (k.parentNode = this) && k;
    }
    append(...list) { for (const k of list) this.insertBefore(k, null); }
    appendChild(k) { return this.insertBefore(k, null); }
    removeChild(k) { this.wrote(); this.kids = this.kids.filter(x => x !== k); return k; }
    after(k, up = this.parentNode) { up?.insertBefore(k, up.kids[up.kids.indexOf(this) + 1]); }
    setAttribute(key, value) { this.wrote(); this.attrs[key] = String(value); }
    getAttribute(key) { return this.attrs[key] ?? null; }
    addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
    dispatchEvent(event) { counts.events += event.type === 'kit-change';
      (this.listeners[event.type] ?? []).forEach(fn => fn(event)); }
    querySelector(sel) { return below(this).find(k => '#' + k.id === sel) ?? null; }
    getBoundingClientRect() { return { width: 1280, height: 800, top: 0, left: 0 }; }
    cloneNode() { return new El(this.tagName, { ...this.attrs }); }
    replaceWith(fresh) { if (this.id) roots.set('#' + this.id, fresh); }
    getContext(type) { return type === '2d' ? noop : null; }
    toDataURL() { return 'data:image/png;base64,' + PNG.toString('base64'); }
    toBlob(fn) { fn(new Blob([PNG], { type: 'image/png' })); }
  }
  const body = new El('body'), make = sel => sel[0] === '#' ? new El(...attrs(sel.slice(1)))
    : new El(sel);
  const doc = { hidden: false, listeners: {}, body, createElement: tag => new El(tag),
    createTextNode: value => Object.assign(new El('#text'), { own: String(value) }),
    querySelector: sel => roots.get(sel) ?? body.appendChild(roots.set(sel, make(sel)).get(sel)),
    getElementById: id => doc.querySelector('#' + id), removeEventListener() {},
    addEventListener: El.prototype.addEventListener, dispatchEvent: El.prototype.dispatchEvent };
  let events = null, frame = null;
  const media = { matches: reduced, addEventListener() {}, removeEventListener() {} };
  const win = { AapoVoxel: { ...E, Renderer: class { polys = []; render() {} } }, document: doc,
    matchMedia: () => media, location: { search }, AudioContext: class {},
    ResizeObserver: class { observe() {} disconnect() {} }, setInterval, clearInterval };
  // GET goes to the server as is; POST is sent raw with the page Origin and recorded.
  const fetch = (path, options = {}, url = new URL(path, base)) => {
    if ((options.method ?? 'GET').toUpperCase() === 'GET') return realFetch(url, options);
    const p = (async (r = new Response(options.body)) => {
      const sent = { path: url.pathname + url.search, body: Buffer.from(await r.arrayBuffer()),
        headers: Object.fromEntries(new Headers(options.headers ?? {})) };
      sent.headers['content-type'] ??= r.headers.get('content-type') ?? undefined;
      const status = posts.push(sent) &&
        await post(port, sent.path, { ...sent.headers, origin: base }, sent.body);
      return { ok: status < 300, status, json: async () => ({}), text: async () => '' };
    })();
    return pending.push(p) && p;
  };
  Object.assign(globalThis, { window: win, document: doc, location: win.location, fetch,
    matchMedia: win.matchMedia, devicePixelRatio: 1, ResizeObserver: win.ResizeObserver,
    EventSource: class { constructor() { events = this; } close() {} },
    requestAnimationFrame: fn => { frame = fn; return 1; }, cancelAnimationFrame() {} });
  const off = s.subscribe(event => events?.onmessage?.({ data: JSON.stringify(event) }));
  for (const file of ['kit-panel.mjs', 'viewer.mjs']) await import(pathToFileURL(join(dir,
    file)).href + '?n=' + ++loads);
  return { win, counts, posts, pending, html, port, base, close: off,
    frames: (from, to) => { for (let i = from; i <= to; i++) frame?.(i * 16); },
    text: () => body.textContent,
    holder: want => [body, ...below(body)].filter(node => want.every(t =>
      node.textContent.includes(t))).sort((a, b) => a.textContent.length -
      b.textContent.length)[0] ?? null };
}
// Open a world, serve it, load the viewer, run the body, then always close both.
const served = async (name, search, reduced, body, s = session(), v = null) => {
  s.call('world_open', small(name));
  const server = await startHttp({ port: 0, session: s });
  try {
    return await body(s, async () => v = await viewer(s, server, { search, reduced }));
  } finally {
    v?.close(); server.closeAllConnections?.(); await server.stop();
  }
};

// feed-panel: the panel shows the last three lines, aria-live polite, quiet when idle, and the
// layout budget holds at both review sizes with three 80-byte lines.
await run('feed-panel', () => served('feed-panel', '?renderer=canvas', false, async (s, open) => {
  const lines = ['one', 'two', 'six', 'ten', 'new'].map(line80), fixed = {};
  for (const line of lines.slice(0, 4)) build(s, ['note', line]);
  const v = await open(), live = n => !!n && (n.getAttribute('aria-live') === 'polite' ||
    live(n.parentNode));
  const shown = (want, gone, label, node = v.holder(want)) => {
    check('feed-panel', node, label + ': the last three lines are not shown');
    check('feed-panel', !v.text().includes(gone), label + ': an older line is still shown');
    check('feed-panel', !node || live(node), label + ': no aria-live="polite" on the feed');
    return node;
  };
  v.frames(1, 5);
  shown(lines.slice(1, 4), lines[0], 'on load');
  build(s, ['note', lines[4]]);
  v.frames(6, 600);
  const node = shown(lines.slice(2, 5), lines[1], 'after a note');
  const writes = node?.writes, events = v.counts.events;
  v.frames(601, 720);
  check('feed-panel', node?.writes === writes && v.counts.events === events, '120 idle frames: ' +
    (node?.writes - writes) + ' writes, ' + (v.counts.events - events) + ' change events');
  check('feed-panel', v.counts.html === 0, 'the panel used innerHTML, not plain DOM');
  checkLayout(v.html, (rule, ok, detail) => check('feed-panel', ok, 'layout-budget ' + detail) +
    (m => m && (fixed[m[1]] = Number(m[2])))(/^kit (\d+)x\d+: fixed (\d+)/.exec(detail)));
  let id = ''; for (let n = node; n && !id; n = n.parentNode) id = n.id;
  const own = id && id !== 'kit' ? v.html.match(new RegExp('\\n#' + id + '\\s*\\{([^}]+)'))?.[1]
    : '';
  for (const [width, height, padding] of [[1280, 800, 20], [375, 812, 12]]) {
    const rows = /white-space:\s*nowrap/.test(own) ? 1
      : Math.ceil(80 * 14 * .62 / (width - 2 * padding));
    const feed = /position:\s*absolute/.test(own) ? 0 : 3 * (rows * 18 + 4);
    check('feed-panel', height - fixed[width] - feed >= 100, 'feed ' + width + 'x' + height +
      ': fixed ' + (fixed[width] + feed) + ', world ' + (height - fixed[width] - feed));
  }
}));

// feed-player: viewer playback of a noted script matches the server hash, feed and panel after
// every line in both motion modes, and a resync from the state carries the feed.
await run('feed-player', () => {
  for (const reduced of [false, true]) {
    const s = session(), p = createPlayer(E, { reduced });
    s.call('world_open', small('feed-player'));
    const compare = label => check('feed-player', !p.needsState && p.hash === hash(s.world) &&
      stable(p.world.feed) === stable(s.world.feed) &&
      stable(panelOf(p.world)) === stable(panelOf(s.world)),
    (reduced ? 'reduced ' : 'full ') + label + ': ' + p.hash + ' vs ' + hash(s.world));
    build(s, ['part', { part: 'store/water', per: 'game' }], ['part', { part: 'action/fill',
      on: '', then: [['add', 'water', 1], ['note', 'The well is filling.']] }],
    ['part', { part: 'beat/full', goal: 'Fill the well twice.', when: [['>=', 'water', 2]],
      says: 'Done.', then: [['note', 'The well is full.']] }]);
    build(s, ['note', RAIN], ['drop', 'brick', 3, 3, 6]);
    p.load(s.state()); compare('load');
    for (const ops of [[['do', 'fill'], ['drop', 'brick', 4, 4, 6]], [['do', 'fill']],
      [['note', LONG], ['stamp', 'cottage', 8, 8, 0]],
      [['note', 'One.'], ['note', 'Two.'], ['note', 'Three.']]]) {
      build(s, ...ops);
      p.enqueue({ rev: s.world.rev, line: s.lines.at(-1), hash: hash(s.world) });
      for (let i = 0; i < 10000 && p.busy; i++) p.step(1 / 60);
      compare('rev ' + s.world.rev);
    }
    check('feed-player', s.world.feed?.length === 5, 'feed holds ' + s.world.feed?.length);
  }
});

// motion-param: ?motion=reduce makes the player reduced at load, as the media query does.
await run('motion-param', async () => {
  const outcome = (search, reduced) => served('motion', '?renderer=canvas&step=1' + search,
    reduced, async (s, open) => {
      const v = await open(), drop = build(s, ['drop', 'brick', 2, 2, 8]);
      const first = v.win.genesisStep(1 / 60);
      return v.win.genesisStep(10) && drop && first;
    });
  const full = await outcome('', false), media = await outcome('', true);
  const param = await outcome('&motion=reduce', false);
  check('motion-param', full.busy && full.bodies > 0, 'full motion did not animate the drop');
  check('motion-param', !media.busy && media.bodies === 0, 'the media query did not reduce');
  check('motion-param', stable(param) === stable(media), '?motion=reduce gave ' +
    JSON.stringify(param) + ', the media query ' + JSON.stringify(media));
});

// shot-route: step mode genesisShot() posts PNG to /shot, saved at HOME/shots/NAME-REV.png; a
// foreign Origin or Host and a body over 2 MiB are refused; nothing is written outside HOME.
await run('shot-route', () => served('shot-yard', '?renderer=canvas&step=1', false,
  async (s, open) => {
    build(s, ['box', 'brick', 1, 1, 1, 2, 1, 2]);
    const v = await open(), h = resolve(s.home), mine = relative(WORK, h) + sep;
    const outside = () => [...tree(WORK).filter(f => !f.startsWith(mine)), ...readdirSync('.')];
    const shots = () => tree(join(h, 'shots')), before = outside();
  if (!check('shot-route', typeof v.win.genesisShot === 'function', 'no step genesisShot')) return;
    await v.win.genesisShot(); await Promise.all(v.pending);
    const sent = v.posts.find(p => p.path.split('?')[0] === '/shot');
    const file = join(h, 'shots', 'shot-yard-' + s.world.rev + '.png');
    check('shot-route', sent, 'genesisShot posted to ' + v.posts.map(p => p.path).join(' '));
    check('shot-route', existsSync(file) && readFileSync(file).equals(PNG),
      'no canvas PNG at shots/shot-yard-' + s.world.rev + '.png; shots: ' + shots().join(' '));
    if (!sent) return;
    const saved = stable(shots()), latin = sent.body.toString('latin1');
    const replay = (headers, data = sent.body) => post(v.port, sent.path,
      { ...sent.headers, host: '127.0.0.1:' + v.port, ...headers }, data);
    check('shot-route', await replay({ origin: 'http:' + '//evil.test' }) === 403, 'Origin');
    check('shot-route', await replay({ host: 'evil.test:' + v.port }) === 403, 'Host');
    const big = Buffer.concat([PNG, Buffer.alloc(2 * 1024 * 1024 + 1024)]);
    const raw = sent.body.indexOf(PNG), b64 = PNG.toString('base64');
    check('shot-route', raw >= 0 || latin.includes(b64), 'the body does not carry the PNG');
    const status = await replay({ origin: v.base }, raw >= 0 ? Buffer.concat([sent.body
      .subarray(0, raw), big, sent.body.subarray(raw + PNG.length)])
      : Buffer.from(latin.replace(b64, big.toString('base64')), 'latin1'));
    check('shot-route', status === 0 || status >= 400, 'a PNG over 2 MiB answered ' + status);
    check('shot-route', stable(shots()) === saved, 'a refused post changed HOME/shots');
    // A name smuggled into the path and body must still land inside HOME.
    await post(v.port, sent.path.replaceAll('shot-yard', '..%2F..%2Fx'), { ...sent.headers,
      origin: v.base }, Buffer.from(latin.replaceAll('shot-yard', '../../x'), 'latin1'));
    check('shot-route', stable(outside()) === stable(before), 'a shot wrote outside HOME');
    check('shot-route', shots().every(f => /^shot-yard-\d+\.png /.test(f)),
      'shots folder holds ' + shots().join(' '));
  }));

for (const note of notes) console.log('info ' + note);
for (const failure of failures) console.log('FAIL ' + failure.rule + ': ' + failure.detail);
console.log('engine-feed: ' + failures.length + ' failures');
process.exitCode = failures.length ? 1 : 0;
