// COPY-DRAFT: bundle proofs, MCP cost jobs, review evidence and visible script progress.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { Readable } from 'node:stream';
import { serveStdio } from '../src/mcp-stdio.mjs';
import { createKitFiles } from '../src/kit-files.mjs';
import { contentHash, canonPart } from '../src/kit/canon.mjs';
import { createToolSession } from '../src/session.mjs';
import { KINDS } from '../src/kit/kinds.mjs';
import { panelOf, storyOf, moodOf } from '../src/kit/story.mjs';
import { town } from '../src/games/town.mjs';
import { arcProbe } from '../scripts/kit-bot.mjs';
import { readName } from '../src/kit/expr.mjs';
import { weeklyReview } from '../scripts/weekly-review.mjs';
import { readUsage } from '../scripts/usage-data.mjs';

const ids = ['property', 'quest', 'town', 'garden', 'courier'];
const load = path => JSON.parse(readFileSync(path, 'utf8'));
const script = id => load('fixtures/kit/' + id + '-game.json');
const bytes = value => Buffer.byteLength(typeof value === 'string' ? value : JSON.stringify(value));
const build = (s, ops) => s.call('world_build', { ops });

/** Exercise the protocol door, counting arguments plus returned text, as usage does. */
export async function costJob(session, calls) {
  const requests = [{ jsonrpc: '2.0', id: 0, method: 'initialize',
    params: { protocolVersion: '2024-11-05' } }, ...calls.map(([name, args], i) =>
    ({ jsonrpc: '2.0', id: i + 1, method: 'tools/call', params: { name, arguments: args } }))];
  let output = '';
  await serveStdio(() => session, Readable.from([requests.map(JSON.stringify).join('\n')]),
    { write: text => { output += text; } });
  const replies = output.trim().split('\n').map(JSON.parse).slice(1);
  assert.equal(replies.length, calls.length);
  assert.ok(replies.every(row => !row.error && row.result.isError === false), output);
  return { calls: calls.length, bytes: calls.reduce((sum, [, args], i) =>
    sum + bytes(args) + bytes(replies[i].result.content[0].text), 0), refused: 0 };
}

export async function runBundleTests({ run, session, hash, home }) {
  await run('kit-games', async () => {
    const expected = load('fixtures/kit/expected.json');
    for (const id of ids) {
      const fixture = script(id), s = session();
      s.call('world_open', fixture.open);
      for (const ops of fixture.batches) build(s, ops);
      const state = s.world.kit.s;
      assert.equal(hash(s.world), expected[id].hash, id);
      assert.equal(s.world.rev, expected[id].rev, id);
      if (expected[id].winner !== undefined) assert.equal(state.over?.winner, expected[id].winner);
      if (expected[id].scores) assert.deepEqual(state.over?.scores, expected[id].scores);
      if (expected[id].turn) assert.equal(state.turn, expected[id].turn);
      const child = spawnSync(process.execPath,
        ['bin/voxel-genesis.mjs', 'run', 'fixtures/kit/' + id + '-game.json'], {
          encoding: 'utf8', env: { ...process.env, VOXEL_GENESIS_HOME: home() }
        });
      assert.equal(child.status, 0, child.stderr + child.stdout);
      assert.ok(child.stdout.includes(expected[id].hash), id + ' CLI hash');
      const frozen = readFileSync('fixtures/kit/expected.json', 'utf8');
      const guard = spawnSync(process.execPath, ['scripts/kit-bot.mjs', '--write', id],
        { encoding: 'utf8' });
      assert.equal(guard.status, 1);
      assert.match(guard.stdout, /Frozen files already exist/);
      assert.equal(readFileSync('fixtures/kit/expected.json', 'utf8'), frozen);
    }
    const s = session();
    s.call('world_open', { kit: 'town', seed: 7 });
    assert.equal(s.world.rulesId, 'town@1');
    for (const ops of script('town').batches) {
      build(s, ops);
      for (const [key, value] of Object.entries(town.facts(s.world))) {
        assert.equal(readName('town.' + key, s.world), value);
      }
    }
    const plain = session(), original = load('fixtures/town-game.json');
    plain.call('world_open', original.open);
    for (const ops of original.batches) build(plain, ops);
    assert.deepEqual(town.facts(s.world), town.facts(plain.world));
  });
  await run('kit-proves', async () => {
    const files = createKitFiles();
    const claims = {
      property: ['place store player board action deck turn goal beat voice mood', ''],
      quest: ['place store action voice talk beat', 'turn bot dice board'],
      town: ['beat voice talk mood', 'store player board action dice deck turn goal bot advisor'],
      garden: ['place store action deck turn mood goal', 'player bot'],
      courier: ['place store action board goal', 'beat voice talk dice']
    };
    for (const [id, [required, absent]] of Object.entries(claims)) {
      const bundle = files.bundle(id), kinds = bundle.parts.map(p => p.part.split('/')[0]);
      for (const kind of required.split(' ')) assert.ok(kinds.includes(kind), id + ':' + kind);
      for (const kind of absent.split(' ').filter(Boolean)) assert.ok(!kinds.includes(kind));
      assert.ok(bundle.parts.length <= 48 && bytes(bundle) <= 8192);
      assert.ok(bytes(readFileSync('kit/' + id + '.json', 'utf8')) <= 8192);
      assert.ok(bundle.parts.every(p => bytes(p) <= 1024));
    }
    const garden = files.bundle('garden');
    const townBundle = files.bundle('town');
    for (const [kind, count] of [['beat', 3], ['voice', 1], ['talk', 2], ['mood', 2]]) {
      assert.equal(townBundle.parts.filter(p => p.part.startsWith(kind + '/')).length, count);
    }
    assert.deepEqual(townBundle.parts.find(p => p.part === 'mood/bright').when,
      [['>=', 'town.happy', 70]]);
    assert.equal(garden.parts.find(p => p.part.startsWith('turn/')).last, 16);
    const seasons = ['%', ['-', 'turn', 1], 4];
    const weather = garden.parts.find(p => p.part === 'deck/weather');
    assert.equal(weather.cards.length, 4);
    weather.cards.forEach((card, i) => assert.deepEqual(card.when, [['=', seasons, i]]));
    const s = session();
    s.call('world_open', { kit: 'garden' });
    build(s, [['do', 'plant', 'plot-1'], ['do', 'water', 'plot-1'], ['end']]);
    assert.equal(s.world.kit.s.place['plot-1'].crop, 2);
    assert.equal(s.world.kit.s.place['plot-1'].wet, 0);
    assert.equal(s.world.kit.s.last.news.id, weather.cards[0].id);
    build(s, [['end']]);
    assert.equal(s.world.kit.s.place['plot-1'].crop, 2);
    assert.equal(s.world.kit.s.last.news.id, weather.cards[1].id);
    while (!s.world.kit.s.over) build(s, [['end']]);
    assert.equal(s.world.kit.s.over.winner, '');
    assert.ok(panelOf(s.world).objective.length > 0);
    const courier = session();
    courier.call('world_open', { kit: 'courier' });
    assert.equal(Object.keys(courier.world.kit.s.place).length, 7);
    build(courier, [['do', 'drive', 'stop-1'], ['do', 'drive', 'stop-7']]);
    assert.equal(courier.world.kit.s.store.fuel.game, 0);
    assert.equal(courier.world.kit.s.over.winner, '');
    assert.deepEqual(files.check(), []);
  });
  await run('kit-mix', async () => {
    const files = createKitFiles(), s = session();
    s.call('world_open', { size: [40, 40, 16] });
    build(s, [['kit', 'property', 'play'], ['kit', 'quest', 'story'],
      ['kit', 'quest', 'world'], ['kit', 'quest', 'talk'],
      ['part', { part: 'store/apples', max: 3 }],
      ['part', files.part('property:place/lot')],
      ['kit', 'quest', 'play'], ['kit', 'garden', 'music'],
      ['part', 'garden:tune/spring'], ['part', { part: 'voice/extra', says: 'Nib' }]]);
    assert.deepEqual(files.check(s.world), []);
    assert.equal(contentHash(s.world.kit.parts['tune/spring']),
      contentHash(files.part('garden:tune/spring')));
    assert.equal(contentHash(s.world.kit.parts['action/acquire']),
      contentHash(files.part('property:action/acquire')));
    build(s, [['do', 'acquire', 'lot-1'], ['end']]);
    for (const [index, ops] of script('quest').batches.entries()) {
      build(s, ops);
      if (index === 3) build(s, [['end']]);
    }
    assert.equal(s.world.kit.s.over.winner, 'you');
    assert.equal(s.world.kit.s.beat.deliver, 1);
  });
  await run('dev-cost', async () => {
    const swapped = session();
    const jobs = [];
    jobs.push(['story', await costJob(swapped, [
      ['world_open', { kit: 'quest' }],
      ['world_build', { ops: [['cut', 'story'], ['part', { part: 'beat/kite',
        goal: 'Find the kite.', when: [['>=', 'blocks.sun', 1]] }]] }],
      ['world_build', { ops: [['box', 'sun', 1, 1, 1, 1, 1, 1]] }],
      ['world_look', { view: 'kit', of: 'story' }]
    ]), 4, 5000]);
    assert.equal(swapped.world.kit.s.beat.kite, 1);
    const music = session();
    music.call('world_open', {});
    build(music, [['box', 'brick', 1, 1, 1, 1, 1, 1]]);
    jobs.push(['music', await costJob(music, [
      ['world_build', { ops: [['kit', 'garden', 'music']] }]
    ]), 1, 400]);
    assert.ok(moodOf(music.world));
    const price = session();
    price.call('world_open', { kit: 'quest' });
    jobs.push(['price', await costJob(price, [
      ['world_build', { ops: [['edit', 'action/give', 'cost.apples', 2]] }]
    ]), 1, 300]);
    assert.equal(price.world.kit.parts['action/give'].cost.apples, 2);
    const empty = session();
    jobs.push(['scratch', await costJob(empty, [
      ['world_open', {}],
      ['world_build', { ops: [['part', { part: 'store/pebbles' }],
        ['part', { part: 'action/save', on: '', then: [['add', 'pebbles', 1]] }],
        ['do', 'save']] }]
    ]), 2, 900]);
    assert.equal(empty.world.kit.s.store.pebbles.you, 1);
    for (const [id, result, calls, limit] of jobs) {
      assert.ok(result.calls <= calls && result.bytes <= limit, id + ': ' + JSON.stringify(result));
    }
    writeFileSync('.agent-work/kit-d-cost.json', JSON.stringify(jobs, null, 2) + '\n');
  });
  await run('kit-review', async () => {
    const folder = home();
    writeFileSync(join(folder, 'usage.jsonl'), readFileSync('fixtures/kit/usage.jsonl'));
    const rows = readUsage(folder);
    assert.equal(rows.length, 14);
    assert.equal(rows.filter(row => row.err && /[A-Z]/.test(row.err)).length, 5);
    const review = weeklyReview({ home: folder, folder, now: new Date('2026-11-12T12:00:00Z') });
    const text = readFileSync(review.path, 'utf8');
    assert.match(text, /Kit use/);
    assert.match(text, /\| action \| 6 \| 4 \| 250\.0 \|/);
    assert.match(text, /\| beat \| 3 \| 3 \| 150\.0 \|/);
    assert.ok(text.indexOf('| action |') < text.indexOf('| beat |'));
    assert.match(text, /clearer shape or example for action/);
    assert.match(text, /Trim.*view:catalogue/);
    assert.match(text, /No uses: courier, garden, town/);
    assert.ok(!text.includes('private-project'));
    assert.match(text, /\| property \| 1 \| 0 \| 500\.0 \|/);
    assert.match(text, /\| custom \| 1 \| 0 \| 100\.0 \|/);
  });
}

/** Compare rendered cells and panels, excluding revision metadata and hidden state. */
export function checkKitArc({ check, core }) {
  for (const id of ids) {
    try {
      const files = createKitFiles(), bundle = files.bundle(id), fixture = script(id);
      let world = core.newWorld({ ...fixture.open, size: bundle.size, rules: bundle.rules });
      const probe = arcProbe(world);
      const batches = [[['kit', bundle]], ...fixture.batches];
      batches.forEach(ops => {
        world = core.applyBatch(world, files.resolve(ops)).world;
        probe.observe(world);
      });
      const { changed, first } = probe.arc;
      check('kit-arc', changed / batches.length >= 0.8, id + ' visible ' + changed);
      check('kit-arc', first > 0 && first <= 3, id + ' first objective ' + first);
    } catch (error) { check('kit-arc', false, id + ': ' + error.message); }
  }
}

/** Replay documentation examples instead of merely checking their spelling. */
export async function checkKitDocs(check) {
  try {
    const { partsDoc, bundleList, updateReadme } = await import('../scripts/kit-docs.mjs');
    const read = path => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
    assert.equal(read('docs/KIT-PARTS.md'), partsDoc());
    const readme = read('README.md'), guide = read('docs/MAKE-A-GAME.md');
    assert.equal(readme, updateReadme(readme, bundleList()));
    assert.ok(guide.trimEnd().split('\n').length <= 80);
    assert.equal((guide.match(/^## /gm) ?? []).length, 5);
    mkdirSync('.agent-work/kit-docs', { recursive: true });
    let recipes = 0, parts = 0;
    for (const [path, text] of [['guide', guide], ['parts', partsDoc()], ['readme', readme]]) {
      for (const [, code] of text.matchAll(/```json\n([\s\S]*?)\n```/g)) {
        const folder = mkdtempSync('.agent-work/kit-docs/run-');
        const s = createToolSession({ home: folder, cwd: 'fixtures/kit/project' });
        const examples = code.trim().split('\n').filter(line => line.trim());
        let example;
        try { example = JSON.parse(code); } catch { example = examples.map(JSON.parse); }
        if (example.part) {
          assert.ok(KINDS[example.part.split('/')[0]]);
          assert.equal(canonPart(example).warnings.length, 0);
          s.call('world_open', { size: [40, 40, 16] });
          build(s, [['part', { part: 'store/cash' }],
            ['part', { part: 'voice/pip', says: 'Pip' }], ['part', example]]);
          parts++;
        } else if (Array.isArray(example) && example.every(item => item.tool)) {
          for (const call of example) s.call(call.tool, call.arguments);
          if (path === 'guide') recipes++;
        } else if (example.open && example.batches) {
          s.call('world_open', example.open);
          for (const ops of example.batches) build(s, ops);
        } else {
          s.call('world_open', { game: 'town', seed: 7 });
          for (const call of Array.isArray(example) ? example : [example]) {
            s.call(call.tool ?? 'world_build', call.arguments ?? call);
          }
        }
      }
    }
    assert.equal(recipes, 5);
    assert.equal(parts, Object.keys(KINDS).length);
    const rows = [...readme.matchAll(/^\| [a-z]+ \| (\[.+\]) \|/gm)];
    assert.ok(rows.length >= 13);
    for (const [, code] of rows) {
      const s = createToolSession({ home: mkdtempSync('.agent-work/kit-docs/run-') });
      s.call('world_open', { size: [40, 40, 24] });
      build(s, [JSON.parse(code)]);
    }
  } catch (error) { check('kit-docs', false, error.message); }
}
