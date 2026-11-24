// Canonicalise one part or bundle, validating only fields that the interpreter reads.
import { KINDS, NESTED, ALIASES, SECTIONS } from './kinds.mjs';
import { validateExpr, validateEffects } from './expr.mjs';
import { kitError, kitWarning } from '../kit-copy.mjs';
import { BLOCKS } from '../core/palette.mjs';
export const copy = value => JSON.parse(JSON.stringify(value));
export const size = value => new TextEncoder().encode(JSON.stringify(value)).length;
export const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
/** Sort keys recursively while retaining all unknown JSON values. */
export function sorted(value) {
  if (Array.isArray(value)) return value.map(sorted);
  if (!object(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, sorted(value[key])]));
}
/** Canonical identifiers also apply to references. */
export function normalId(value, path = 'id', empty = false) {
  if (typeof value !== 'string') throw kitError(path, 'id');
  const id = value.toLowerCase().replace(/[ _]/g, '-');
  if (empty && id === '') return id;
  if (!/^[a-z][a-z0-9-]{0,23}$/.test(id)) throw kitError(path, 'id');
  return id;
}
export function partId(value, path = 'part') {
  if (typeof value !== 'string' || value.split('/').length !== 2) throw kitError(path, 'id');
  return value.split('/').map(id => normalId(id, path)).join('/');
}
const number = (value, path, warnings) => {
  if (typeof value === 'boolean' || typeof value === 'string' && /^-?\d+$/.test(value)) {
    warnings.push(kitWarning(path, 'integer'));
    value = Number(value);
  }
  if (!Number.isSafeInteger(value)) throw kitError(path, 'type', 'integer');
  return value;
};
function expr(value, path, warnings) {
  if (typeof value === 'boolean' || typeof value === 'string' && /^-?\d+$/.test(value)) {
    return number(value, path, warnings);
  }
  if (Array.isArray(value)) {
    value = value.map((item, index) => index ? expr(item, path + '.' + index, warnings) : item);
  }
  if (typeof value === 'string') value = value.toLowerCase().replace(/[ _]/g, '-');
  validateExpr(value, path);
  return value;
}
function effects(value, path, warnings) {
  if (value.length && typeof value[0] === 'string') value = [value];
  value = value.map((effect, index) => {
    if (!Array.isArray(effect)) throw kitError(path + '.' + index, 'effect');
    const [op, target, arg, other] = effect;
    const at = path + '.' + index;
    const result = copy(effect);
    if (['add', 'flag', 'roll', 'draw', 'talk'].includes(op)) {
      result[1] = normalId(target, at + '.1');
    }
    if (['add', 'flag', 'set'].includes(op)) result[2] = expr(arg, at + '.2', warnings);
    if (op === 'if') {
      result[1] = expr(target, at + '.1', warnings);
      if (!Array.isArray(arg)) throw kitError(at + '.2', 'effect');
      result[2] = effects(arg, at + '.2', warnings);
      if (other !== undefined) {
        if (!Array.isArray(other)) throw kitError(at + '.3', 'effect');
        result[3] = effects(other, at + '.3', warnings);
      }
    }
    if (op === 'each') {
      if (!Array.isArray(arg)) throw kitError(at + '.2', 'effect');
      result[2] = effects(arg, at + '.2', warnings);
    }
    return result;
  });
  validateEffects(value, path);
  return value;
}
function fields(input, schema, path, warnings) {
  if (!object(input)) throw kitError(path, 'object');
  const value = copy(input);
  for (const [alias, field] of Object.entries(ALIASES)) {
    if (!Object.hasOwn(value, alias) || !Object.hasOwn(schema.types, field)) continue;
    if (!Object.hasOwn(value, field)) value[field] = value[alias];
    delete value[alias];
    warnings.push(kitWarning(path + '.' + alias, 'alias', field));
  }
  for (const key of Object.keys(value)) {
    if (!Object.hasOwn(schema.types, key)) warnings.push(kitWarning(path + '.' + key, 'unknown'));
  }
  for (const [key, type] of Object.entries(schema.types)) {
    value[key] = normal(value[key] ?? copy(schema.defaults[key]), type,
      path + '.' + key, warnings);
  }
  return value;
}
function normal(value, type, path, warnings) {
  if (type.endsWith('?')) {
    if (value === null) return null;
    const base = type.slice(0, -1);
    if (base === 'id') return normalId(value, path, true);
    if (base === 'block' && value === '') return '';
    return normal(value, base, path, warnings);
  }
  if (type === 'expr') return expr(value, path, warnings);
  if (['int', 'uint', 'positive', 'bpm'].includes(type)) {
    const n = number(value, path, warnings);
    const lo = { uint: 0, positive: 1, bpm: 50 }[type] ?? -Infinity;
    const hi = type === 'bpm' ? 120 : Infinity;
    if (n < lo || n > hi) throw kitError(path, 'range', lo + '..' + hi);
    return n;
  }
  if (type === 'id') return normalId(value, path);
  if (['text', 'block', 'trigger', 'steps'].includes(type) || type.includes('|')) {
    if (typeof value !== 'string') throw kitError(path, 'type', type);
    if (type.includes('|') && !type.split('|').includes(value)) throw kitError(path, 'type', type);
    if (type === 'block' && !BLOCKS.some(block => block.name === value)) {
      throw kitError(path, 'type', 'block');
    }
    if (type === 'trigger' && value && value !== 'start') {
      if (!/^(beat|action)\//.test(value)) throw kitError(path, 'type', 'beat/id|action/id|start');
      return partId(value, path);
    }
    return value;
  }
  if (type === 'bool') {
    if (typeof value !== 'boolean') throw kitError(path, 'type', type);
    return value;
  }
  if (type === 'grid') return fields(value, NESTED.grid, path, warnings);
  if (['object', 'exprs', 'rects'].includes(type)) {
    if (!object(value)) throw kitError(path, 'object');
    if (type === 'object') return value;
    return Object.fromEntries(Object.entries(value).map(([key, item]) =>
      [normalId(key, path), normal(item, type === 'exprs' ? 'expr' : 'rect',
        path + '.' + key, warnings)]));
  }
  if (!Array.isArray(value)) {
    if (type === 'conditions' && typeof value === 'string') throw kitError(path, 'infix');
    throw kitError(path, 'type', type);
  }
  if (type === 'conditions') {
    if (value.length && typeof value[0] === 'string') value = [value];
    return value.map((item, index) => expr(item, path + '.' + index, warnings));
  }
  if (type === 'effects') return effects(value, path, warnings);
  if (Object.hasOwn(NESTED, type)) {
    return value.map((item, index) => fields(item, NESTED[type], path + '.' + index, warnings));
  }
  if (type === 'ids' || type === 'texts') return value.map((item, index) =>
    normal(item, type === 'ids' ? 'id' : 'text', path + '.' + index, warnings));
  if (['rect', 'pair', 'scale'].includes(type)) {
    if (type === 'rect' && value.length !== 4 || type === 'pair' && value.length !== 2 ||
      type === 'scale' && !value.length) throw kitError(path, 'type', type);
    return value.map((item, index) => number(item, path + '.' + index, warnings));
  }
  if (type === 'ops' && value.some(item => !Array.isArray(item))) throw kitError(path, 'scene');
  return value;
}
/** Return canonical data and warnings, leaving the input untouched. */
export function canonPart(input, path = 'part') {
  if (!object(input)) throw kitError(path, 'object');
  const value = copy(input), warnings = [];
  const id = partId(value.part ?? `${value.kind}/${value.id}`, path + '.part');
  const kind = id.split('/')[0];
  path += '.' + id;
  delete value.part;
  delete value.kind;
  delete value.id;
  let part;
  if (!Object.hasOwn(KINDS, kind)) {
    part = value;
    warnings.push(kitWarning(path + '.' + kind, 'unknown'));
  } else {
    part = fields(value, KINDS[kind], path, warnings);
    if (kind === 'store' && part.max !== null && part.max < part.min) {
      throw kitError(path + '.max', 'range', '>=' + part.min);
    }
    if (kind === 'tune') {
      if (part.voices.length > 4) throw kitError(path + '.voices', 'range', '0..4');
      part.voices.forEach((voice, index) => {
        const steps = voice.steps.trim() ? voice.steps.trim().split(/\s+/) : [];
        if (steps.length > 32) throw kitError(path + '.voices.' + index, 'range', '0..32');
        steps.forEach((note, step) => {
          if (!['.', '-'].includes(note) &&
            (!/^\d+$/.test(note) || Number(note) >= part.scale.length)) {
            throw kitError(path + '.voices.' + index + '.steps.' + step, 'note');
          }
        });
        voice.steps = steps.join(' ');
      });
    }
  }
  part = sorted({ ...part, part: id });
  if (size(part) > 1024) throw kitError(path + '.part', 'partcap');
  return { part, warnings };
}
/** Canonicalise bare parts, lists and bundle objects through the same path. */
export function canonBundle(input, path = 'kit') {
  let value = Array.isArray(input) ? { kit: 1, parts: input } : copy(input);
  if (!object(value)) throw kitError(path, 'object');
  if (value.part || value.kind) value = { kit: 1, parts: [value] };
  if (value.kit !== undefined && value.kit !== 1) throw kitError(path, 'version');
  if (!Array.isArray(value.parts)) throw kitError(path + '.parts', 'type', 'array');
  const warnings = [];
  const parts = value.parts.map((part, index) => {
    const result = canonPart(part, path + '.parts.' + index);
    warnings.push(...result.warnings);
    return result.part;
  }).sort((a, b) => a.part < b.part ? -1 : a.part > b.part ? 1 : 0);
  const bundle = { ...value, kit: 1, parts };
  if (bundle.id !== undefined) {
    bundle.id = normalId(bundle.id, path + '.id');
    if (Object.hasOwn(KINDS, bundle.id) || SECTIONS.includes(bundle.id)) {
      throw kitError(path + '.id', 'collision');
    }
  }
  if (parts.length > 48 || size(bundle) > 8192) throw kitError(path + '.parts', 'bundlecap');
  return { bundle: sorted(bundle), warnings };
}
/** Hash canonical content independently of the containing world. */
export function contentHash(value) {
  let hash = 2166136261;
  for (const byte of new TextEncoder().encode(JSON.stringify(sorted(value)))) {
    hash = Math.imul(hash ^ byte, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
