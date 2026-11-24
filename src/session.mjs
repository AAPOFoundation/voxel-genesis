// Own the current world, append-only storage and cooperating local writers.
import { failure } from './errors.mjs';
import { valid } from './validate.mjs';
import {
  mkdirSync, readFileSync, writeFileSync, appendFileSync, renameSync, readdirSync,
  statSync, existsSync
} from 'node:fs';
import { join } from 'node:path';
import { dataHome, logUsage } from './usage.mjs';
import { publicError } from './errors.mjs';
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';
import { C, TOOL_COPY, terseResult, inputHint, moverReport } from './copy.mjs';
import { createCore } from './core/index.mjs';
import { blocksOf } from './core/palette.mjs';
import { prefabsOf } from './core/prefabs.mjs';
import { PACKS, packOf } from './core/rules.mjs';
import { hash, summary } from './core/codec.mjs';
import { look } from './core/look.mjs';
import { createKitFiles } from './kit-files.mjs';
import { readStarter, buildStarter } from './world-from.mjs';
import { KIT_COPY, kitError, kitReport, kitBuild, warningText } from './kit-copy.mjs';
import { playReport } from './kit/view.mjs';
import { inspectParts } from './kit/parts.mjs';
import { storyReport } from './kit/story.mjs';
import { readLog, snapshot, locked } from './save-log.mjs';
import { readInputs, acknowledgeInputs, acknowledgedMark } from './input.mjs';
export const TOOLS = TOOL_COPY;
const E = createRequire(import.meta.url)('../vendor/voxel-engine.js');
const vendorRecord = JSON.parse(
  readFileSync(new URL('../vendor/VENDOR.json', import.meta.url))
);
const pin = vendorRecord.sha256.slice(0, 12);
const MAX_UNDO = 20;
/** Create one local world session shared by the transport doors. */
export function createToolSession({ home = dataHome(), viewer = null, cwd, kitFolder } = {}) {
  const core = createCore(E);
  const files = createKitFiles({ cwd, folder: kitFolder });
  const folder = join(home, 'worlds');
  const current = join(home, 'current');
  const listeners = new Set();
  mkdirSync(folder, { recursive: true });
  let world = null;
  let header = null;
  let lines = [];
  let builds = [];
  // Worlds as they stood before the last builds made here; the tail lines up with `builds`.
  let kept = [];
  const inputCursors = new Map();
  let signature = '';
  let logPath = null;
  let pinned = false;
  let warn = [];
  const stat = p => {
    const s = statSync(p);
    return [s.size, s.mtimeMs, s.ino].join(':');
  };
  function resetPlayback() {
    if (!listeners.size) return;
    const initial = snapshot(core.replay(header, []).world);
    for (const listener of listeners) listener({ reset: true, state: initial });
    publish(0);
  }
  function publish(from) {
    for (let rev = from + 1; rev <= lines.length; rev++) {
      const w = rev === lines.length ? world: core.replay(header, lines.slice(0, rev)).world;
      for (const listener of listeners) {
        listener({ rev, line: lines[rev - 1], hash: hash(w) });
      }
    }
  }
  function load(path, notify = false) {
    const { h, records } = readLog(path);
    const old = lines.length;
    const same = header && JSON.stringify(h) === JSON.stringify(header);
    const prefix = same && records.length >= old && lines.every(
      (l, i) => JSON.stringify(l) === JSON.stringify(records[i])
    );
    let replayed;
    if (prefix && world) {
      let q = world;
      let active = [...builds];
      for (let i = old; i < records.length; i++) {
        const l = records[i];
        if (l.ops) {
          q = core.applyBatch(q, l.ops).world;
          active.push(l.ops);
        } else {
          const r = core.replay(h, records.slice(0, i + 1));
          q = r.world;
          active = r.builds;
        }
        q.rev = i + 1;
      }
      replayed = { world: q, builds: active };
    } else {
      replayed = core.replay(h, records);
    }
    header = h;
    lines = records;
    world = replayed.world;
    builds = replayed.builds;
    kept = [];
    logPath = path;
    signature = stat(path);
    warn = h.engine === pin ? []: [C.engine];
    if (notify) {
      if (prefix) {
        publish(old);
      } else {
        resetPlayback();
      }
    }
  }
  function catchUp() {
    if (!pinned && existsSync(current)) {
      const name = readFileSync(current, 'utf8').trim();
      if (!valid({ name }, TOOLS[0].inputSchema)) {
        throw failure('save');
      }
      const path = join(folder, name + '.jsonl');
      if (logPath !== path) {
        load(path, true);
        return;
      }
    }
    if (logPath && stat(logPath) !== signature) {
      load(logPath, true);
    }
  }
  function append(line, next, nextBuilds) {
    const old = lines.length;
    appendFileSync(logPath, JSON.stringify(line) + '\n');
    lines.push(line);
    if (line.ops) kept = [...kept, world].slice(- MAX_UNDO);
    world = next;
    world.rev = lines.length;
    builds = nextBuilds;
    const expected = Buffer.byteLength(
      [header,...lines].map(x => JSON.stringify(x)).join('\n') +
      '\n'
    );
    if (statSync(logPath).size !== expected) {
      load(logPath);
    } else {
      signature = stat(logPath);
    }
    publish(old);
  }
  function open(args) {
    const source = readStarter(args);
    const bundle = args.kit ? files.bundle(args.kit, 'kit') : null;
    if (args.game && args.size &&
      JSON.stringify(args.size) !== JSON.stringify(PACKS['town@1'].size)) {
      throw failure('townSize');
    }
    let name = args.name;
    if (name === undefined) {
      if (world) {
        name = world.name;
      } else if (existsSync(current)) {
        name = readFileSync(current, 'utf8').trim();
      } else {
        name = 'my-world';
      }
    }
    if (!valid({ name }, TOOLS[0].inputSchema)) {
      throw failure('arguments');
    }
    const path = join(folder, name + '.jsonl');
    return locked(
      path,
      () => {
        let q;
        let h;
        let records = [];
        if (existsSync(path) && !args.fresh) {
          if (source) throw failure('fromExists');
          if (bundle) throw kitError('kit', 'open');
          const data = readLog(path);
          h = data.h;
          records = data.records;
          if (args.game && h.rules !== 'town@1') {
            throw failure('game');
          }
          if (h.rules === 'town@1' && args.size &&
            JSON.stringify(args.size) !== JSON.stringify(PACKS[h.rules].size)) {
            throw failure('townSize');
          }
          if (
            args.size && JSON.stringify(args.size) !== JSON.stringify(h.size) ||
            args.seed !== undefined && args.seed !== h.seed
          ) {
            throw failure('match');
          }
          q = core.replay(h, records);
        } else {
          const w = core.newWorld({
            name, size: source?.open.size ?? args.size ?? bundle?.size,
            seed: source?.open.seed ?? args.seed,
            rules: args.game ? 'town@1' : bundle?.rules ?? 'none@0'
          });
          h = {
            v: 1,
            set: w.setId,
            world: name,
            size: [w.w, w.d, w.h],
            seed: w.seed,
            rules: w.rulesId,
            engine: pin
          };
          q = { world: w, builds: [] };
          if (bundle) {
            const ops = [['kit', bundle]];
            q = { world: core.applyBatch(w, ops).world, builds: [ops] };
            records = [{ ops }];
            q.world.rev = 1;
          }
          if (source) ({ q, records } = buildStarter(core, w, source, files));
          if (existsSync(path)) {
            renameSync(path, join(folder, name + '.bak.jsonl'));
          }
          writeFileSync(path, [h, ...records].map(row => JSON.stringify(row)).join('\n') + '\n');
        }
        const changed = logPath !== path || args.fresh;
        header = h;
        lines = records;
        world = q.world;
        builds = q.builds;
        kept = [];
        logPath = path;
        signature = stat(path);
        warn = h.engine === pin ? []: [C.engine];
        writeFileSync(current, name + '\n');
        pinned = true;
        if (changed) {
          resetPlayback();
        }
        const { count, hash: worldHash } = summary(world);
        const others = readdirSync(folder).filter(
          n => n.endsWith('.jsonl') && !n.endsWith('.bak.jsonl') &&
          n !== name + '.jsonl'
        ).map(n => n.slice(0, - 6)).sort().slice(0, 10);
        return {
          ...(args.name === name ? {} : { world: name }),
          ...(sameSize(args.size, h.size) ? {} : { size: h.size }),
          ...(args.seed !== undefined && args.seed === h.seed ? {} : { seed: h.seed }),
          rev: world.rev,
          count,
          hash: worldHash,
          viewer: api.viewer || C.viewerHint,
          blocks: blocksOf(world).map(b => b.name).join(' '),
          prefabs: Object.entries(prefabsOf(world))
            .map(([n, p]) => n + ':' + p.size.join('x')).join(' '),
          ...(others.length ? { others } : {}),
          ...(warn.length ? { warn }: {}),
          ...(world.kit ? { kit: kitReport(Object.keys(world.kit.parts).length,
            inspectParts(world).map(warningText)), how: KIT_COPY.how,
          ...(storyReport(world, true) ?
            { story: storyReport(world, true).split('\n')[0] } : {}),
          ...(playReport(world) ? { play: playReport(world) } : {}) } : {}),
          ...(world.game ?
            { game: world.rulesId, how: C.town.how, town: packOf(world).report(world) }
            : {})
        };
      }
    );
  }
  function sameSize(a, b) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length &&
      a.every((n, i) => n === b[i]);
  }
  function cursorOf() {
    const name = world.name;
    if (!inputCursors.has(name)) inputCursors.set(name, acknowledgedMark(api));
    return inputCursors.get(name);
  }
  function callTool(tool, args) {
    const definition = TOOLS.find(t => t.name === tool);
    if (!definition) {
      throw failure('tool');
    }
    if (!valid(args, definition.inputSchema)) {
      throw failure('arguments');
    }
    if (tool === 'world_open') {
      return open(args);
    }
    catchUp();
    if (tool === 'world_look' && args.view === 'kit') {
      return look(world, args, api.viewer || C.viewerHint, files);
    }
    if (!world) {
      throw failure('missing');
    }
    if (tool === 'world_look') {
      if (args.view === 'input') {
        let cursor = cursorOf();
        const reply = look(world, args, api.viewer || C.viewerHint, null, {
          records: readInputs(api), cursor, seen: n => { cursor = Math.max(cursor, n); }
        });
        inputCursors.set(world.name, cursor);
        acknowledgeInputs(api, cursor);
        return reply;
      }
      return look(world, args, api.viewer || C.viewerHint);
    }
    return locked(
      logPath,
      () => {
        catchUp();
        if (tool === 'world_build') {
          const ops = files.resolve(args.ops);
          const next = core.applyBatch(world, ops);
          append({ ops }, next.world, [...builds, ops]);
          next.result = { ...next.result, rev: world.rev,...summary(world), warn };
          let waiting = 0;
          try {
            const cursor = cursorOf();
            waiting = readInputs(api).filter(r => r.n > cursor).length;
          } catch { /* Input hints must not fail an already saved build. */ }
          const notes = world.feed?.filter(entry => entry.rev === world.rev).slice(-2) ?? [];
          const tail = notes.map(entry => '\n' + entry.says).join('') +
            moverReport(next.result.moves, world) + inputHint(waiting);
          return kitBuild(terseResult(next.result), packOf(world).report?.(world), world,
            playReport(world), tail ? [{ says: tail.slice(1) }] : []);
        }
        const steps = args.steps ?? 1;
        if (steps > builds.length) {
          throw failure('history');
        }
        const line = { undo: steps };
        if (steps <= kept.length) {
          const target = kept[kept.length - steps];
          kept = kept.slice(0, kept.length - steps);
          append(line, target, builds.slice(0, builds.length - steps));
        } else {
          const r = core.replay(header, [...lines, line]);
          kept = [];
          append(line, r.world, r.builds);
        }
        return terseResult({ rev: world.rev,...summary(world), life: world.life.length });
      }
    );
  }
  const api = {
    home,
    viewer,
    work: core.work,
    get world() { return world; },
    get logPath() { return logPath; },
    get lines() { return lines; },
    catchUp,
    /** Append one server-played `in` op under the writer lock; false leaves it to the queue. */
    playInput(op) {
      return locked(logPath, () => {
        catchUp();
        let next;
        try { next = core.applyBatch(world, [op]); } catch { return false; }
        append({ ops: [op] }, next.world, [...builds, [op]]);
        return true;
      });
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    state() {
      catchUp();
      const state = snapshot(world);
      if (world?.movers) state.movers = JSON.parse(JSON.stringify(world.movers));
      if (world?.feed) state.feed = world.feed.map(entry => ({ ...entry }));
      return state;
    },
    call(tool, args = {}, door = 'call') {
      const start = performance.now();
      let value;
      let error = null;
      try {
        value = callTool(tool, args);
        return value;
      } catch (caught) {
        error = publicError(caught);
        throw error;
      } finally {
        logUsage(
          home,
          door,
          TOOLS.some(t => t.name === tool) ? tool: 'unknown',
          start,
          args,
          error ? { error: error.message }: value,
          error?.code ?? null,
          files.usage(tool, args)
        );
      }
    }
  };
  return api;
}
