// Render bounded discovery and inspection from the shared kind table.
import { KINDS, SECTIONS } from './kinds.mjs';
import { canonPart, contentHash, sorted } from './canon.mjs';
import { inspectParts } from './parts.mjs';
import { KIT_COPY as C, kitError, problemText } from '../kit-copy.mjs';
import { fitText } from '../budget.mjs';
import { playReport as playLines } from './play.mjs';
import { turnPack, matches } from './effects.mjs';
import { storyReport, talkReport, moodOf } from './story.mjs';
export function playReport(world) {
  const open = Object.values(world?.kit?.s.talk ?? {}).includes('open');
  return [playLines(world), world.kitNotice?.story ? storyReport(world) : '',
    world.kitNotice?.talk || open ? talkReport(world) : ''].filter(Boolean).join('\n');
}
const json = value => JSON.stringify(value);
/** Display only fields that differ from documented defaults. */
function briefPart(part) {
  const defaults = canonPart({ part: part.part }).part;
  return sorted(Object.fromEntries(Object.entries(part).filter(([key, value]) =>
    key === 'part' || json(value) !== json(defaults[key]))));
}
const SHARED = ['action', 'goal', 'beat', 'mood', 'board', 'bot'];
/** One kind's doc; `extra` adds the shared names and effects lines. */
function kindDoc(of, extra) {
  const kind = KINDS[of];
  const tail = extra && SHARED.includes(of) ?
    '\n' + C.names + (['action', 'beat'].includes(of) ? '\n' + C.effects : '') : '';
  return of + ': ' + kind.doc + C.defaultLabel + json(kind.defaults) +
    C.fieldsLabel + Object.entries(kind.types).map(([key, type]) => key + ':' + type).join(' ') +
    tail + C.exampleLabel + json(kind.example);
}
/** Render kit views without requiring a world to exist. */
export function kitView(world, of, files) {
  const parts = world?.kit?.parts ?? {};
  if (!of) {
    const catalogue = files?.catalogue() ?? { bundles: [], custom: 0 };
    return fitText(C.catalogue + SECTIONS.map(section => section + ': ' +
      Object.keys(KINDS).filter(kind => KINDS[kind].section === section).join(' ')).join('\n') +
      '\n' + catalogue.bundles.map(bundle => bundle.id + ': ' + (bundle.says ?? '')).join('\n') +
      '\n' + C.project + catalogue.custom + '; ' + C.parts + Object.keys(parts).length +
      '\n' + C.example, 1200);
  }
  if (of === 'check') {
    const issues = files ? files.check(world) : inspectParts(world);
    return fitText(issues.length ? issues.map(problemText).join('\n') : C.noProblems, 1200);
  }
  if (of === 'play') {
    const boards = Object.values(parts).filter(part => part.part.startsWith('board/'));
    const board = Object.values(world?.kit?.s.place ?? {}).map(place => {
      const defaults = Object.assign({}, ...boards.filter(part => matches(place, part.places))
        .map(part => part.props));
      const props = Object.keys(defaults).filter(key => !['owner', 'level'].includes(key) &&
        json(sorted(place[key])) !== json(sorted(defaults[key])))
        .map(key => key + '=' + String(place[key]));
      return [place.id + ':' + (place.owner || '.') + ':' + (place.level ?? 0), ...props]
        .join(' ');
    }).join(' ');
    const text = turnPack(world)
      ? playLines(world) + (board ? '\n' + board : '')
      : [playLines(world), board].filter(Boolean).join('\n');
    return fitText(text, 900);
  }
  if (of === 'story') return storyReport(world, true) || C.storyLabel + C.noParts;
  if (of === 'music') return C.musicLabel + (moodOf(world)?.id ?? C.noParts);
  if (of === 'talk' && Object.keys(parts).some(key => key.startsWith('talk/'))) {
    return talkReport(world);
  }
  if (Object.hasOwn(KINDS, of)) {
    const live = of === 'talk' ? '\n' + C.status + ': ' +
      (Object.keys(parts).filter(key => KINDS[key.split('/')[0]]?.section === 'talk')
        .join(' ') || C.noParts) : '';
    return fitText(kindDoc(of, true) + live, 900);
  }
  if (/[,|]/.test(of)) {
    const names = of.split(/[,|]/);
    if (names.length < 2 || names.length > 6 || new Set(names).size !== names.length ||
      !names.every(name => Object.hasOwn(KINDS, name))) throw kitError(of, 'lookupList');
    const text = names.map(name => kindDoc(name, false)).join('\n\n') +
      (names.some(name => SHARED.includes(name)) ? '\n' + C.names : '') +
      (names.some(name => ['action', 'beat'].includes(name)) ? '\n' + C.effects : '');
    if (Buffer.byteLength(text) > 2000) throw kitError(of, 'lookupList');
    return text;
  }
  if (of.includes('/')) {
    const part = of.includes(':') ? files?.part(of) : parts[of];
    if (!part) {
      const [kind, id, ...rest] = of.split('/');
      if (!of.includes(':') && !rest.length && Object.hasOwn(KINDS, kind) &&
        /^[a-z][a-z0-9-]{0,23}$/.test(id)) {
        throw kitError(of, 'lookupId', { id: of,
          have: Object.keys(parts).filter(key => key.startsWith(kind + '/')) });
      }
      throw kitError(of, 'lookup', Object.keys(KINDS));
    }
    const suffix = C.hash + contentHash(part);
    return fitText(json(briefPart(part)), 700 - suffix.length) + suffix;
  }
  if (SECTIONS.includes(of)) {
    const chosen = Object.values(parts).filter(part =>
      KINDS[part.part.split('/')[0]]?.section === of);
    const status = of === 'world' ? Object.values(world?.kit?.s.place ?? {}).map(place =>
      place.id + ':' + place.at.join(',')).join(' ') : chosen.map(part => part.part).join(' ');
    return fitText(of + ': ' + (status || C.noParts), of === 'story' ? 300 : 900);
  }
  let bundle;
  try { bundle = files?.bundle(of); } catch (error) {
    const problem = error.issue?.problem ?? '';
    if (problem === 'bad id' || problem.startsWith('missing target')) {
      throw kitError(of, 'lookup', Object.keys(KINDS));
    }
    throw error;
  }
  if (!bundle) throw kitError(of, 'lookup', Object.keys(KINDS));
  return fitText((bundle.says ?? '') + '\n' + SECTIONS.map(section => section + ': ' +
    bundle.parts.filter(part => KINDS[part.part.split('/')[0]]?.section === section)
      .map(part => part.part).join(' ')).join('\n'), 900);
}
