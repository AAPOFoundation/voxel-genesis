// Own all kit data discovery and file reads, resolving names before pure replay.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createCore } from './core/index.mjs';
import { canonBundle, normalId, partId, copy } from './kit/canon.mjs';
import { KINDS, SECTIONS, KIT_OPS } from './kit/kinds.mjs';
import { inspectParts } from './kit/parts.mjs';
import { kitError, kitProblem, problemText } from './kit-copy.mjs';
import { fitText } from './budget.mjs';

/** Discover data afresh for each call. Previously resolved logs never consult these files. */
export function createKitFiles({ cwd = process.cwd(), folder,
  builtins = fileURLToPath(new URL('../kit', import.meta.url)) } = {}) {
  const project = resolve(folder ?? process.env.VOXEL_GENESIS_KIT ?? join(cwd, 'voxel-kit'));
  function scan() {
    const bundles = new Map(), issues = [];
    let custom = 0;
    for (const [directory, isCustom] of [[builtins, false], [project, true]]) {
      if (!existsSync(directory)) continue;
      for (const name of readdirSync(directory).filter(name => name.endsWith('.json')).sort()) {
        if (isCustom) custom++;
        const path = join(directory, name);
        try {
          let raw;
          try { raw = JSON.parse(readFileSync(path, 'utf8')); }
          catch { throw kitError(path, 'json'); }
          const { bundle, warnings } = canonBundle(raw, path);
          const id = bundle.id ?? normalId(name.slice(0, -5), path);
          if (Object.hasOwn(KINDS, id) || SECTIONS.includes(id) || bundles.has(id)) {
            throw kitError(path + '.id', 'collision');
          }
          bundles.set(id, { bundle: { ...bundle, id }, custom: isCustom });
          for (const warning of warnings) {
            const [at, text] = warning.split(': ');
            const [problem, fix] = (text ?? '').split('; ');
            issues.push({ path: at, problem, fix });
          }
        } catch (error) {
          issues.push(error.issue ?? kitProblem(path, 'file'));
        }
      }
    }
    return { bundles, issues, custom };
  }
  function find(name, path = 'kit', data = scan()) {
    const id = normalId(name, path);
    const entry = data.bundles.get(id);
    if (!entry) {
      const issue = data.issues.find(issue => issue.path.endsWith('/' + id + '.json') ||
        issue.path.includes(id + '.json'));
      if (issue) throw Object.assign(kitError(path, 'file'), {
        issue, message: fitText(path + '.' + problemText(issue), 200)
      });
      throw kitError(path, 'missing', id);
    }
    return copy(entry.bundle);
  }
  function part(name, path = 'part', data = scan()) {
    if (typeof name !== 'string' || name.split(':').length !== 2) throw kitError(path, 'id');
    const [bundle, key] = name.split(':');
    const id = partId(key, path);
    const found = find(bundle, path, data).parts.find(part => part.part === id);
    if (!found) throw kitError(path, 'missing', id);
    return copy(found);
  }
  return {
    bundle: find,
    part,
    catalogue() {
      const data = scan();
      return { custom: data.custom, bundles: [...data.bundles.values()].map(item => item.bundle) };
    },
    check(world) {
      const data = scan();
      const engine = createRequire(import.meta.url)('../vendor/voxel-engine.js');
      const core = createCore(engine), issues = [...data.issues];
      for (const { bundle } of data.bundles.values()) {
        try {
          const base = core.newWorld({ size: bundle.size, rules: bundle.rules });
          const checked = core.applyBatch(base, [['kit', bundle]]).world;
          issues.push(...inspectParts(checked).map(issue =>
            ({ ...issue, path: bundle.id + ':' + issue.path })));
        } catch (error) {
          issues.push(error.issue ? { ...error.issue, path: bundle.id + ':' + error.issue.path } :
            kitProblem(bundle.id, 'file'));
        }
      }
      return [...issues, ...inspectParts(world)];
    },
    resolve(ops) {
      if (!Array.isArray(ops)) return ops;
      let data;
      return ops.map((op, index) => {
        if (!Array.isArray(op)) return op;
        const path = 'ops[' + index + '].' + op[0];
        if (op[0] === 'kit' && typeof op[1] === 'string') {
          data ??= scan();
          const word = op[1].toLowerCase();
          if (word !== 'kit' && [...KIT_OPS, 'in'].includes(word) && !data.bundles.has(word)) {
            throw kitError(path, 'bundleOp', [word, ...op.slice(2)]);
          }
          return [op[0], find(op[1], path, data), ...op.slice(2)];
        }
        if (op[0] === 'part' && typeof op[1] === 'string') {
          data ??= scan();
          return [op[0], part(op[1], path, data), ...op.slice(2)];
        }
        return copy(op);
      });
    },
    usage(tool, args) {
      if (!args || typeof args !== 'object') return undefined;
      const word = value => Object.hasOwn(KINDS, value) || SECTIONS.includes(value) ?
        value : 'other';
      const bundleWord = name => scan().bundles.get(name)?.custom === false ? name : 'custom';
      if (tool === 'world_open' && args.kit) return 'open:' + bundleWord(args.kit);
      if (tool === 'world_look' && args.view === 'kit') {
        return 'view:' + (!args.of ? 'catalogue' : args.of === 'check' ? 'check' :
          word(args.of.split('/')[0]));
      }
      const op = args.ops?.find?.(op => Array.isArray(op) && KIT_OPS.includes(op[0]));
      if (!op) return undefined;
      const [name, value] = op;
      if (name === 'kit') return 'kit:' +
        (typeof value === 'string' ? bundleWord(value) : 'custom');
      if (['do', 'end', 'say'].includes(name)) return name;
      if (name === 'part' && typeof value === 'string' && value.includes(':')) {
        return 'part:' + bundleWord(value.split(':')[0]);
      }
      const kind = typeof value === 'string' ? value.split('/')[0] :
        value?.part?.split('/')[0] ?? value?.kind;
      return name + ':' + word(kind);
    }
  };
}
