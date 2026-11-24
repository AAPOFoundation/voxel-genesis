// Print a local session verdict and per-tool metrics without argument content.
import { C, reviewCopy, sessionText, usageRow } from '../src/copy.mjs';
import { dataHome } from '../src/usage.mjs';
import { analyseUsage, fixtureTarget, readUsage } from './usage-data.mjs';
const args = process.argv.slice(2);
const sinceAt = args.indexOf('--since');
const fixtureAt = args.indexOf('--fixture');
const days = Number(args[0] && !args[0].startsWith('--') ? args[0]: 7);
const since = sinceAt >= 0 ? Number(args[sinceAt + 1]): Date.now() - days * 86400000;
const target = fixtureTarget(fixtureAt >= 0 ? args[fixtureAt + 1]: undefined);
if (!target || !Number.isFinite(since) || !Number.isFinite(days) || days <= 0) {
  process.stderr.write(C.error.arguments + '\n');
  process.exitCode = 1;
} else {
  const result = analyseUsage(readUsage(dataHome(), since), target);
  console.log(C.usageHead);
  for (const tool of result.tools.filter(tool => tool.calls)) {
    console.log(
      usageRow(
        tool.name,
        tool.calls,
        tool.p50.toFixed(2),
        tool.p95.toFixed(2),
        tool.input.toFixed(1),
        tool.output.toFixed(1),
        ((tool.input + tool.output) / 4).toFixed(1),
        tool.rate.toFixed(3),
        tool.errors.slice(0, 3).map(([code, count]) => code + ':' + count)
      )
    );
  }
  console.log(
    sessionText(
      result.calls,
      result.errors,
      result.unrecovered,
      result.output,
      target.calls + '/' + result.byteTarget,
      result.pass ? reviewCopy.pass: reviewCopy.needsReview
    )
  );
}
