// Frozen engine save checks.
// Run alone: node tests/engine-save.mjs. Not imported by the four suites until wave 2 merges.
// Export is driven through the CLI only, so this file loads and runs on a tree without export.
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, existsSync, readdirSync }
  from 'node:fs';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const failures = [];
const notes = [];
const check = (rule, ok, detail = '') => {
  if (!ok) failures.push({ rule, detail: String(detail).replaceAll('\n', ' / ') });
};
const info = (topic, text) => notes.push(topic + ': ' + text);
const test = async (rule, fn) => {
  try {
    await fn();
  } catch (error) {
    check(rule, false, String(error.message).split('\n')[0].slice(0, 160));
  }
};
const only = process.argv.find(arg => arg.startsWith('--only='))?.slice(7).split(',');
const run = async (rule, fn) => {
  if (!only || only.includes(rule)) await test(rule, fn);
};
mkdirSync('.agent-work/engine-save', { recursive: true });
const home = () => mkdtempSync(resolve('.agent-work/engine-save/run-'));
process.env.VOXEL_GENESIS_HOME = home();
process.env.VOXEL_GENESIS_PORT = '0';
process.env.VOXEL_GENESIS_NO_LOG = '1';
delete process.env.VOXEL_GENESIS_KIT;
const { createToolSession } = await import('../src/session.mjs');
const { hash } = await import('../src/core/codec.mjs');
const { KINDS } = await import('../src/kit/kinds.mjs');
const { TOOL_COPY, SERVER_INSTRUCTIONS } = await import('../src/copy.mjs');
const session = (h = home(), cwd) => createToolSession({ home: h, cwd });
const build = (s, ...ops) => s.call('world_build', { ops });
const small = name => ({ name, size: [16, 16, 12], seed: 3, fresh: true });
const BIN = resolve('bin/voxel-genesis.mjs');
const FIX = {
  property: 'fixtures/kit/property-game.json',
  quest: 'fixtures/kit/quest-game.json',
  plain: 'fixtures/small-town.json'
};
// Every child gets its own VOXEL_GENESIS_HOME under .agent-work; never the user's save folder.
const cli = (args, cwd, h) => {
  const r = spawnSync(process.execPath, [BIN, ...args],
    { cwd, encoding: 'utf8', env: { ...process.env, VOXEL_GENESIS_HOME: h }, timeout: 60000 });
  let out = null;
  try {
    out = JSON.parse((r.stdout ?? '').trim().split('\n').at(-1));
  } catch {
    out = null;
  }
  return { status: r.status, out, text: ((r.stdout ?? '') + (r.stderr ?? '')).trim() };
};
// Judgement: the scope fixes no exit code. Success is exit 0 with a printed hash; a refusal is a
// non-zero exit or an {error} reply. Wording of a refusal is free except that it names --section.
const ok = r => r.status === 0 && Boolean(r.out) && !r.out.error && typeof r.out.hash === 'string';
const refused = r => r.status !== 0 || Boolean(r.out?.error);
const said = r => 'exit ' + r.status + ' ' + r.text.slice(0, 120);
const live = (path, h = home()) => {
  const s = session(h);
  const script = JSON.parse(readFileSync(path, 'utf8'));
  s.call('world_open', { ...script.open, fresh: true });
  for (const ops of script.batches) build(s, ...ops);
  return s;
};
// Active builds after folding undo records, as core replay counts them.
const active = lines => lines.reduce((n, line) => line.ops ? n + 1 : n - line.undo, 0);
const digest = bytes => createHash('sha256').update(bytes).digest('hex').slice(0, 16);
const tree = (dir, at = '') => existsSync(join(dir, at)) ? readdirSync(join(dir, at),
  { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? tree(dir, join(at, entry.name))
  : [join(at, entry.name) + ' ' + digest(readFileSync(join(dir, at, entry.name)))]).sort() : [];
// Judgement: "equal (JSON)" is read as equal JSON with object keys sorted, so key order is free.
const stable = value => JSON.stringify(value, (key, item) =>
  item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(
    Object.entries(item).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : item);
const kindOf = part => part.part.split('/')[0];
const runFile = (folder, name) => join(folder, name + '.run.json');
const kitFile = (folder, name) => join(folder, 'voxel-kit', name + '.json');
const kitBuild = (s, parts) => {
  for (let i = 0; i < parts.length; i += 10) {
    build(s, ...parts.slice(i, i + 10).map(part => ['part', part]));
  }
};

// export-run: export NAME then run NAME.run.json in a fresh home reaches the live hash and the
// active build count; undo records are folded into the active builds.
await run('export-run', () => {
  for (const [label, path, undo] of [['property', FIX.property, false],
    ['quest', FIX.quest, true], ['plain', FIX.plain, true]]) {
    const h = home();
    const s = live(path, h);
    if (undo) {
      build(s, ['box', 'rock', 1, 1, 1, 2, 1, 2]);
      s.call('world_undo');
    }
    const name = s.world.name, want = hash(s.world), rev = active(s.lines);
    const folder = home();
    const r = cli(['export', name], folder, h);
    if (!ok(r)) {
      check('export-run', false, label + ': export not done, ' + said(r));
      continue;
    }
    // Judgement: a plain world must print run and hash; kit, parts and bytes are required only
    // for kit worlds, since the scope does not say what a bundle of a plain world holds.
    const keys = s.world.kit ? ['kit', 'run', 'parts', 'bytes', 'hash'] : ['run', 'hash'];
    check('export-run', keys.every(key => Object.hasOwn(r.out, key)),
      label + ': printed keys ' + Object.keys(r.out).join(','));
    check('export-run', r.out.hash === want, label + ': printed hash ' + r.out.hash + ' not ' +
      want);
    const file = runFile(folder, name);
    check('export-run', existsSync(file) && resolve(folder, String(r.out.run)) === file,
      label + ': run file not at ' + name + '.run.json, printed ' + r.out.run);
    if (!existsSync(file)) continue;
    const text = readFileSync(file, 'utf8');
    const script = JSON.parse(text);
    check('export-run', script.open && typeof script.open === 'object' &&
      Array.isArray(script.batches) && script.batches.every(Array.isArray) &&
      !/"undo"/.test(text), label + ': run file is not {open, batches} of active builds');
    const replay = cli(['run', name + '.run.json'], folder, home());
    check('export-run', replay.out?.hash === want && replay.out?.rev === rev,
      label + ': run gave ' + said(replay) + ', want ' + want + ' rev ' + rev);
    if (undo) info('export-run', label + ' live rev ' + s.world.rev + ', active builds ' + rev);
  }
});

// export-kit: the exported bundle reopens with equal parts; a kit-only world reopens to its hash.
await run('export-kit', () => {
  const kitOnly = () => {
    const s = session();
    s.call('world_open', small('kit-only'));
    build(s, ['part', { part: 'store/water', per: 'game' }], ['part', { part: 'store/gems' }],
      ['part', { part: 'action/fill', on: '', then: [['add', 'water', 1]] }],
      ['part', { part: 'beat/first', goal: 'Fill the well.', when: [['>=', 'water', 2]],
        says: 'Done.' }]);
    build(s, ['edit', 'beat/first', 'says', 'Well done.'], ['cut', 'store/gems']);
    return s;
  };
  for (const [label, make, sameHash] of [['property', () => live(FIX.property), false],
    ['kit-only', kitOnly, true]]) {
    const s = make();
    const name = s.world.name;
    const folder = home();
    const r = cli(['export', name], folder, s.home);
    if (!ok(r)) {
      check('export-kit', false, label + ': export not done, ' + said(r));
      continue;
    }
    const file = kitFile(folder, name);
    check('export-kit', existsSync(file) && resolve(folder, String(r.out.kit)) === file,
      label + ': bundle not at voxel-kit/' + name + '.json, printed ' + r.out.kit);
    if (!existsSync(file)) continue;
    const raw = readFileSync(file);
    const bundle = JSON.parse(raw.toString('utf8'));
    const count = Object.keys(s.world.kit.parts).length;
    check('export-kit', bundle.kit === 1 && bundle.id === name && Array.isArray(bundle.parts) &&
      stable(bundle.size) === stable([s.world.w, s.world.d, s.world.h]) &&
      bundle.rules === s.world.rulesId, label + ': bundle head ' + stable({ ...bundle,
      parts: undefined }).slice(0, 120));
    check('export-kit', bundle.parts?.length === count && r.out.parts === count,
      label + ': parts ' + bundle.parts?.length + ' printed ' + r.out.parts + ' live ' + count);
    // Judgement: bytes is read as the byte length of the bundle file written on disk.
    check('export-kit', r.out.bytes === raw.length,
      label + ': printed bytes ' + r.out.bytes + ', file ' + raw.length);
    const t = session(home(), folder);
    t.call('world_open', { name: 'reopened', kit: name, seed: s.world.seed, fresh: true });
    check('export-kit', stable(t.world.kit.parts) === stable(s.world.kit.parts),
      label + ': reopened parts differ from the live parts');
    if (sameHash) {
      check('export-kit', hash(t.world) === hash(s.world),
        label + ': reopened hash ' + hash(t.world) + ' not ' + hash(s.world));
    }
  }
});

// export-cap: over 48 parts or 8,192 bundle bytes is refused naming --section with nothing
// written; --section play writes only play kinds; an existing file needs --force.
await run('export-cap', () => {
  const h = home();
  const world = (name, parts) => {
    const s = session(h);
    s.call('world_open', small(name));
    kitBuild(s, parts);
    return s;
  };
  const stores = Array.from({ length: 30 }, (_, i) => ({ part: 'store/jar-' + (i + 1) }));
  const steps = Array.from({ length: 19 }, (_, i) =>
    ({ part: 'beat/step-' + (i + 1), goal: 'Step ' + (i + 1) + '.' }));
  const many = world('many', [...stores, ...steps]);
  const long = 'Walk the long road past the mill, the bridge and the old orchard wall. ';
  const big = world('big', Array.from({ length: 20 }, (_, i) =>
    ({ part: 'beat/long-' + (i + 1), goal: long.repeat(6).trim(), says: long.trim() })));
  info('export-cap', 'many has ' + Object.keys(many.world.kit.parts).length + ' parts, big ' +
    Buffer.byteLength(JSON.stringify(Object.values(big.world.kit.parts))) + ' part bytes in ' +
    Object.keys(big.world.kit.parts).length + ' parts');
  for (const name of ['many', 'big']) {
    const folder = home();
    const r = cli(['export', name], folder, h);
    check('export-cap', refused(r) && r.text.includes('--section'),
      name + ': over cap not refused naming --section, ' + said(r));
    check('export-cap', tree(folder).length === 0, name + ': wrote ' + tree(folder).join(','));
  }
  const folder = home();
  const r = cli(['export', 'many', '--section', 'play'], folder, h);
  if (!ok(r)) {
    check('export-cap', false, 'many --section play not done, ' + said(r));
  } else {
    // Judgement: the scope does not name the sectioned file, so it is found by the printed path.
    const file = resolve(folder, String(r.out.kit));
    const parts = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')).parts ?? [] : [];
    const play = Object.values(many.world.kit.parts)
      .filter(part => KINDS[kindOf(part)]?.section === 'play');
    check('export-cap', parts.length > 0 &&
      parts.every(part => KINDS[kindOf(part)]?.section === 'play'),
      'section play bundle holds ' + parts.map(part => part.part).slice(0, 4).join(' '));
    check('export-cap', stable(parts.map(part => part.part).sort()) ===
      stable(play.map(part => part.part).sort()), 'section play parts ' + parts.length +
      ', live play parts ' + play.length);
  }
  const keep = world('keep', [{ part: 'store/water' },
    { part: 'action/fill', on: '', then: [['add', 'water', 1]] }]);
  for (const target of ['kit', 'run']) {
    const folder = home();
    const file = target === 'kit' ? kitFile(folder, 'keep') : runFile(folder, 'keep');
    mkdirSync(join(folder, 'voxel-kit'), { recursive: true });
    writeFileSync(file, 'keep\n');
    const before = tree(folder);
    const r = cli(['export', 'keep'], folder, keep.home);
    check('export-cap', refused(r), target + ' file exists: export not refused, ' + said(r));
    check('export-cap', stable(tree(folder)) === stable(before),
      target + ' file exists: folder changed on refusal');
    const forced = cli(['export', 'keep', '--force'], folder, keep.home);
    check('export-cap', ok(forced) && existsSync(kitFile(folder, 'keep')) &&
      readFileSync(kitFile(folder, 'keep'), 'utf8') !== 'keep\n' &&
      readFileSync(runFile(folder, 'keep'), 'utf8') !== 'keep\n',
      target + ' file exists: --force did not write, ' + said(forced));
  }
});

// MCP door bytes the way lint kit-budget counts them: tool list reply plus instructions.
const lintBytes = () => Buffer.byteLength(JSON.stringify({ jsonrpc: '2.0', id: 1,
  result: { tools: TOOL_COPY } })) + Buffer.byteLength(SERVER_INSTRUCTIONS);
const mcpBytes = (cwd, h) => {
  const input = [{ jsonrpc: '2.0', id: 0, method: 'initialize',
    params: { protocolVersion: '2025-06-18' } }, { jsonrpc: '2.0', id: 1, method: 'tools/list' }]
    .map(line => JSON.stringify(line)).join('\n') + '\n';
  const r = spawnSync(process.execPath, [BIN, 'mcp'], { cwd, input, encoding: 'utf8',
    env: { ...process.env, VOXEL_GENESIS_HOME: h }, timeout: 30000 });
  const lines = (r.stdout ?? '').trim().split('\n');
  const first = JSON.parse(lines.find(line => JSON.parse(line).id === 0) ?? 'null');
  const tools = lines.find(line => JSON.parse(line).id === 1) ?? '';
  return Buffer.byteLength(tools) + Buffer.byteLength(first?.result?.instructions ?? '');
};

// export-pure: export leaves the log, current and the hash unchanged, and no tool schema change.
// Judgement: kit-budget "before and after" is measured over the MCP door in the export folder
// before and after the bundle lands in its voxel-kit, and must equal the lint count of the tree
// under test. A frozen byte number would turn red when wave 4 legitimately grows the tools.
await run('export-pure', () => {
  const h = home();
  const s = live(FIX.property, h);
  const name = s.world.name, want = hash(s.world);
  const other = session(h);
  other.call('world_open', small('other'));
  build(other, ['box', 'brick', 1, 1, 1, 1, 1, 1]);
  const state = () => ({
    log: readFileSync(join(h, 'worlds', name + '.jsonl'), 'utf8'),
    current: readFileSync(join(h, 'current'), 'utf8'),
    worlds: tree(join(h, 'worlds'))
  });
  const before = state();
  const folder = home();
  const budget = mcpBytes(folder, h);
  const r = cli(['export', name], folder, h);
  check('export-pure', ok(r) && r.out.hash === want, 'export not done, ' + said(r));
  const after = state();
  check('export-pure', after.log === before.log, 'world log changed by export');
  check('export-pure', after.current === before.current,
    'current moved from ' + before.current.trim() + ' to ' + after.current.trim());
  check('export-pure', stable(after.worlds) === stable(before.worlds),
    'worlds folder changed: ' + after.worlds.length + ' files, was ' + before.worlds.length);
  const t = session(h);
  t.call('world_open', { name });
  check('export-pure', hash(t.world) === want && t.world.rev === s.world.rev,
    'reopened ' + hash(t.world) + ' rev ' + t.world.rev + ', want ' + want + ' rev ' +
    s.world.rev);
  const later = mcpBytes(folder, h);
  check('export-pure', budget === later && later === lintBytes(),
    'kit-budget bytes before ' + budget + ', after ' + later + ', lint ' + lintBytes());
  info('export-pure', 'kit-budget bytes ' + lintBytes() + ', bundle present after export ' +
    existsSync(kitFile(folder, name)));
});

// engine-reopen: gap 11 shape, self-contained (no District Deck needed). Three actions point at a
// store added later in the same batch, so the build kept three "missing target" warnings that
// of:"check" no longer finds, and the last batch moved no beat, so the reply had no story line.
await run('engine-reopen', () => {
  const h = home();
  const s = session(h);
  s.call('world_open', small('gap-eleven'));
  build(s, ['part', { part: 'store/water', per: 'game' }],
    ['part', { part: 'beat/first', goal: 'Fill the well.', when: [['>=', 'water', 2]],
      says: 'Done.' }],
    ['part', { part: 'action/fill', on: '', then: [['add', 'water', 1]] }]);
  build(s, ['part', { part: 'action/dig', on: '', then: [['add', 'gems', 1]] }],
    ['part', { part: 'action/mine', on: '', then: [['add', 'gems', 2]] }],
    ['part', { part: 'action/sift', on: '', then: [['add', 'gems', 1]] }],
    ['part', { part: 'store/gems', per: 'game' }]);
  const checked = s.call('world_look', { view: 'kit', of: 'check' });
  const story = s.call('world_look', { view: 'kit', of: 'story' }).split('\n')[0];
  info('engine-reopen', 'check reads "' + checked + '", story line "' + story + '"');
  const reply = session(h).call('world_open', { name: 'gap-eleven' });
  const listed = String(reply.kit ?? '').split('\n').slice(1).filter(Boolean);
  check('engine-reopen', listed.length === 0 && !/missing/.test(JSON.stringify(reply)),
    'reopen lists ' + listed.length + ' warnings while check reads none: ' + listed[0]);
  const lines = Object.values(reply).filter(value => typeof value === 'string')
    .flatMap(value => value.split('\n'));
  check('engine-reopen', story.startsWith('story ') && lines.includes(story),
    'reopen reply has no story line "' + story + '"');
  // A real problem in the current parts is still listed on reopen, as of:"check" lists it.
  const bad = session(h);
  bad.call('world_open', small('gap-real'));
  build(bad, ['part', { part: 'action/dig', on: '', then: [['add', 'gems', 1]] }]);
  const issues = bad.call('world_look', { view: 'kit', of: 'check' }).split('\n')
    .map(line => line.split(': ')[0].split('.')[0]);
  const again = String(session(h).call('world_open', { name: 'gap-real' }).kit ?? '');
  check('engine-reopen', issues.length > 0 && issues.every(part => again.includes(part)),
    'reopen drops a real problem: check names ' + issues.join(' ') + ', reply ' + again);
});

// play-props: of:"play" keeps id:owner:level and appends each other non-default board prop as
// k=v, within 900 bytes, for property after 12 quarters.
// Judgement: "non-default" is read against the board part's props defaults; the separator
// between a place token and its k=v pairs is left free. Other place fields are not asserted.
await run('play-props', () => {
  const s = live(FIX.property);
  const view = s.call('world_look', { view: 'kit', of: 'play' });
  check('play-props', Buffer.byteLength(view) <= 900, 'play view ' + Buffer.byteLength(view) +
    ' bytes');
  check('play-props', s.world.kit.s.turn === 12, 'property not at quarter 12: ' +
    s.world.kit.s.turn);
  const defaults = Object.assign({}, ...Object.values(s.world.kit.parts)
    .filter(part => kindOf(part) === 'board').map(part => part.props));
  const keys = Object.keys(defaults).filter(key => !['owner', 'level'].includes(key));
  const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const places = Object.values(s.world.kit.s.place ?? {}).map(place => {
    const token = place.id + ':' + (place.owner || '.') + ':' + (place.level ?? 0);
    const found = new RegExp('(^|\\s)' + escape(token) + '(?![\\w-])', 'm').exec(view);
    return { place, token, start: found ? found.index + found[1].length : -1 };
  });
  const lost = places.filter(item => item.start < 0).map(item => item.token);
  check('play-props', places.length > 0 && lost.length === 0,
    'missing id:owner:level for ' + lost.slice(0, 4).join(' '));
  const order = places.filter(item => item.start >= 0).sort((a, b) => a.start - b.start);
  const wrong = [];
  let shown = 0;
  order.forEach((item, index) => {
    const end = order[index + 1]?.start ?? view.length;
    const segment = view.slice(item.start + item.token.length, end);
    for (const key of keys) {
      const value = item.place[key];
      const pair = new RegExp('(^|[^\\w-])' + escape(key) + '=' +
        (stable(value) === stable(defaults[key]) ? '' : escape(String(value)) + '(?![\\w.-])'));
      const want = stable(value) !== stable(defaults[key]);
      if (want) shown++;
      if (pair.test(segment) !== want) {
        wrong.push(item.place.id + ' ' + key + '=' + String(value) + (want ? ' absent' : ' shown'));
      }
    }
  });
  check('play-props', shown > 0, 'property has no non-default board prop to show');
  check('play-props', wrong.length === 0, wrong.length + ' wrong: ' + wrong.slice(0, 4)
    .join(', '));
  info('play-props', 'play view ' + Buffer.byteLength(view) + ' bytes, ' + places.length +
    ' places, ' + shown + ' non-default props, keys ' + keys.join(' '));
});

for (const note of notes) console.log('info ' + note);
for (const failure of failures) console.log('FAIL ' + failure.rule + ': ' + failure.detail);
console.log('engine-save: ' + failures.length + ' failures');
process.exitCode = failures.length ? 1 : 0;
