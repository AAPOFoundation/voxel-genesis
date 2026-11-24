// Frozen engine next checks.
// Run alone: node tests/engine-next.mjs. Not imported by the four suites until wave 1 merges.
import { readFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
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
mkdirSync('.agent-work/engine-next', { recursive: true });
const home = () => mkdtempSync(resolve('.agent-work/engine-next/run-'));
process.env.VOXEL_GENESIS_HOME = home();
process.env.VOXEL_GENESIS_PORT = '0';
process.env.VOXEL_GENESIS_NO_LOG = '1';
const { createToolSession } = await import('../src/session.mjs');
const { hash } = await import('../src/core/codec.mjs');
const session = (h = home()) => createToolSession({ home: h });
const build = (s, ...ops) => s.call('world_build', { ops });
const fails = (fn, pattern) => {
  try {
    fn();
  } catch (error) {
    return pattern.test(error.message) ? error.message : '';
  }
  return '';
};
const records = (h, name) => readFileSync(join(h, 'worlds', name + '.jsonl'), 'utf8')
  .trimEnd().split('\n').length - 1;
const small = name => ({ name, size: [16, 16, 12], seed: 3, fresh: true });
const canLine = reply => reply.split('\n').find(line => line.startsWith('can ')) ?? '';
const playLine = reply => reply.split('\n').find(line => line.startsWith('play ')) ?? '';
const turnPack = ['turn', 'bot', 'deck', 'advisor'];

// neutral-probe: report what the neutral parts do today with every turn-pack part absent.
await run('neutral-probe', () => {
  const quest = session();
  quest.call('world_open', { name: 'probe-quest', kit: 'quest', seed: 7, fresh: true });
  const kinds = Object.keys(quest.world.kit.parts).map(key => key.split('/')[0]);
  info('neutral-probe', 'quest turn-pack parts: ' +
    (kinds.filter(kind => turnPack.includes(kind)).join(' ') || 'none'));
  const said = build(quest, ['say', 'yes']);
  info('neutral-probe', 'quest reply play line "' + playLine(said) + '", can line "' +
    canLine(said) + '"');
  const two = session();
  two.call('world_open', small('probe-two'));
  build(two, ['part', { part: 'player/alex' }], ['part', { part: 'player/sam' }],
    ['part', { part: 'store/gems' }],
    ['part', { part: 'action/dig', on: '', then: [['add', 'gems', 1]] }]);
  build(two, ['do', 'dig']);
  info('neutral-probe', 'two players, no turn part, one dig: gems ' +
    JSON.stringify(two.world.kit.s.store.gems));
  const limit = session();
  limit.call('world_open', small('probe-limit'));
  build(limit, ['part', { part: 'store/water', per: 'game' }],
    ['part', { part: 'action/fill', on: '', max: 1, then: [['add', 'water', 1]] }]);
  build(limit, ['do', 'fill']);
  info('neutral-probe', 'second fill with max 1 and no turn part: ' +
    (fails(() => build(limit, ['do', 'fill']), /./) || 'accepted'));
  const garden = session();
  garden.call('world_open', { name: 'probe-garden', kit: 'garden', seed: 7, fresh: true });
  build(garden, ['cut', 'turn/day'], ['cut', 'deck/weather']);
  const before = JSON.stringify(garden.world.kit.s.turn ?? null);
  build(garden, ['end']);
  info('neutral-probe', 'garden with turn/day and deck/weather cut: end moves turn ' + before +
    ' to ' + JSON.stringify(garden.world.kit.s.turn ?? null));
  const cut = session();
  cut.call('world_open', { name: 'probe-cut', kit: 'garden', seed: 7, fresh: true });
  const total = Object.keys(cut.world.kit.parts).length;
  build(cut, ['cut', 'play']);
  info('neutral-probe', 'cut play on garden leaves ' + Object.keys(cut.world.kit.parts).length +
    ' of ' + total + ' parts, so stores and actions go with the turn pack; of:play starts ' +
    JSON.stringify(cut.call('world_look', { view: 'kit', of: 'play' }).slice(0, 12)));
  const score = session();
  score.call('world_open', small('probe-score'));
  build(score, ['part', { part: 'store/coins' }],
    ['part', { part: 'action/earn', on: '', then: [['add', 'coins', 1]] }],
    ['part', { part: 'goal/most', score: 'coins' }]);
  build(score, ['do', 'earn'], ['end'], ['end'], ['end']);
  info('neutral-probe', 'score goal with no turn part after three ends: over ' +
    JSON.stringify(score.world.kit.s.over ?? null));
  const drop = session();
  drop.call('world_open', small('probe-drop'));
  build(drop, ['part', { part: 'beat/four', when: [['>=', 'blocks.brick', 4]], says: 'Done.' }]);
  const dropped = build(drop, ['drop', 'brick', 3, 3, 4]);
  info('neutral-probe', 'beat on four dropped bricks done in the drop reply: ' +
    String(Boolean(drop.world.kit.s.beat?.four) && dropped.includes('story')));
  const imports = ['parts', 'story'].map(name => name + ' imports play.mjs ' +
    readFileSync('src/kit/' + name + '.mjs', 'utf8').includes("from './play.mjs'"));
  info('neutral-probe', imports.join(', '));
});

// neutral-quiet: no turn-pack part means no moves field, no end in the can line, no empty can line.
await run('neutral-quiet', () => {
  const s = session();
  s.call('world_open', small('quiet'));
  const first = build(s, ['part', { part: 'store/water', per: 'game' }],
    ['part', { part: 'action/fill', on: '', max: 1, then: [['add', 'water', 1]] }]);
  check('neutral-quiet', !/\| moves \d/.test(playLine(first)), 'moves shown: ' + playLine(first));
  check('neutral-quiet', canLine(first) && !/\bend\b/.test(canLine(first)),
    'can line: ' + canLine(first));
  const used = build(s, ['do', 'fill']);
  check('neutral-quiet', canLine(used) === '', 'can line with nothing legal: ' + canLine(used));
  const view = s.call('world_look', { view: 'kit', of: 'play' });
  check('neutral-quiet', !/\bend\b/.test(view) && !/moves \d/.test(view), 'play view: ' + view);
  const garden = session();
  garden.call('world_open', { name: 'quiet-cut', kit: 'garden', seed: 7, fresh: true });
  build(garden, ['cut', 'play']);
  const board = garden.call('world_look', { view: 'kit', of: 'play' });
  check('neutral-quiet', !board.startsWith('\n'), 'play view starts with a blank line');
});

// neutral-turn-kept: with a turn part the frozen turn wording stays exactly as it is today.
await run('neutral-turn-kept', () => {
  const s = session();
  s.call('world_open', small('kept'));
  const reply = build(s, ['part', { part: 'store/water', per: 'game' }],
    ['part', { part: 'action/fill', on: '', then: [['add', 'water', 1]] }],
    ['part', { part: 'turn/round', moves: 2 }]);
  check('neutral-turn-kept', /\| moves 2$/.test(playLine(reply)), playLine(reply));
  check('neutral-turn-kept', /\| end$/.test(canLine(reply)), canLine(reply));
  const ended = build(s, ['do', 'fill'], ['do', 'fill']);
  check('neutral-turn-kept', canLine(ended) === 'can end', canLine(ended));
});

// neutral-actor: with player parts and no turn part, do acts as the first player by id.
await run('neutral-actor', () => {
  const s = session();
  s.call('world_open', small('actor'));
  build(s, ['part', { part: 'player/sam' }], ['part', { part: 'player/alex' }],
    ['part', { part: 'store/gems' }],
    ['part', { part: 'action/dig', on: '', then: [['add', 'gems', 1]] }]);
  build(s, ['do', 'dig']);
  const state = s.world.kit.s;
  check('neutral-actor', JSON.stringify(state.store.gems) === '{"alex":1,"sam":0}',
    'gems ' + JSON.stringify(state.store.gems));
  check('neutral-actor', !Object.hasOwn(state, 'who'), 'who written into state');
  check('neutral-actor', /alex gems 1/.test(s.call('world_look', { view: 'kit', of: 'play' })),
    'play view does not credit alex');
});

// neutral-limit: an action over its max names the action and its limit, and says [end] only
// when a turn part exists. State, revision and log stay unchanged.
await run('neutral-limit', () => {
  for (const turn of [false, true]) {
    const s = session();
    s.call('world_open', small('limit-' + turn));
    build(s, ['part', { part: 'store/water', per: 'game' }],
      ['part', { part: 'action/fill', on: '', max: 1, then: [['add', 'water', 1]] }],
      ...(turn ? [['part', { part: 'turn/round' }]] : []));
    build(s, ['do', 'fill']);
    const before = [hash(s.world), s.world.rev, records(s.home, s.world.name)];
    const message = fails(() => build(s, ['do', 'fill']), /./);
    const label = turn ? 'with turn: ' : 'no turn: ';
    check('neutral-limit', Buffer.byteLength(message) > 0 && Buffer.byteLength(message) <= 200,
      label + 'not refused within 200 bytes');
    check('neutral-limit', /\bfill\b/.test(message) && /\b1 of 1\b/.test(message),
      label + message);
    check('neutral-limit', /\[end\]/.test(message) === turn, label + message);
    check('neutral-limit', JSON.stringify(before) ===
      JSON.stringify([hash(s.world), s.world.rev, records(s.home, s.world.name)]), label + 'moved');
  }
});

// neutral-settle: a beat whose condition holds once dropped blocks settle completes in the same
// build reply, and its undo returns the earlier hash.
await run('neutral-settle', () => {
  const s = session();
  s.call('world_open', small('settle'));
  build(s, ['part', { part: 'beat/four', when: [['>=', 'blocks.brick', 4]],
    goal: 'Stack four bricks.', says: 'Done.' }]);
  const before = hash(s.world);
  const reply = build(s, ['drop', 'brick', 3, 3, 4]);
  check('neutral-settle', s.world.kit.s.beat?.four === 1, 'beat not complete after the drop');
  check('neutral-settle', /^story 1\/1 complete/m.test(reply), 'reply: ' + reply.split('\n')[1]);
  s.call('world_undo');
  check('neutral-settle', hash(s.world) === before, 'undo did not restore the hash');
});

// kit-frozen-five: the five frozen kit scripts keep their hashes and revisions.
await run('kit-frozen-five', () => {
  const expected = JSON.parse(readFileSync('fixtures/kit/expected.json', 'utf8'));
  for (const id of ['property', 'quest', 'town', 'garden', 'courier']) {
    const script = JSON.parse(readFileSync('fixtures/kit/' + id + '-game.json', 'utf8'));
    const s = session();
    s.call('world_open', script.open);
    for (const ops of script.batches) s.call('world_build', { ops });
    check('kit-frozen-five', hash(s.world) === expected[id].hash && s.world.rev ===
      expected[id].rev, id + ' ' + hash(s.world) + ' rev ' + s.world.rev);
  }
});

// engine-session: a session that opened a world keeps it when another session opens another.
await run('engine-session', () => {
  const h = home();
  const one = session(h), two = session(h);
  one.call('world_open', small('first'));
  two.call('world_open', small('second'));
  const events = [];
  one.subscribe(event => events.push(event));
  build(one, ['box', 'brick', 1, 1, 1, 1, 1, 1]);
  check('engine-session', one.world.name === 'first', 'session one moved to ' + one.world.name);
  check('engine-session', records(h, 'first') === 1 && records(h, 'second') === 0,
    'records first ' + records(h, 'first') + ' second ' + records(h, 'second'));
  check('engine-session', one.call('world_open', {}).world === 'first', 'reopen without a name');
  check('engine-session', events.every(event => !event.reset || event.state?.world === 'first'),
    'viewer of session one was reset to another world');
  check('engine-session', events.at(-1)?.hash === hash(one.world), 'last viewer event hash');
  two.call('world_look', { view: 'info' });
  check('engine-session', two.world.name === 'second' && two.world.rev === 0,
    'session two now on ' + two.world.name + ' rev ' + two.world.rev);
});

// engine-session-same: two sessions on one world still cooperate through the shared log.
await run('engine-session-same', () => {
  const h = home();
  const one = session(h), two = session(h);
  one.call('world_open', small('shared'));
  two.call('world_open', { name: 'shared' });
  build(one, ['box', 'brick', 1, 1, 1, 1, 1, 1]);
  build(two, ['box', 'cream', 2, 1, 2, 2, 1, 2]);
  one.call('world_look', { view: 'info' });
  check('engine-session-same', one.world.rev === 2 && two.world.rev === 2 &&
    hash(one.world) === hash(two.world), 'revs ' + one.world.rev + ' ' + two.world.rev);
});

// engine-session-call: the call door, a fresh process each call, still follows the last open.
await run('engine-session-call', () => {
  const h = home();
  const call = (tool, args) => spawnSync(process.execPath,
    ['bin/voxel-genesis.mjs', 'call', tool, JSON.stringify(args)],
    { encoding: 'utf8', env: { ...process.env, VOXEL_GENESIS_HOME: h } });
  const opened = call('world_open', small('door'));
  const built = call('world_build', { ops: [['box', 'brick', 1, 1, 1, 1, 1, 1]] });
  check('engine-session-call', opened.status === 0 && built.status === 0, built.stdout);
  check('engine-session-call', records(h, 'door') === 1, 'records ' + records(h, 'door'));
});

for (const note of notes) console.log('info ' + note);
for (const failure of failures) console.log('FAIL ' + failure.rule + ': ' + failure.detail);
console.log('engine-next: ' + failures.length + ' failures');
process.exitCode = failures.length ? 1 : 0;
