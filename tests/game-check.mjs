// COPY-DRAFT: arbitrary game files use the same checks through imports and both CLI doors.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { gameCheck, formatGameCheck } from '../scripts/game-check.mjs';
import { canonBundle } from '../src/kit/canon.mjs';
import { bundleGame, botGame } from '../scripts/kit-bot.mjs';
const read = path => JSON.parse(readFileSync(path, 'utf8'));
const temp = () => {
  mkdirSync('.agent-work/game-check-tests', { recursive: true });
  return mkdtempSync('.agent-work/game-check-tests/run-');
};
const write = (folder, name, value) => {
  const path = join(folder, name + '.json');
  writeFileSync(path, JSON.stringify(value));
  return path;
};
export async function runGameCheckTests({ run }) {
  await run('game-check-own', () => {
    for (const id of ['property', 'quest', 'town', 'garden', 'courier']) {
      const options = { bundle: 'kit/' + id + '.json', seeds: 2,
        script: 'fixtures/kit/' + id + '-game.json' };
      for (const only of ['lint', 'invariants']) {
        const result = gameCheck({ ...options, only });
        assert.equal(result.failures, 0, id + ' ' + JSON.stringify(result));
        assert.ok(result[only]);
      }
    }
    const bundle = read('kit/property.json');
    assert.deepEqual(bundleGame(bundle, { seed: 7 }).expected, botGame(7).expected);
    assert.deepEqual(botGame(7).expected, read('fixtures/kit/expected.json').property);
    const custom = canonBundle({ id: 'pebbles', kit: 1,
      says: 'Gather pebbles by the stream.', parts: [
        { part: 'player/alex' }, { part: 'turn/day', moves: 1, last: 4 },
        { part: 'store/pebbles' },
        { part: 'action/gather', on: '', value: 1, then: [['add', 'pebbles', 1]] },
        { part: 'goal/done', when: [['>=', 'pebbles', 2]], score: 'pebbles' }
      ] }).bundle;
    const customPath = write(temp(), 'pebbles', custom);
    const result = gameCheck({ bundle: customPath, seeds: 2, only: 'invariants' });
    assert.equal(result.failures, 0, JSON.stringify(result));
    const ab = gameCheck({ bundle: customPath, seeds: 2, only: 'ab' });
    assert.equal(ab.ab.rows[0].wins, 2);
    assert.equal(ab.ab.rows[0].score, 2);
  });
  await run('game-check-bad', () => {
    const folder = temp(), bundle = read('kit/property.json');
    bundle.parts.find(p => p.part === 'action/acquire').cost.cash = {};
    const path = write(folder, 'broken', bundle);
    const result = gameCheck({ bundle: path, seeds: 1 });
    assert.ok(result.failures > 0);
    assert.ok(result.lint.failures.some(f => f.includes(path) && f.includes('cost.cash')));
    const long = gameCheck({ bundle: write(folder, 'long', {
      ...read('kit/property.json'), says: Array(25).fill('hello').join(' ')
    }), only: 'taste', seeds: 1 });
    assert.ok(long.taste.failures.some(f => f.startsWith('sentence:')));
    assert.ok(long.taste.failures.some(f => f.includes('action/divest')));
    assert.ok(formatGameCheck(long).split('\n').filter(l => l.startsWith('FAIL '))
      .every(line => Buffer.byteLength(line) <= 120));
    const capped = gameCheck({ bundle: 'kit/property.json', turns: 1,
      seeds: 1, only: 'invariants' });
    assert.ok(capped.invariants.failures.some(f => f.startsWith('ending:')));
    const script = { batches: [[['do', 'missing']]] };
    assert.ok(gameCheck({ bundle: 'kit/property.json', script,
      seeds: 1, only: 'invariants' }).failures > 0);
    const stalled = canonBundle({ kit: 1, id: 'stalled', parts: [
      { part: 'beat/next', after: 'missing', when: [['=', 0, 1]], goal: 'Find the path.' }
    ] }).bundle;
    const gap = gameCheck({ bundle: write(folder, 'stalled', stalled), seeds: 1, only: 'taste' });
    assert.ok(gap.taste.failures.some(f => f.startsWith('goal-line:')));
    assert.ok(gap.taste.failures.some(f => f.startsWith('first-objective:')));
    const dominant = gameCheck({ bundle: 'kit/courier.json', only: 'taste', seeds: 1 });
    assert.ok(dominant.taste.failures.some(f => f.includes('dominant-action: action/drive')));
  });
  await run('game-check-ab', () => {
    const folder = temp(), original = read('kit/property.json');
    const a = write(folder, 'first', original);
    original.parts.find(p => p.part === 'action/insure').cost.cash = 3;
    const b = write(folder, 'second', original);
    const options = { bundle: a, ab: b, seeds: 3, only: 'ab' };
    const first = gameCheck(options), second = gameCheck(options);
    assert.equal(first.failures, 0, JSON.stringify(first));
    assert.equal(first.ab.rows.length, 2);
    assert.deepEqual(first.ab.rows, second.ab.rows);
    const [{ variant: av, ...ar }, { variant: bv, ...br }] = first.ab.rows;
    assert.equal(av, 'A'); assert.equal(bv, 'B');
    assert.notDeepEqual(ar, br);
    const band = gameCheck({ ...options, winBand: [0.3, 0.8] });
    assert.ok(band.failures > 0);
    assert.equal(gameCheck({ ...options, winBand: [0, 1] }).failures, 0);
  });
  await run('game-check-cli', () => {
    const cli = (door, args) => spawnSync(process.execPath, [...door, ...args],
      { encoding: 'utf8', windowsHide: true });
    const args = ['kit/property.json', '--seeds', '3'];
    const child = cli(['bin/voxel-genesis.mjs', 'check'], args);
    assert.ok(child.status === 0 || child.status === 1, child.stderr);
    for (const section of ['lint', 'invariants', 'ab', 'taste']) {
      assert.match(child.stdout, new RegExp('^' + section + ': \\d+ failures$', 'm'));
    }
    const json = cli(['scripts/game-check.mjs'], [...args, '--json']);
    const result = JSON.parse(json.stdout);
    assert.equal(json.status, result.failures ? 1 : 0);
    assert.equal(child.status, json.status);
    assert.equal(child.stdout.trim(), formatGameCheck(result));
    const success = cli(['scripts/game-check.mjs'], [...args, '--only=lint', '--json']);
    assert.equal(success.status, 0, success.stdout);
    assert.deepEqual(Object.keys(JSON.parse(success.stdout)), ['failures', 'lint']);
    for (const bad of [['--seeds', '0'], ['--turns', '-1'], ['--only=nope'],
      ['--seeds'], ['--win-band', '2,3'], ['--unknown']]) {
      const failed = cli(['scripts/game-check.mjs'], ['kit/property.json', '--json', ...bad]);
      assert.equal(failed.status, 1);
      assert.equal(JSON.parse(failed.stdout).failures, 1);
    }
  });
}
