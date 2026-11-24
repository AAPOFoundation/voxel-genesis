// Write a local weekly report using fixed, reproducible suggestion rules.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { C, reviewCopy as copy } from '../src/copy.mjs';
import { dataHome } from '../src/usage.mjs';
import { analyseUsage, analyseKit, fixtureTarget, readUsage } from './usage-data.mjs';
import { createKitFiles } from '../src/kit-files.mjs';
function optionalJson(path) {
  if (!existsSync(path)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}
/** Produce no more than five suggestions, ranked by fixed evidence thresholds. */
function suggestions(result, bench) {
  const ranked = [];
  for (const tool of result.tools) {
    for (const [error, count] of tool.errors) {
      if (count >= 3) {
        ranked.push(
          {
            rank: 100 + count,
            text: copy.clearer + ' ' + tool.name + '.' + error +
            ' (' + count + ').'
          }
        );
      }
    }
    if (tool.output > tool.target) {
      ranked.push(
        { rank: 80 + tool.output / tool.target, text: copy.trim + ' ' + tool.name + '.' }
      );
    }
  }
  if (result.unrecovered) {
    ranked.push({ rank: 90, text: copy.recover + ' ' + result.unrecovered + ' calls.' });
  }
  if (bench && (bench.p95 > 8 || bench.gapP95 > 18)) {
    ranked.push({ rank: 70, text: copy.bench });
  }
  return ranked.sort(
    (left, right) => right.rank - left.rank || left.text.localeCompare(right.text)
  ).slice(0, 5).map(item => item.text);
}
/** Read local evidence and save a dated Markdown report, or return no data. */
export function weeklyReview(
  { home = dataHome(), folder = process.cwd(), now = new Date(), fixture = 'small-town' } =
  {}
) {
  const rows = readUsage(home, now.getTime() - 7 * 86400000);
  if (!rows.length) {
    return { message: C.noData };
  }
  const target = fixtureTarget(fixture);
  const result = analyseUsage(rows, target);
  const bench = optionalJson(join(home, 'bench.json')) || optionalJson(
    join(folder, 'bench.json')
  );
  const date = now.toISOString().slice(0, 10);
  const lines = [
    '# ' + copy.title + ': ' + date,
    '',
    copy.calls + ': ' + result.calls + ' / ' + target.calls,
    copy.errors + ': ' + (result.errors / Math.max(1, result.calls)).toFixed(3),
    copy.unrecovered + ': ' + result.unrecovered,
    '',
    '| tool | ' + copy.calls + ' | ' + copy.errors + ' | ' + copy.top +
    ' | ' + copy.bytes + ' |',
    '|---|---:|---:|---|---:|'
  ];
  for (const tool of result.tools) {
    lines.push(
      '| ' + [
        tool.name,
        tool.calls,
        tool.rate.toFixed(3),
        tool.errors.slice(0, 3).map(([error, count]) => error + ':' + count).join(', '),
        tool.output.toFixed(1) + ' / ' + tool.target
      ].join(' | ') + ' |'
    );
  }
  const bundles = createKitFiles({ folder: join(folder, '.no-project-kits') })
    .catalogue().bundles.map(bundle => bundle.id);
  const kit = analyseKit(rows, bundles);
  lines.push('', '## ' + copy.kitTitle, '',
    '| ' + copy.kitColumns + ' |', '|---|---:|---:|---:|');
  for (const row of kit.table) {
    lines.push('| ' + [row.name, row.uses, row.errors, row.mean.toFixed(1)].join(' | ') + ' |');
  }
  lines.push('', '### ' + copy.kitSuggestions, '');
  for (const row of kit.table.filter(row => row.category === 'kind' && row.errors >= 3)) {
    lines.push('- ' + copy.kitClearer + ' ' + row.name + ' (' + row.errors + ').');
  }
  for (const row of kit.views.filter(row => row.mean > row.cap)) {
    lines.push('- ' + copy.trim + ' ' + row.name + ' (' + row.mean.toFixed(1) +
      ' / ' + row.cap + ').');
  }
  if (kit.unused.length) lines.push('- ' + copy.kitUnused + ' ' + kit.unused.join(', ') + '.');
  lines.push('', '## ' + copy.slowest, '');
  for (const row of result.slowest) {
    lines.push('- ' + row.tool + ': ' + row.ms + ' ms');
  }
  if (bench) {
    lines.push('', 'p95=' + bench.p95 + ' ms; gapP95=' + bench.gapP95 + ' ms');
  }
  lines.push('', '## ' + copy.suggestions, '');
  const advice = suggestions(result, bench);
  lines.push(
    ...(advice.length ? advice.map((text, index) => (index + 1) + '. ' + text): [copy.none])
  );
  const directory = join(folder, 'reviews');
  mkdirSync(directory, { recursive: true });
  const path = join(directory, date + '.md');
  writeFileSync(path, lines.join('\n') + '\n');
  return { path, result };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = weeklyReview();
  console.log(result.message || C.reviewSaved + ' ' + result.path);
}
