// COPY-DRAFT: DOM and audio doubles verify behaviour without visual or listening claims.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { request } from 'node:http';
import { createPlayer } from '../viewer/player.mjs';
import { createKitFiles } from '../src/kit-files.mjs';
import { canonPart } from '../src/kit/canon.mjs';
import { createHash } from 'node:crypto';
import { TOOL_COPY, SERVER_INSTRUCTIONS } from '../src/copy.mjs';
import { OPS, expand } from '../src/core/ops.mjs';
import { KIT_OPS } from '../src/kit/kinds.mjs';
import { INPUT_OPS } from '../src/kit/inputs.mjs';
export function audioFake() {
  let now = 0, timer, made = 0, suspended = 0, fades = 0;
  const notes = [];
  const gain = () => ({ value: 0, setValueAtTime() {},
    linearRampToValueAtTime() { fades++; } });
  const context = { get currentTime() { return now; }, destination: {},
    createGain: () => ({ gain: gain(), connect() {} }),
    createOscillator: () => {
      const note = { frequency: { value: 0 }, connect() {},
        start(at) { note.at = at; },
        stop(end) { notes.push([note.frequency.value, note.at, end]); },
        disconnect() {} };
      return note;
    }, resume() {}, suspend() { suspended++; } };
  return { notes, context, clock: {
    setInterval(fn, delay) { assert.equal(delay, 200); timer = fn; return 1; },
    clearInterval() { timer = null; }
  }, makeContext() { made++; return context; },
  tick(t) { now = t; timer?.(); },
  get made() { return made; }, get running() { return !!timer; },
  get suspended() { return suspended; }, get fades() { return fades; } };
}
export async function runKitViewTests({ run, E, session, hash }) {
  await run('kit-player', async () => {
    const { panelOf } = await import('../src/kit/story.mjs');
    for (const file of readdirSync('fixtures/kit').filter(n => n.endsWith('-game.json'))) {
      const script = JSON.parse(readFileSync('fixtures/kit/' + file, 'utf8'));
      for (const reduced of [false, true]) {
        let changes = 0;
        const s = session(), p = createPlayer(E, { reduced, onChange() { changes++; } });
        s.call('world_open', script.open);
        p.load(s.state());
        for (const ops of script.batches) {
          s.call('world_build', { ops });
          p.enqueue({ rev: s.world.rev, line: s.lines.at(-1), hash: hash(s.world) });
          for (let i = 0; i < 10000 && p.busy; i++) p.step(1 / 60);
          assert.equal(p.needsState, false, file);
          assert.equal(p.hash, hash(s.world), file);
          assert.deepEqual(panelOf(p.world), panelOf(s.world));
        }
        changes = 0;
        for (let i = 0; i < 120; i++) p.step(1 / 60);
        assert.equal(changes, 0);
      }
    }
    const { startHttp } = await import('../src/http.mjs');
    const server = await startHttp({ port: 0, session: session() });
    try {
      for (const path of ['/kit-panel.mjs', '/music.mjs', '/kit/story.mjs']) {
        const status = await new Promise((resolve, reject) => {
          request({ host: '127.0.0.1', port: server.address().port, path }, res => {
            res.resume(); res.on('end', () => resolve(res.statusCode));
          }).on('error', reject).end();
        });
        assert.equal(status, 200, path);
      }
    } finally { await new Promise(resolve => server.close(resolve)); }
  });
  await run('music-score', async () => {
    const { notesOf, createMusic } = await import('../viewer/music.mjs');
    const files = createKitFiles();
    for (const bundle of files.catalogue().bundles) {
      for (const tune of files.bundle(bundle.id).parts.filter(p => p.part.startsWith('tune/'))) {
        assert.ok(tune.bpm >= 50 && tune.bpm <= 120);
        assert.ok(tune.voices.length <= 4);
        assert.deepEqual(canonPart(tune).part, tune);
      }
    }
    const tune = files.part('property:tune/stroll');
    // Frozen independently: seven melody notes and four bass notes per bar, at 84 bpm.
    const expected = [0, 2, 4, 2, 0, 4, 3].map((degree, i) =>
      [440 * 2 ** ((60 + [0, 2, 4, 7, 9][degree] - 69) / 12),
        [0, 2, 4, 6, 8, 10, 12][i] * 60 / 84 / 4, (i === 6 ? 3 : 1) * 60 / 84 / 4]);
    expected.push(...[0, 3, 0, 4].map((degree, i) =>
      [440 * 2 ** ((48 + [0, 2, 4, 7, 9][degree] - 69) / 12),
        i * 4 * 60 / 84 / 4, 4 * 60 / 84 / 4]));
    const frozen = expected.concat(expected.map(([f, t, d]) =>
      [f, t + 16 * 60 / 84 / 4, d])).sort((a, b) => a[1] - b[1]);
    const score = notesOf(tune, 0, 2);
    assert.deepEqual(score.map(n => [n.frequency, n.start, n.length]),
      frozen);
    const fake = audioFake(), music = createMusic(fake);
    music.update({ kit: { parts: { [tune.part]: tune,
      'mood/a': canonPart({ part: 'mood/a', tune: 'stroll' }).part }, s: {} } });
    music.toggle();
    for (let t = 0; t < 5.2; t += .2) fake.tick(t);
    assert.deepEqual(fake.notes.map(([f, t, end]) => [f, t, end - t])
      .map(row => row.map(n => +n.toFixed(6))),
    score.map(n => [n.frequency, n.start, n.length].map(v => +v.toFixed(6))));
    assert.throws(() => canonPart({ part: 'tune/bad', voices: [{ steps: '0 9' }] }),
      /voices.0.steps.1/);
    const slow = canonPart({ part: 'tune/slow', bpm: 60, voices: [{ steps: '1 . . .' }] }).part;
    for (const reduced of [false, true]) {
      const fake = audioFake(), music = createMusic(fake);
      const world = { kit: { parts: { [tune.part]: tune, [slow.part]: slow,
        'mood/a': canonPart({ part: 'mood/a', tune: 'stroll' }).part }, s: {} } };
      music.reduced(reduced); music.update(world); music.toggle();
      world.kit.parts['mood/a'].tune = 'slow';
      music.update(world);
      for (let t = .2; t < 4.2; t += .2) fake.tick(t);
      const boundary = 16 * 60 / 84 / 4;
      const slowFrequency = 440 * 2 ** ((62 - 69) / 12);
      const changed = fake.notes.filter(n => n[0] === slowFrequency);
      assert.equal(changed[0][1], boundary);
      assert.ok(Math.abs(changed[1][1] - changed[0][1] - (reduced ? 60 / 84 : 1)) < 1e-8);
      assert.equal(fake.fades === 0, reduced);
      const before = fake.notes.length;
      music.hidden(true);
      const stopped = fake.notes.length;
      fake.tick(100);
      assert.equal(fake.notes.length, stopped);
      assert.ok(stopped >= before && !fake.running && fake.suspended > 0);
      music.hidden(false); assert.equal(fake.running, true);
      music.toggle(); assert.equal(fake.running, false);
    }
  });
  await run('music-hash', async () => {
    const { createMusic } = await import('../viewer/music.mjs');
    const { moodOf } = await import('../src/kit/story.mjs');
    const script = JSON.parse(readFileSync('fixtures/kit/quest-game.json', 'utf8'));
    const hashes = [];
    for (const mode of ['off', 'on', 'muted']) {
      const s = session(), fake = audioFake(), music = createMusic(fake), values = [];
      s.call('world_open', script.open);
      if (mode !== 'off') music.toggle();
      if (mode === 'muted') music.toggle();
      for (const ops of script.batches) {
        s.call('world_build', { ops });
        const state = JSON.stringify(s.world.kit.s);
        music.update(s.world); moodOf(s.world); fake.tick(10);
        assert.equal(JSON.stringify(s.world.kit.s), state);
        values.push(hash(s.world));
      }
      hashes.push(values);
    }
    assert.deepEqual(hashes[0], hashes[1]);
    assert.deepEqual(hashes[1], hashes[2]);
  });
  // Frozen kit-click shadows (ids sort in insertion order): the printed op fires the named input.
  await run('kit-click-shadow', async () => {
    const s = session(), part = (n, o) => ['part', { part: n, ...o }];
    const add = st => ({ then: [['add', st, 1]] });
    s.call('world_open', { name: 'kcs' });
    s.call('world_build', { ops: ['a', 'b', 'c', 'd', 'e'].map(st => part('store/' + st, {}))
      .concat([part('place/pad', { at: [1, 1, 3, 3] }), part('place/dot', { at: [1, 1, 1, 1] }),
        part('place/zone', { at: [4, 5, 7, 8], tags: ['hot'] }),
        part('input/adot', { at: 'dot', ...add('e') }),
        part('input/bhot', { at: 'hot', ...add('a') }),
        part('input/cany', add('b')), part('input/dlone', { at: 'ghost' }),
        part('input/espace', { on: 'key', key: 'space', ...add('c') }),
        part('input/fkey', { on: 'key', key: 'space', ...add('d') })]) });
    const err = op => {
      try { s.call('world_build', { ops: [op] }); return ''; } catch (e) { return e.message; }
    };
    let fired = 0;
    for (const [id, st] of [['adot', 'e'], ['bhot', 'a'], ['cany', 'b'], ['espace', 'c']]) {
      const e = err(['do', id]), sent = /\["in",[^\]]*\]/.exec(e)?.[0] ?? '["in","x"]';
      assert.ok(e.includes('is an input, not an action'), id + ' ' + e);
      assert.equal(err(JSON.parse(sent)), '', id + ' ' + sent);
      const play = String(s.call('world_look', { view: 'kit', of: 'play' })).split('\n')[0];
      const sum = [...play.matchAll(/ (\d+)/g)].reduce((n, m) => n + Number(m[1]), 0);
      assert.ok((play + ' ').includes(' ' + st + ' 1 ') && sum === ++fired, id + ' ' + play);
    }
    for (const id of ['dlone', 'fkey']) {
      const e = err(['do', id]);
      assert.ok(e.includes('nothing reaches it') && !e.includes('["in"'), id + ' ' + e);
    }
  });
  // Frozen kit-op: ["kit", OP, ...] with an op name answers with the op on its own, which works.
  await run('kit-op', async () => {
    const s = session(), err = op => {
      try { s.call('world_build', { ops: [op] }); return ''; } catch (e) { return e.message; }
    };
    s.call('world_open', { name: 'kop' });
    const e = err(['kit', 'part', { part: 'store/fills', max: 3 }]);
    const want = '["part",{"part":"store/fills","max":3}]';
    assert.ok(e.includes('kit takes a bundle') && e.includes(want), e);
    assert.equal(err(JSON.parse(want)), '', want);
    const c = err(['kit', 'cut', 'store/fills']);
    assert.ok(c.includes('kit takes a bundle') && c.includes('["cut","store/fills"]'), c);
    assert.equal(err(['kit', 'nope']),
      'ops[0].kit: missing target nope; add it with ["part",{"part":"nope"}]');
    const long = err(['kit', 'part', { part: 'store/x', says: 'y'.repeat(300) }]);
    assert.ok(long.includes('send ["part",...] as its own op') &&
      Buffer.byteLength(long) <= 200, long);
    const i = err(['kit', 'in', 'click', 1, 2, 3]);
    assert.ok(i.includes('kit takes a bundle') && i.includes('["in","click",1,2,3]'), i);
    const p = String(s.call('world_look', { view: 'kit' }));
    assert.ok(p.includes('\nops, one array each: kit bundle [section]; part data') &&
      Buffer.byteLength(p) <= 1200, p.slice(0, 120));
  });
  // Frozen tool-kit (kit ops included in the tool text, 2026-11-18): the tool text
  // names part and in; schemas stay put; every named op is real and plays as written.
  // Text check c runs last, so a, b, d, e and f are proven before the copy lands.
  await run('tool-kit', async () => {
    assert.deepEqual(TOOL_COPY.map(t => t.name),
      ['world_open', 'world_build', 'world_look', 'world_undo'], 'a: four tools in order');
    const shape = JSON.stringify(TOOL_COPY.map(t => [t.name, t.inputSchema, t.annotations]));
    assert.ok(createHash('sha256').update(shape).digest('hex')
      .startsWith('2bf8c048a72983d7d470e95bf579a141a2'), 'b: schemas or annotations moved');
    const size = Buffer.byteLength(JSON.stringify({ jsonrpc: '2.0', id: 1,
      result: { tools: TOOL_COPY } })) + Buffer.byteLength(SERVER_INSTRUCTIONS);
    assert.ok(size <= 2800, 'd: tool list plus instructions ' + size + ' bytes, over 2800');
    const tables = new Set([...Object.keys(OPS), ...KIT_OPS, ...Object.keys(INPUT_OPS)]);
    const known = name => {
      if (tables.has(name)) return true;
      try { expand([[name]]); return true; } catch (error) { return error.code !== 'op'; }
    };
    for (const { name, description } of TOOL_COPY) {
      // An op is a bracket not nested in another op's arguments: [name, [a|b, or [name].
      for (const m of description.matchAll(/(?<![,|\w])\[([a-z]+(?:\|[a-z]+)*)[,|\]]/g)) {
        for (const op of m[1].split('|')) assert.ok(known(op), 'e: ' + name + ' names ' + op);
      }
    }
    const s = session(), part = (n, o) => ['part', { part: n, ...o }];
    const build = op => {
      try { return String(s.call('world_build', { ops: [op] })); } catch (e) {
        assert.fail('f: ' + JSON.stringify(op) + ' refused: ' + e.message);
      }
    };
    s.call('world_open', { name: 'tool-kit', fresh: true, size: [16, 16, 12] });
    // Field note: action.on defaults to "place", which makes [do,id] ask for a place once any
    // place exists; on "" is the action with no place. [do,id] is not in the tool text (11-18).
    const add = { then: [['add', 'fills', 1]] };
    s.call('world_build', { ops: [part('place/well', { at: [2, 2, 4, 4] }),
      part('store/fills', { max: 3 }), part('action/fill', { on: '', ...add }),
      part('input/tap', { at: 'well', ...add })] });
    build(['do', 'fill']);
    const last = build(['in', 'click', 3, 0, 3]);
    assert.ok(last.includes(' fills 2'), 'f: fills did not reach 2: ' + last);
    assert.equal(s.world.kit.s.store.fills.you, 2, 'f: fills store');
    const [, buildText, lookText] = TOOL_COPY.map(t => t.description);
    const line = ' Game parts, no kit needed: [part,{part:kind/id,..}]; ' +
      '[in,click,x,y,z].';
    assert.ok(buildText.endsWith('Doors face low z at turns 0.' + line),
      'c: world_build does not end with the kit ops line');
    assert.equal(lookText, 'Read the world as a small text map. Views: top, height, side, ' +
      'info, town. Kit view lists kinds; of store,goal gives both docs.', 'c: world_look text');
  });
  // Frozen click-copy (pkg/click-copy, 11-18): a click refusal says what to do. Size is [w,d,h],
  // so [20,14,10] gives x 0 to 19, y 0 to 9, z 0 to 13. Passing replies frozen on fa9c009.
  await run('click-copy', async () => {
    const part = (n, o) => ['part', { part: n, ...o }], add = { then: [['add', 'coins', 1]] };
    const open = (name, ops) => {
      const who = session();
      who.call('world_open', { name, fresh: true, size: [20, 14, 10] });
      who.call('world_build', { ops: [part('store/coins', {}), ...ops] });
      return who;
    };
    const key = part('input/ckey', { on: 'key', key: 'space', ...add });
    const s = open('click-copy', [part('input/atap', { at: 'hot', ...add }),
      part('input/btap', { at: 'pad', ...add }), key]);
    const err = (op, w = s) => {
      try { return 'OK ' + w.call('world_build', { ops: [op] }); } catch (e) { return e.message; }
    };
    const check = (who = s) => String(who.call('world_look', { view: 'kit', of: 'check' }));
    const MISS = 'ops[0].in: no input part matches; ', NONE = 'check: no problems';
    const OLD = MISS + 'add an input part for this click or key';
    const OUT = 'ops[0].in: click is outside the world; use x 0 to 19, y 0 to 9, z 0 to 13';
    const SHAPE = 'ops[0].in: wrong op shape; send ["in","click",x,y,z] or ["in","key",k]';
    // 1: no place part, a click input exists, any in-world click. 3: a key miss is unchanged.
    for (const at of [[2, 0, 2], [0, 0, 0], [19, 9, 13]]) assert.equal(err(['in', 'click',
      ...at]), MISS + 'clicks land only inside places; add a place part with at', '1: ' + at);
    assert.equal(err(['in', 'key', 'up']), OLD, '3: key up, no place');
    // 6: check names the first click input once (part id order); the key input is not named.
    assert.equal(check(), 'input/atap: clicks land only inside places; add a place part with at',
      '6: check with no place');
    // 4: integers outside the world name the largest indices, x then y then z.
    for (const at of [[20, 0, 0], [0, 10, 0], [0, 0, 14], [-1, 0, 0], [0, -1, 0], [99, 99, 99]]) {
      assert.equal(err(['in', 'click', ...at]), OUT, '4: ' + at);
    }
    // 5: wrong shape for in: length, non-integers, unknown second element.
    for (const op of [['in'], ['in', 'click', 1, 2], ['in', 'click', 1, 0, 1, 1],
      ['in', 'click', 1.5, 0, 1], ['in', 'click', '1', 0, 1], ['in', 'tap', 1, 0, 1],
      ['in', 'key'], ['in', 'key', 'space', 1], ['in', 'push', 'space']
    ]) assert.equal(err(op), SHAPE, '5: ' + JSON.stringify(op));
    // The form refusal for every other op is byte-identical to main.
    for (const op of [['do'], ['end', 1], ['cut'], ['say', 1, 2]]) assert.equal(err(op),
      'ops[0].' + op[0] + ': wrong op shape; use the catalogue example', 'form: ' + op[0]);
    // Places sort free, pad, zone; the first click input (atap) takes only zone, via tag hot.
    s.call('world_build', { ops: [part('place/pad', { at: [1, 1, 3, 3] }),
      part('place/zone', { at: [7, 8, 9, 11], tags: ['hot'] }),
      part('place/free', { at: [12, 0, 13, 1] })] });
    assert.equal(check(), NONE, '6: check with a place is unchanged');
    // 2: in the world, outside every place a click input could take.
    for (const at of [[5, 0, 5], [0, 0, 0], [19, 9, 13], [4, 0, 1]]) assert.equal(err(['in',
      'click', ...at]), MISS + 'click inside a place, such as zone at 7,8,9,11', '2: ' + at);
    // 3: inside a place no click input takes, and a key with no key input: unchanged.
    assert.equal(err(['in', 'click', 12, 0, 0]), OLD, '3: click in free');
    assert.equal(err(['in', 'click', 13, 5, 1]), OLD, '3: click in free, raised');
    assert.equal(err(['in', 'key', 'up']), OLD, '3: key up');
    assert.equal(err(['in', 'click', 20, 0, 0]), OUT, '4: with places');
    assert.equal(err(['in', 'click', 9, 0]), SHAPE, '5: with places');
    // Refused ops are not logged: the passing clicks fire and reply exactly as on main.
    const tail = ' count=280 fell=0 lost=0 sank=0 life=0 changed=0\nplay you coins ';
    assert.equal(err(['in', 'click', 9, 0, 9]), 'OK rev=3 hash=7c85dadc' + tail + 1, 'pass: zone');
    assert.equal(err(['in', 'click', 2, 0, 2]), 'OK rev=4 hash=851b9445' + tail + 2, 'pass: pad');
    assert.equal(s.world.kit.s.store.coins.you, 2, 'pass: coins');
    // 3: no click input at all, with or without a place: every in-world miss is unchanged.
    const k = open('click-copy-key', [part('place/pad', { at: [1, 1, 3, 3] }), key]);
    assert.equal(err(['in', 'click', 2, 0, 2], k), OLD, '3: no click input, in place');
    assert.equal(err(['in', 'click', 9, 0, 9], k), OLD, '3: no click input, outside places');
    const n = open('click-copy-none', [key]);
    assert.equal(err(['in', 'click', 2, 0, 2], n), OLD, '3: no place, no click input');
    assert.equal(check(k) + check(n), NONE + NONE, '6: no click input, no line');
  });
}
export async function checkKitTaste({ check, html, css, viewer, ALLOWED, core, E }) {
  for (const rule of ['kit-palette', 'kit-panel', 'music-off', 'talk-reading']) {
    try {
      const { createPanel, connectKit } = await import('../viewer/kit-panel.mjs');
      const { createMusic } = await import('../viewer/music.mjs');
      if (rule === 'kit-palette') {
        const source = readFileSync('viewer/kit-panel.mjs', 'utf8') + css;
        assert.ok((source.match(/#[a-f\d]{6}/gi) ?? []).every(c => ALLOWED.includes(c)));
      }
      if (rule === 'kit-panel') {
        const node = tag => ({ tag, children: [], setAttribute() {},
          replaceChildren(...items) { this.children = items; } });
        const root = node('section'), speech = node('section');
        const panel = createPanel({ createElement: node }, root, speech);
        panel.update({ chips: ['one'], objective: 'Keep going.', talk: {
          voice: 'Pip', lines: ['Hello.'], asks: [{ id: 'yes', says: 'Yes please' }] } });
        assert.equal(speech.children.at(-1).tag, 'ul');
        assert.equal(speech.children.at(-1).children[0].tag, 'li');
        let calls = 0;
        const p = createPlayer(E, { onChange() { calls++; } });
        p.load(null); calls = 0;
        for (let i = 0; i < 120; i++) p.step(1 / 60);
        assert.equal(calls, 0);
        assert.match(html, /id="speech"[^>]*aria-live="polite"/);
        assert.match(css, /#speech[^}]+position: absolute/s);
      }
      if (rule === 'music-off') {
        const fake = audioFake(), music = createMusic(fake);
        music.update(core.newWorld());
        assert.equal(fake.made, 0);
        music.toggle(); assert.equal(fake.made, 1);
        music.toggle(); assert.equal(fake.running, false);
        music.toggle(); music.hidden(true); assert.ok(fake.suspended > 0);
        music.reduced(true); assert.equal(fake.fades, 0);
        assert.match(html, /id="sound"[^>]*aria-label=[^>]*aria-pressed="false"/);
        assert.match(css, /min-height: 44px/);
        assert.ok(!viewer.slice(viewer.indexOf('function render(')).includes('music.'));
        const nodes = new Map(), listeners = {}, wired = audioFake();
        const node = () => ({ style: {}, offsetTop: 20, clientHeight: 100,
          attributes: {}, setAttribute(key, value) { this.attributes[key] = value; },
          replaceChildren(...children) { this.children = children; } });
        const document = { hidden: false, createElement: node,
          addEventListener(name, fn) { listeners[name] = fn; },
          querySelector(name) {
            if (!nodes.has(name)) nodes.set(name, node());
            return nodes.get(name);
          } };
        connectKit(document, { ...wired.clock,
          AudioContext: class { constructor() { return wired.makeContext(); } },
          ResizeObserver: class { observe() {} },
          matchMedia: () => ({ matches: true, addEventListener() {} }) });
        listeners['kit-change']({ detail: core.newWorld() });
        assert.equal(wired.made, 0);
        const button = nodes.get('#sound');
        assert.equal(button.attributes['aria-pressed'], 'false');
        button.onclick();
        assert.equal(wired.made, 1);
        assert.equal(button.attributes['aria-pressed'], 'true');
        document.hidden = true; listeners.visibilitychange();
        assert.equal(wired.running, false);
        button.onclick();
        assert.equal(button.attributes['aria-pressed'], 'false');
        assert.equal(nodes.get('#speech').style.maxHeight, '100px');
      }
      if (rule === 'talk-reading') for (const item of createKitFiles().catalogue().bundles) {
        const talks = createKitFiles().bundle(item.id).parts
          .filter(p => p.part.startsWith('talk/'));
        for (const talk of talks) {
          assert.ok(talk.lines.length <= 3 && talk.asks.length <= 3);
          for (const line of [...talk.lines, ...talk.asks.map(a => a.says)]) {
            assert.ok(line.length <= 70 && line.split(/\s+/).length <= 12, line);
            assert.ok(line.split(/\W+/).every(word => word.length <= 10), line);
          }
        }
      }
      check(rule, true);
    } catch (error) { check(rule, false, error.message); }
  }
}
