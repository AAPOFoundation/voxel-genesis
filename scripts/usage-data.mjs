// Read content-free usage rows and calculate deterministic review evidence.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TOOL_COPY } from '../src/copy.mjs';
import { KINDS, SECTIONS } from '../src/kit/kinds.mjs';
/** Read complete metrics rows, ignoring an interrupted final write. */
export function readUsage(home, since = 0) {
  const rows = [];
  for (const name of ['usage.1.jsonl', 'usage.jsonl']) {
    const path = join(home, name);
    if (!existsSync(path)) {
      continue;
    }
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      try {
        const row = JSON.parse(line);
        if (
          Number.isFinite(row.t) && row.t >= since && typeof row.tool === 'string' &&
          ['ms', 'in', 'out'].every(key => Number.isFinite(row[key]) && row[key] >= 0) &&
          (row.err === null || /^[a-zA-Z]+$/.test(row.err))
        ) {
          rows.push(row);
        }
      } catch {
        /* A partial row is not evidence. */
      }
    }
  }
  return rows.sort((left, right) => left.t - right.t);
}
/** Group only recognised kit labels; project wording is never copied into a report. */
export function analyseKit(rows, bundles) {
  const groups = new Map(), views = new Map(), used = new Set();
  const add = (map, name, row, category) => {
    const group = map.get(name) ?? { name, category, uses: 0, errors: 0, bytes: 0 };
    group.uses++;
    group.errors += Number(Boolean(row.err));
    group.bytes += row.out;
    map.set(name, group);
  };
  for (const row of rows) {
    if (typeof row.kit !== 'string') continue;
    const [verb, word] = row.kit.split(':');
    let name, category;
    if (['open', 'kit'].includes(verb) || verb === 'part' && bundles.includes(word)) {
      name = bundles.includes(word) ? word : 'custom';
      category = 'bundle';
      used.add(name);
    } else if (['part', 'edit', 'cut', 'view'].includes(verb)) {
      name = Object.hasOwn(KINDS, word) || SECTIONS.includes(word) ? word : 'other';
      category = 'kind';
      if (verb === 'view') {
        const label = ['catalogue', 'check'].includes(word) ? word : name;
        add(views, 'view:' + label, row, 'view');
        if (name === 'other') { name = 'view:' + label; category = 'view'; }
      }
    } else if (['do', 'end', 'say'].includes(verb) && !word) {
      name = verb;
      category = 'operation';
    } else continue;
    add(groups, category + ':' + name, row, category);
  }
  const finish = group => ({ ...group,
    name: group.name.replace(/^(bundle|kind|view|operation):/, ''),
    mean: group.bytes / group.uses });
  const table = [...groups.values()].map(finish).sort((a, b) =>
    b.errors - a.errors || a.name.localeCompare(b.name));
  const caps = { catalogue: 1200, check: 1200, story: 300 };
  return { table, unused: bundles.filter(id => !used.has(id)).sort(),
    views: [...views.values()].map(group => ({ ...group, mean: group.bytes / group.uses,
      cap: caps[group.name.slice(5)] ?? 900 })).sort((a, b) => a.name.localeCompare(b.name)) };
}
/** Load call and byte targets from an existing reference fixture. */
export function fixtureTarget(name = 'small-town') {
  if (!['tiny-garden', 'small-town', 'hill-village'].includes(name)) {
    return null;
  }
  return JSON.parse(readFileSync(new URL('../fixtures/' + name + '.json', import.meta.url)));
}
/** Summarise tool errors, recovery, timing and bytes against fixture targets. */
export function analyseUsage(rows, target) {
  const calls = rows.filter(row => row.tool !== 'initialize');
  const pending = new Map();
  let unrecovered = 0;
  for (const row of rows) {
    // A later session cannot recover a previous session's failed calls.
    if (row.tool === 'initialize') {
      unrecovered += [...pending.values()].reduce((sum, count) => sum + count, 0);
      pending.clear();
    } else if (row.err) {
      pending.set(row.tool, (pending.get(row.tool) || 0) + 1);
    } else {
      pending.delete(row.tool);
    }
  }
  unrecovered += [...pending.values()].reduce((sum, count) => sum + count, 0);
  const tools = TOOL_COPY.map(
    ({ name }) => {
      const matches = calls.filter(row => row.tool === name);
      const times = matches.map(row => row.ms).sort((left, right) => left - right);
      const errors = {};
      for (const row of matches) if (row.err) {
        errors[row.err] = (errors[row.err] || 0) + 1;
      }
      const mean = key => matches.reduce((sum, row) => sum + row[key], 0) / Math.max(
        1,
        matches.length
      );
      return {
        name,
        calls: matches.length,
        input: mean('in'),
        output: mean('out'),
        p50: times[Math.floor(times.length * 0.5)] || 0,
        p95: times[Math.min(times.length - 1, Math.floor(times.length * 0.95))] ||
        0,
        errors: Object.entries(errors).sort(
          (left, right) => right[1] - left[1] || left[0].localeCompare(right[0])
        ),
        rate: matches.filter(row => row.err).length / Math.max(1, matches.length),
        target: target.bytes[name]
      };
    }
  );
  const output = calls.reduce((sum, row) => sum + row.out, 0);
  const byteTarget = target.bytes.world_open + target.batches.length * target.bytes.world_build +
  target.bytes.world_look;
  const errors = calls.filter(row => row.err).length;
  return {
    calls: calls.length,
    errors,
    unrecovered,
    output,
    byteTarget,
    tools,
    pass: calls.length <= target.calls && output <= byteTarget &&
    unrecovered === 0,
    slowest: [...rows].sort((left, right) => right.ms - left.ms).slice(0, 5)
  };
}
