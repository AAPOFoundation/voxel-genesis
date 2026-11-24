// Package E regressions use the CLI door and the shared session with property seed seven.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createKitFiles } from '../src/kit-files.mjs';

const bytes = text => Buffer.byteLength(text);
export async function runKitFeedbackTests({ run, session, home }) {
  const fresh = () => {
    const s = session();
    s.call('world_open', { kit: 'property', seed: 7 });
    return s;
  };
  const build = (s, ...ops) => s.call('world_build', { ops });
  const footer = reply => {
    assert.ok(bytes(reply) <= 700);
    assert.match(reply, /\nkit parts \d+ warn \d+(?:\n[^\n]{1,80}){0,3}$/);
  };
  await run('kit-e-catalogue', () => {
    const folder = home();
    const call = (tool, args) => {
      const child = spawnSync(process.execPath,
        ['bin/voxel-genesis.mjs', 'call', tool, JSON.stringify(args)], {
          encoding: 'utf8', windowsHide: true,
          env: { ...process.env, VOXEL_GENESIS_HOME: folder }
        });
      assert.equal(child.status, 0, child.stderr);
      return JSON.parse(child.stdout);
    };
    call('world_open', { kit: 'property', seed: 7 });
    const reply = call('world_look', { view: 'kit' });
    assert.ok(bytes(reply) <= 1200);
    assert.ok(!reply.includes('COPY-DRAFT'));
    for (const bundle of createKitFiles().catalogue().bundles) {
      assert.ok(bundle.says.length >= 12 && bundle.says.length <= 80);
      assert.ok(reply.includes(bundle.id + ': ' + bundle.says));
    }
    const added = call('world_build', { ops: [['part', {
      part: 'voice/captain', says: 'Captain Juniper', favourite: 'tea'
    }]] });
    footer(added);
    assert.match(added, /favourite.*kept/);
  });
  await run('kit-e-footer', () => {
    const s = fresh();
    const part = { part: 'voice/captain', says: 'Captain Juniper', favourite: 'tea' };
    for (const op of [['part', part], ['kit', [part]],
      ['edit', part.part, 'favourite', 'cake']]) {
      const reply = build(s, op, ['end']);
      footer(reply);
      assert.match(reply, /favourite.*kept/);
      assert.match(reply, /kit parts 26 warn 1/);
      assert.equal(s.world.kit.parts[part.part].favourite, op[0] === 'edit' ? 'cake' : 'tea');
    }
    footer(build(s, ['cut', 'voice/captain']));
    footer(build(s, ['cut', '*']));
  });
  await run('kit-e-reply-cap', () => {
    const s = fresh();
    const reply = build(s,
      ['edit', 'talk/hello', 'lines', ['A long line. '.repeat(40)]],
      ['part', { part: 'talk/wait', on: 'start' }],
      ['part', { part: 'voice/captain', favourite: 'tea', cup: 'blue', hat: 'green',
        coat: 'red' }]);
    footer(reply);
    assert.match(reply, /talk Pip:.*queue 1/);
    assert.match(reply, /kit parts 27 warn 4/);
    assert.equal(reply.split(/kit parts \d+ warn \d+\n/)[1].split('\n').length, 3);
    assert.ok(!build(s, ['end']).includes('kit parts'));
    assert.match(s.call('world_look', { view: 'kit', of: 'check' }), /voice\/captain.hat/);
  });
  await run('kit-e-talk', () => {
    const s = fresh();
    const reply = build(s, ['part', { part: 'talk/wait', on: 'start', lines: ['Please wait.'] }]);
    assert.match(reply, /talk Pip:.*queue 1/);
    assert.match(build(s, ['end']), /talk Pip:.*queue 1/);
    assert.match(build(s, ['say', 'yes']), /talk wait: Please wait\./);
    assert.match(build(s, ['say']), /talk: closed/);
    assert.ok(!build(s, ['end']).includes('talk wait:'));
  });
  await run('kit-e-trigger', () => {
    const s = fresh();
    build(s, ['say', 'yes'], ['do', 'acquire', 'lot-12']);
    const reply = build(s,
      ['part', { part: 'talk/lease', on: 'action/lease', lines: ['The home is ready.'] }],
      ['do', 'lease', 'lot-12']);
    assert.match(reply, /talk lease: The home is ready\./);
    footer(reply);
    assert.match(build(s, ['end']), /talk lease: The home is ready\./);
  });
  await run('kit-e-warning', async () => {
    const { kitWarning } = await import('../src/kit-copy.mjs');
    const s = fresh();
    const reply = build(s, ['cut', 'story'], ['kit', 'quest', 'story']);
    footer(reply);
    assert.match(reply,
      /beat\/gather: needs name apples \(missing\); add store\/apples or edit when/);
    assert.match(reply, /built\.river-gap \(missing\)/);
    const warning = kitWarning('voice/' + 'a'.repeat(24) + '.favourite', 'unknown');
    assert.ok(bytes(warning) <= 80);
    assert.ok(!/spell$/.test(warning), warning);
    const { kitReport } = await import('../src/kit-copy.mjs');
    assert.equal(kitReport(1, ['word '.repeat(30)]).split('\n')[1],
      'word '.repeat(16).trim());
    const unicode = kitReport(1, ['caf\u00e9 '.repeat(30)]).split('\n')[1];
    assert.equal(unicode, 'caf\u00e9 '.repeat(13).trim());
    assert.ok(bytes(unicode) <= 80);
  });
  await run('kit-e-empty-story', () => {
    const reply = fresh().call('world_look', { view: 'kit', of: 'story' });
    assert.ok(!/done:\s*$/.test(reply));
    assert.match(reply, /done: none/);
  });
}
