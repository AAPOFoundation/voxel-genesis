// Keep player inputs and acknowledgement cursors separate from canonical world storage.
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync,
  writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { failure } from './errors.mjs';
import { locked } from './save-log.mjs';
import { bindingFor, inOp } from './kit/inputs.mjs';
const rates = new Map(), played = new Map();
const BOUND_PER_SECOND = 4;
const keys = ['up', 'left', 'down', 'right', 'space'];
const isClick = click => Array.isArray(click) && click.length === 3 &&
  click.every(n => Number.isInteger(n) && n >= 0);
const isInput = value => value && typeof value === 'object' && !Array.isArray(value) &&
  (isClick(value.click) && !('key' in value) ||
    keys.includes(value.key) && !('click' in value));
function paths(session) {
  const name = session.world?.name;
  if (!/^[a-z0-9-]{1,32}$/.test(name ?? '')) throw failure('missing');
  const dir = resolve(session.home, 'inputs');
  const entry = lstatSync(dir, { throwIfNoEntry: false });
  if (entry && (!entry.isDirectory() || entry.isSymbolicLink() ||
    realpathSync(dir) !== join(realpathSync(session.home), 'inputs'))) throw failure('io');
  const file = join(dir, name + '.jsonl'), cursor = join(dir, name + '.cursor');
  for (const path of [file, cursor]) {
    const entry = lstatSync(path, { throwIfNoEntry: false });
    if (entry && (!entry.isFile() || entry.isSymbolicLink())) throw failure('io');
  }
  return { dir, file, cursor };
}
function records(file) {
  if (!existsSync(file)) return [];
  const rows = [];
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    try {
      const row = JSON.parse(line);
      if (isInput(row) && Number.isInteger(row.n) && row.n > 0) rows.push(row);
    } catch { /* A damaged row must not hide the remaining inputs. */ }
  }
  return rows.sort((a, b) => a.n - b.n);
}
const acknowledged = file => existsSync(file) ? Number(readFileSync(file, 'utf8')) : 0;
export function acknowledgedMark(session) {
  try {
    const n = acknowledged(paths(session).cursor);
    return Number.isSafeInteger(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}
export function readInputs(session) {
  return records(paths(session).file);
}
export function acknowledgeInputs(session, n) {
  const { file, cursor } = paths(session);
  if (!n || !existsSync(file)) return;
  locked(join(session.home, 'inputs'), () =>
    writeFileSync(cursor, String(Math.max(acknowledged(cursor), n))));
}
export function acceptInput(session, value) {
  session.catchUp();
  const world = session.world;
  if (!world) throw failure('missing');
  const click = value?.click, key = value?.key;
  if (!isInput(value) || Object.keys(value).length !== 1 ||
    click && !world.inside(...click)) {
    throw failure('inputValue');
  }
  const home = realpathSync(session.home);
  if (bindingFor(world, value)) {
    // Bound inputs play themselves, at most four a second a world; the rest wait in the queue.
    const id = join(home, 'worlds', world.name), now = performance.now();
    const times = (played.get(id) ?? []).filter(t => now - t < 1000);
    let done = false;
    try {
      done = times.length < BOUND_PER_SECOND && session.playInput(inOp(value));
    } catch (error) {
      if (error.code !== 'busy') throw error;
    }
    if (done) {
      played.set(id, [...times, now]);
      return 0;
    }
  }
  return locked(join(home, 'inputs'), () => {
    const { dir, file, cursor } = paths(session);
    const rows = records(file), now = Date.now();
    const times = (rates.get(home) ?? []).filter(t => now - t < 1000);
    if (times.length >= 8 || rows.filter(r => r.n > acknowledged(cursor)).length >= 32) {
      throw Object.assign(failure('inputBusy'), { status: 429 });
    }
    const place = click ? Object.values(world.kit?.s?.place ?? {}).find(p =>
      click[0] >= p.at[0] && click[0] <= p.at[2] &&
      click[2] >= p.at[1] && click[2] <= p.at[3])?.id ?? null : null;
    const record = { n: (rows.at(-1)?.n ?? 0) + 1, rev: world.rev,
      ...(click ? { click } : { key }), place };
    mkdirSync(dir, { recursive: true });
    const kept = [...rows.slice(-63), record].map(r => JSON.stringify(r)).join('\n');
    writeFileSync(file, kept + '\n');
    rates.set(home, [...times, now]);
    return record.n;
  });
}
