// Run independent suites concurrently and select affected suites from local Git changes.
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const suites = ['lint', 'invariants', 'engine', 'taste'];
function changedSuites() {
  const commands = [
    ['diff', 'HEAD', '--name-only'],
    ['ls-files', '--others', '--exclude-standard']
  ];
  const paths = [];
  for (const args of commands) {
    const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
    if (result.status !== 0) {
      return suites;
    }
    paths.push(...result.stdout.trim().split(/\r?\n/).filter(Boolean));
  }
  return suitesForPaths(paths);
}
/** Select check suites affected by repository-relative paths. */
export function suitesForPaths(paths) {
  const selected = new Set();
  for (const path of paths) {
    if (/^(vendor\/|check\.sh|package\.json|scripts\/check|\.github\/)/.test(path)) {
      return suites;
    }
    if (/^(src\/|bin\/|viewer\/|fixtures\/|scripts\/|tests\/)/.test(path)) {
      selected.add('lint');
    }
    if (/^(src\/|bin\/|viewer\/|fixtures\/|scripts\/(usage|weekly|town))/.test(path)) {
      selected.add('invariants');
    }
    if (/^(src\/(copy|core\/|games\/)|scripts\/town|viewer\/|fixtures\/|README\.md)/.test(path)) {
      selected.add('taste');
    }
    if (/^(README\.md|docs\/)/.test(path)) {
      selected.add('lint');
    }
    if (path.startsWith('tests/')) {
      const name = path.slice(6).replace(/\.mjs$/, '');
      selected.add(
        suites.includes(name) ? name: 'invariants'
      );
    }
  }
  return suites.filter(suite => selected.has(suite));
}
function runSuite(name) {
  return new Promise(
    resolve => {
      const child = spawn(
        process.execPath,
        ['tests/' + name + '.mjs'],
        { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] }
      );
      let output = '';
      child.stdout.on(
        'data',
        chunk => {
          output += chunk;
        }
      );
      child.stderr.on(
        'data',
        chunk => {
          output += chunk;
        }
      );
      child.on('error', error => resolve({ name, code: 1, output: error.message }));
      child.on('close', code => resolve({ name, code, output }));
    }
  );
}
async function main() {
  const start = performance.now();
  const selected = process.argv.includes('--changed') ? changedSuites():
  suites;
  const results = await Promise.all(selected.map(runSuite));
  for (const result of results) {
    const summary = result.output.split(/\r?\n/).find(
      line => line.startsWith(result.name + ':')
    );
    if (result.code !== 0 || !summary || !summary.endsWith('0 failures')) {
      process.stdout.write(result.output);
      if (!summary) {
        console.log('FAIL ' + result.name + ': suite did not finish');
      }
      process.exitCode = 1;
    } else {
      console.log(summary);
    }
  }
  console.log(
    'check: ' + selected.length + ' suites in ' + ((performance.now() - start) / 1000).toFixed(
      2
    ) + ' seconds'
  );
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
