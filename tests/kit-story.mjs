// COPY-DRAFT: story and talk contracts run through the public session door.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const load = id => JSON.parse(readFileSync('fixtures/kit/' + id + '.json', 'utf8'));
const bytes = text => Buffer.byteLength(text);
export async function runStoryTests({ run, session, hash, home }) {
  const fresh = () => {
    const s = session();
    s.call('world_open', { name: 'story', size: [32, 32, 16] });
    return s;
  };
  const build = (s, ...ops) => s.call('world_build', { ops });
  await run('story-beats', async () => {
    const { panelOf } = await import('../src/kit/story.mjs');
    const s = fresh();
    build(s, ['kit', [
      { part: 'beat/a', when: [['>=', 'blocks.brick', 1]], goal: 'Build a step.' },
      { part: 'beat/b', after: 'a', goal: 'Keep going.', when: [['=', 'flag.ready', 1]] }
    ]]);
    assert.equal(panelOf(s.world).objective, 'Build a step.');
    const reply = build(s, ['box', 'brick', 1, 1, 1, 1, 1, 1]);
    assert.equal(s.world.kit.s.beat.a, 1);
    assert.equal(panelOf(s.world).objective, 'Keep going.');
    assert.ok(!reply.includes('Build a step.'));
    assert.match(s.call('world_look', { view: 'kit', of: 'check' }), /reads 0.*ready/);
    build(s, ['cut', 'story'], ['part', { part: 'beat/new', when: [['>=', 'blocks.brick', 1]] }]);
    assert.deepEqual(s.world.kit.s.beat, { new: 1 });
    const chain = Array.from({ length: 20 }, (_, i) => ({ part: 'beat/b' + i,
      after: i ? 'b' + (i - 1) : '' }));
    const capped = fresh();
    build(capped, ['kit', chain]);
    assert.equal(Object.values(capped.world.kit.s.beat).filter(Boolean).length, 16);
    build(capped, ['box', 'brick', 1, 1, 1, 1, 1, 1]);
    assert.equal(Object.values(capped.world.kit.s.beat).filter(Boolean).length, 20);
    const lone = fresh();
    build(lone, ['part', { part: 'beat/alone', says: 'You made it.' }]);
    assert.equal(lone.world.kit.s.beat.alone, 1);
  });
  await run('story-recap', async () => {
    for (const id of ['property', 'quest']) {
      const script = load(id + '-game'), s = session();
      s.call('world_open', script.open);
      for (const ops of script.batches) {
        const reply = build(s, ...ops);
        assert.ok(bytes(reply) <= 700);
        assert.ok(bytes(s.call('world_look', { view: 'kit', of: 'story' })) <= 300);
        for (const line of reply.split('\n').filter(line => line.startsWith('story '))) {
          assert.ok(bytes(line) <= 120);
        }
      }
    }
    const s = fresh();
    const reply = build(s, ['part', { part: 'beat/long', goal: 'é'.repeat(400),
      when: [['=', 'flag.wait', 1]] }]);
    assert.ok(bytes(reply) <= 700);
    assert.ok(bytes(s.call('world_look', { view: 'kit', of: 'story' })) <= 300);
  });
  await run('story-world', async () => {
    const { panelOf } = await import('../src/kit/story.mjs');
    const s = session();
    s.call('world_open', { kit: 'quest', name: 'quest-game', seed: 7 });
    build(s, ['say', 'yes']);
    for (let i = 0; i < 3; i++) build(s, ['do', 'pick', 'orchard']);
    assert.ok(!s.world.kit.s.beat.cross);
    build(s, ['box', 'rock', 14, 1, 14, 15, 1, 16]);
    assert.equal(s.world.kit.s.beat.cross, 1);
    build(s, ['do', 'give', 'bakery']);
    assert.equal(s.world.kit.s.over.winner, 'you');
    assert.equal(panelOf(s.world).objective, 'You helped the whole village.');
    const before = hash(s.world);
    assert.throws(() => build(s, ['do', 'give', 'bakery']));
    assert.equal(hash(s.world), before);
    const script = load('quest-game'), finished = session();
    finished.call('world_open', script.open);
    let reply;
    for (const ops of script.batches) reply = build(finished, ...ops);
    assert.match(reply, /You helped the whole village/);
    assert.equal(hash(finished.world), load('expected').quest.hash);
    assert.equal(finished.world.rev, load('expected').quest.rev);
    const child = spawnSync(process.execPath,
      ['bin/voxel-genesis.mjs', 'run', 'fixtures/kit/quest-game.json'], {
        encoding: 'utf8', env: { ...process.env, VOXEL_GENESIS_HOME: home() }
      });
    assert.equal(child.status, 0, child.stderr);
    assert.ok(child.stdout.includes(load('expected').quest.hash));
  });
  await run('talk-flow', async () => {
    const { panelOf, moodOf } = await import('../src/kit/story.mjs');
    const s = fresh();
    build(s, ['kit', [
      { part: 'talk/start', on: 'start', asks: [{ id: 'yes', says: 'Yes please',
        then: [['flag', 'helping', 1]] }] },
      { part: 'beat/help', when: [['=', 'flag.helping', 1]] },
      { part: 'talk/beat', on: 'beat/help' },
      { part: 'action/help', when: [['=', 'flag.helping', 1]], then: [['talk', 'effect']] },
      { part: 'talk/action', on: 'action/help' }, { part: 'talk/effect' },
      { part: 'tune/soft' }, { part: 'mood/soft', tune: 'soft', when: [['=', 'flag.helping', 1]] }
    ]]);
    assert.equal(panelOf(s.world).talk.id, 'start');
    const before = hash(s.world);
    assert.throws(() => build(s, ['say', 'wrong']), /say/);
    assert.equal(hash(s.world), before);
    build(s, ['say', 'yes']);
    const answered = hash(s.world);
    assert.equal(s.world.kit.s.beat.help, 1);
    assert.equal(moodOf(s.world).id, 'soft');
    assert.equal(panelOf(s.world).talk.id, 'beat');
    s.call('world_undo');
    assert.equal(hash(s.world), before);
    build(s, ['say', 'yes']);
    assert.equal(hash(s.world), answered);
    build(s, ['do', 'help']);
    assert.deepEqual(s.world.kit.s.queue, ['effect', 'action']);
    for (const id of ['beat', 'effect', 'action']) {
      assert.equal(panelOf(s.world).talk.id, id);
      build(s, ['say']);
    }
    assert.throws(() => build(s, ['say']), /no open talk.*;/);
    build(s, ['do', 'help']);
    assert.equal(panelOf(s.world).talk.id, 'effect');
    build(s, ['cut', 'talk/effect']);
    assert.equal(panelOf(s.world).talk.id, 'action');
    build(s, ['cut', 'talk']);
    assert.equal(panelOf(s.world).talk, null);
    const lone = fresh();
    build(lone, ['part', { part: 'talk/alone', on: 'start' }]);
    build(lone, ['say']);
    build(lone, ['part', { part: 'mood/alone' }]);
    assert.equal(moodOf(lone.world), null);
  });
}
