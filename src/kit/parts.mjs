// Apply atomic part changes, derive places and retain state by part identity.
import { KINDS, NESTED, SECTIONS, KIT_OPS } from './kinds.mjs';
import { canonPart, canonBundle, partId, normalId, copy, sorted, size } from './canon.mjs';
import { OPS, expand } from '../core/ops.mjs';
import { KIT_COPY, kitError, kitProblem, warningText } from '../kit-copy.mjs';
import { playOp, playStep } from './play.mjs';
import { storyStep, say } from './story.mjs';
import { checkInput } from './inputs.mjs';

const kindOf = part => part.part.split('/')[0];
const idOf = part => part.part.split('/')[1];
const own = (object, key) => Object.hasOwn(object, key);
const fieldError = (path, field) => kitError(path + '.' + field, 'bounds');
function rectangle(world, at, path) {
  if (at.length !== 4 || at.some(n => !Number.isInteger(n)) ||
    at[0] < 0 || at[1] < 0 || at[2] >= world.w || at[3] >= world.d ||
    at[0] > at[2] || at[1] > at[3]) throw kitError(path, 'bounds');
  return at;
}
function places(world, part, path) {
  const id = idOf(part);
  if (!part.grid) return [{ ...copy(part.props), id, at: rectangle(world,
    part.at ?? [0, 0, world.w - 1, world.d - 1], path + '.at'),
  tags: part.tags, source: part.part }];
  const g = part.grid;
  if (g.cell.some(n => n < 1) || g.cols * g.rows > world.w * world.d) {
    throw fieldError(path, 'grid');
  }
  for (const [name, rect] of Object.entries(part.groups)) {
    if (rect.some(n => n < 0) || rect[0] > rect[2] || rect[1] > rect[3] ||
      rect[2] >= g.cols || rect[3] >= g.rows) throw fieldError(path, 'groups.' + name);
  }
  return Array.from({ length: g.cols * g.rows }, (_, index) => {
    const col = index % g.cols, row = Math.floor(index / g.cols);
    const x = g.at[0] + col * (g.cell[0] + g.gap);
    const z = g.at[1] + row * (g.cell[1] + g.gap);
    const at = rectangle(world, [x, z, x + g.cell[0] - 1, z + g.cell[1] - 1], path + '.grid');
    const group = Object.entries(part.groups).find(([, [a, b, c, d]]) =>
      col >= a && col <= c && row >= b && row <= d)?.[0] ?? '';
    const props = Object.fromEntries(Object.entries(part.props).map(([key, value]) =>
      [key, value && typeof value === 'object' && !Array.isArray(value) ?
        value[group] ?? 0 : value]));
    return { ...props, id: id + '-' + (index + 1), at, group,
      tags: [...new Set([id, ...part.tags])], source: part.part };
  });
}
function cycles(parts, path) {
  for (const part of Object.values(parts).filter(p => kindOf(p) === 'beat')) {
    const seen = new Set([part.part]);
    let after = part.after;
    while (after && parts['beat/' + after]) {
      const key = 'beat/' + after;
      if (seen.has(key)) throw kitError(path + '.' + part.part + '.after', 'cycle');
      seen.add(key);
      after = parts[key].after;
    }
  }
}
function initialise(world, part, path) {
  const s = world.kit.s, id = idOf(part), kind = kindOf(part);
  if (kind === 'store') {
    s.store ??= {};
    const names = Object.keys(world.kit.parts).filter(key => key.startsWith('player/'))
      .map(key => key.split('/')[1]);
    const players = part.per === 'game' ? ['game'] : names.length ? names : ['you'];
    const old = own(s.store, id) ? s.store[id] : {};
    s.store[id] = Object.fromEntries(players.map(player => [player,
      Math.max(part.min, Math.min(part.max ?? Infinity, old[player] ?? part.start))]));
  }
  if (kind === 'input') checkInput(part, path);
  if (kind === 'place') {
    s.place ??= {};
    const old = copy(s.place);
    const next = places(world, part, path);
    for (const [key, place] of Object.entries(old)) {
      if (place.source === part.part) delete s.place[key];
    }
    for (const place of next) {
      s.place[place.id] = { ...place, ...old[place.id], id: place.id, at: place.at,
        tags: place.tags, source: place.source, group: place.group ?? '' };
    }
  }
}
/** Read-only diagnostics for cross-part links. Missing sections never alter state. */
export function inspectParts(world) {
  const parts = world?.kit?.parts ?? {}, issues = [];
  const flags = new Set();
  const declared = value => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value) && value[0] === 'flag') flags.add(value[1]);
    Object.values(value).forEach(declared);
  };
  declared(parts);
  const targets = { bot: 'bot', after: 'beat', voice: 'voice', tune: 'tune' };
  const missing = (path, kind, id) => {
    if (id && !own(parts, kind + '/' + id)) {
      issues.push(kitProblem(path, 'missing', kind + '/' + id));
    }
  };
  const name = (value, path) => {
    if (typeof value !== 'string' || !value || value === 'me') return;
    const [head, tail] = value.split('.');
    const known = ['turn', 'moves', 'roll'].includes(value) ||
      ['place', 'my', 'all', 'blocks', 'town'].includes(head) ||
      own(parts, 'store/' + value) || own(parts, 'player/' + value) ||
      own(parts, 'store/' + tail) && own(parts, 'player/' + head) ||
      head === 'beat' && own(parts, 'beat/' + tail) ||
      head === 'built' && own(parts, 'place/' + tail) ||
      head === 'flag' && (flags.has(tail) || own(world?.kit?.s?.flag ?? {}, tail));
    if (!known) issues.push(kitProblem(path, 'name', value));
  };
  const expression = (value, path) => {
    if (Array.isArray(value)) value.slice(1).forEach((item, index) =>
      expression(item, path + '.' + (index + 1)));
    else name(value, path);
  };
  const effects = (list, path) => list.forEach((effect, index) => {
    const at = path + '.' + index;
    const [op, target, value, other] = effect;
    const kind = { add: 'store', roll: 'dice', draw: 'deck', talk: 'talk' }[op];
    if (kind) missing(at, kind, target);
    if (['add', 'set', 'flag'].includes(op)) expression(value, at + '.2');
    if (op === 'if') {
      expression(target, at + '.1');
      effects(value, at + '.2');
      effects(other ?? [], at + '.3');
    }
    if (op === 'each') effects(value, at + '.2');
  });
  const reads = (value, types, path) => {
    for (const [key, type] of Object.entries(types)) {
      const at = path + '.' + key;
      if (type === 'expr' || type === 'expr?') expression(value[key], at);
      if (type === 'exprs') Object.entries(value[key]).forEach(([key, item]) =>
        expression(item, at + '.' + key));
      if (type === 'conditions') value[key].forEach((item, i) => expression(item, at + '.' + i));
      if (type === 'effects') effects(value[key], at);
      if (Object.hasOwn(NESTED, type)) value[key].forEach((item, index) => {
        const nested = NESTED[type].types;
        for (const field of Object.keys(item)) if (!own(nested, field)) {
          issues.push(kitProblem(at + '.' + index + '.' + field, 'unknown'));
        }
        reads(item, nested, at + '.' + index);
      });
    }
  };
  for (const part of Object.values(parts)) {
    const kind = kindOf(part), path = part.part;
    if (!own(KINDS, kind)) {
      issues.push(kitProblem(path, 'unknown'));
      continue;
    }
    reads(part, KINDS[kind].types, path);
    for (const key of Object.keys(part)) {
      if (key !== 'part' && !own(KINDS[kind].types, key)) {
        issues.push(kitProblem(path + '.' + key, 'unknown'));
      }
      if (targets[key] && KINDS[kind].types[key]) {
        missing(path + '.' + key, targets[key], part[key]);
      }
    }
    if (kind === 'talk' && part.on.includes('/')) {
      const [targetKind, id] = part.on.split('/');
      missing(path + '.on', targetKind, id);
    }
    if (kind === 'talk') part.asks.forEach((ask, index) =>
      missing(path + '.asks.' + index + '.next', 'talk', ask.next));
    if (kind === 'bot') part.rules.forEach((rule, index) =>
      missing(path + '.rules.' + index + '.act', 'action', rule.act));
  }
  const click = Object.values(parts).find(p => kindOf(p) === 'input' && p.on === 'click');
  if (click && !Object.keys(parts).some(key => key.startsWith('place/'))) {
    issues.push(kitProblem(click.part, 'noPlace'));
  }
  return issues;
}
function edit(world, op, path) {
  const key = partId(op[1], path), original = world.kit?.parts[key];
  if (!original) throw kitError(path, 'missing', key);
  if (typeof op[2] !== 'string' || !op[2]) throw kitError(path, 'path', 'field');
  const part = copy(original), fields = op[2].split('.');
  let value = part, defaults = canonPart({ part: key }).part;
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i], last = i === fields.length - 1;
    if (['__proto__', 'prototype', 'constructor', 'part'].includes(field)) {
      throw kitError(path + '.' + op[2], 'path', 'field');
    }
    const append = Array.isArray(value) && field === '+' && last;
    const arrayKey = Array.isArray(value) && /^(0|[1-9]\d*)$/.test(field) &&
      Number(field) < value.length;
    const dynamic = i === 1 && ['cost', 'props', 'calc', 'groups'].includes(fields[0]);
    if (!append && !arrayKey && !own(value, field) && !(dynamic && last)) {
      const nearest = Object.keys(value).filter(key => key !== 'part').sort((a, b) =>
        Math.abs(a.length - field.length) - Math.abs(b.length - field.length) ||
        Number(b[0] === field[0]) - Number(a[0] === field[0]))[0] ?? '';
      throw kitError(path + '.' + op[2], 'path', nearest);
    }
    if (last) {
      if (append) value.push(copy(op[3]));
      else if (op[3] !== null) value[field] = copy(op[3]);
      else if (defaults && own(defaults, field)) value[field] = copy(defaults[field]);
      else if (Array.isArray(value)) value.splice(Number(field), 1);
      else delete value[field];
    } else {
      value = value[field];
      defaults = defaults?.[field];
      if (!value || typeof value !== 'object') throw kitError(path + '.' + op[2], 'path', field);
    }
  }
  return canonPart(part, path);
}
function cut(world, target, path) {
  if (typeof target !== 'string') throw kitError(path, 'form');
  const select = target === '*' || SECTIONS.includes(target) ? target : partId(target, path);
  for (const [key, part] of Object.entries(world.kit?.parts ?? {})) {
    if (select !== '*' && select !== key && KINDS[kindOf(part)]?.section !== select) {
      continue;
    }
    delete world.kit.parts[key];
    const s = world.kit.s, id = idOf(part), kind = kindOf(part);
    if (s[kind] && own(s[kind], id)) delete s[kind][id];
    if (kind === 'talk' && s.queue) s.queue = s.queue.filter(name => name !== id);
    if (kind === 'turn' && !Object.values(world.kit.parts).some(p => kindOf(p) === 'turn')) {
      for (const key of ['turn', 'who', 'moves']) delete s[key];
    }
    if (kind === 'board') for (const place of Object.values(s.place ?? {})) {
      if (part.places && !place.tags.includes(part.places)) continue;
      const source = world.kit.parts[place.source];
      for (const key of [...Object.keys(part.props), ...Object.keys(part.calc)]) {
        const retained = Object.values(world.kit.parts).some(p => kindOf(p) === 'board' &&
          (!p.places || place.tags.includes(p.places)) && (own(p.props, key) || own(p.calc, key)));
        if (!retained && !own(source?.props ?? {}, key)) delete place[key];
      }
    }
    if (kind === 'place') for (const [name, place] of Object.entries(s.place ?? {})) {
      if (place.source === key) delete s.place[name];
    }
    for (const state of Object.keys(s)) {
      if (s[state] && typeof s[state] === 'object' && !Object.keys(s[state]).length) {
        delete s[state];
      }
    }
  }
  if (world.kit && select === 'play') {
    for (const key of ['turn', 'who', 'moves', 'rolls', 'roll', 'store', 'at', 'last', 'over']) {
      delete world.kit.s[key];
    }
  }
  if (world.kit && !Object.keys(world.kit.parts).length) delete world.kit;
}
/** Refresh play facts after each primitive, before the shared settlement pass. */
export function kitStep(world, engine) {
  playStep(world);
  storyStep(world, engine);
  playStep(world);
}
/** Join base operations while using the same primitive execution and settlement hooks. */
export function kitOps(startOp, settle) {
  const apply = (world, op, engine) => {
    const path = (op.source ?? 'ops[0]') + '.' + op[0];
    const name = op[0];
    if (!['do', 'end', 'say'].includes(name)) world.kitWarnings ??= [];
    if (name === 'do' || name === 'end') {
      playOp(world, op, engine);
    } else if (name === 'say') {
      say(world, op, engine);
    } else if (name === 'cut') {
      cut(world, op[1], path);
    } else {
      let parts, warnings;
      if (name === 'kit') {
        if (typeof op[1] === 'string') throw kitError(path, 'unresolved');
        const result = canonBundle(op[1], path);
        parts = result.bundle.parts;
        warnings = result.warnings;
        if (op[2] !== undefined) {
          if (!SECTIONS.includes(op[2])) throw kitError(path, 'type', SECTIONS.join('|'));
          parts = parts.filter(part => KINDS[kindOf(part)]?.section === op[2]);
        }
      } else {
        if (name === 'part' && typeof op[1] === 'string') throw kitError(path, 'unresolved');
        const result = name === 'edit' ? edit(world, op, path) : canonPart(op[1], path);
        parts = [result.part];
        warnings = result.warnings;
      }
      world.kitWarnings.push(...warnings);
      if (parts.length) world.kit ??= { v: 1, parts: {}, s: {} };
      for (const part of parts) world.kit.parts[part.part] = part;
      if (world.kit) {
        cycles(world.kit.parts, path);
        for (const part of parts) initialise(world, part, path + '.' + part.part);
        if (parts.some(part => kindOf(part) === 'player')) {
          for (const part of Object.values(world.kit.parts).filter(p => kindOf(p) === 'store')) {
            initialise(world, part, path + '.' + part.part);
          }
        }
        if (Object.keys(world.kit.parts).length > 96 || size(world.kit) > 16384) {
          throw kitError(path + '.parts', 'worldcap');
        }
      }
      for (const part of parts.filter(part => kindOf(part) === 'scene')) {
        if (!part.ops.length) continue;
        let expanded;
        try { expanded = expand(part.ops, OPS); }
        catch { throw kitError(path + '.' + part.part + '.ops', 'scene'); }
        for (const primitive of expanded) {
          startOp(world, primitive);
          settle(world);
        }
      }
    }
    if (world.kit) {
      world.kit.parts = sorted(world.kit.parts);
      world.kit.s = sorted(world.kit.s);
      const found = inspectParts(world);
      // The no-place line is true only at reply time: a later part op may add the place.
      const line = KIT_COPY.problems.noPlace[0];
      if (world.kitWarnings && !found.some(issue => issue.problem === line)) {
        world.kitWarnings = world.kitWarnings.filter(w => !w.includes(line));
      }
      for (const issue of found.filter(issue => !issue.problem.includes('kept'))) {
        if (world.kitWarnings) {
          const warning = warningText(issue);
          if (!world.kitWarnings.includes(warning)) world.kitWarnings.push(warning);
        }
      }
    }
  };
  return Object.fromEntries(KIT_OPS.map(name => [name, {
    expand: op => [op],
    validate(world, op) {
      const path = (op.source ?? 'ops[0]') + '.' + name;
      const shapes = { kit: [2, 3], part: [2], edit: [4], cut: [2], do: [2, 3],
        end: [1], say: [1, 2] };
      if (!shapes[name].includes(op.length)) {
        throw kitError(path, 'form');
      }
    },
    apply
  }]));
}
