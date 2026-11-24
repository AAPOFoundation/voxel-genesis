// COPY-DRAFT: shared kit data, wording and name checks for any bundle path.
import { readFileSync } from 'node:fs';
import { canonBundle, size } from '../src/kit/canon.mjs';
export const banned = new RegExp(
  "\\b(blast|explode|explosion|destroy|demolish|smash|crush|" +
  "kill|die|dead|bomb|shoot|gun|weapon|" + "attack|fight|war)\\b",
  "i"
);
export const spelling = new RegExp(
  "\\b(color|center|gray|neighbor|meter|organize|" + "summarize|initialize|behavior|favorite)\\b",
  "i"
);
export const shortSentences = text => text.split(/[.?!:]/)
  .every(line => line.trim().split(/\s+/).length <= 20);
// Built-in prose may capitalise a sentence start, the word I, and the names a bundle
// declares itself: the `says` of its voice and player parts. Any other capitalised word
// in the middle of a sentence is treated as an undeclared proper name and fails.
const sentenceStart = /(?:^|[.?:|]\s+)([A-Z][a-z]+)\b/g;
const declaredNames = raw => new Set(raw.parts
  .filter(part => /^(voice|player)\//.test(part.part) && typeof part.says === 'string')
  .flatMap(part => part.says.match(/\b[A-Z][a-z]+\b/g) || []));
const properNamesOk = (text, names) => {
  const starts = new Set([...text.matchAll(sentenceStart)].map(match => match.index +
    match[0].length - match[1].length));
  return [...text.matchAll(/\b[A-Z][a-z]+\b/g)].every(match =>
    starts.has(match.index) || names.has(match[0]));
};
export function checkKitData(path, check, raw = JSON.parse(readFileSync(path, 'utf8')),
  ids = new Set()) {
    const { bundle, warnings } = canonBundle(raw, path);
    check('kit-data', raw.kit === 1 && !ids.has(raw.id) && raw.id &&
      JSON.stringify(raw) === JSON.stringify(bundle) && warnings.length === 0 &&
      bundle.parts.length <= 48 && size(bundle) <= 8192 &&
      bundle.parts.every(part => size(part) <= 1024), path);
    ids.add(raw.id);
    check('kit-visible-copy', typeof raw.says === 'string' && raw.says.length >= 12 &&
      raw.says.length <= 80 && !/[\r\n]/.test(raw.says), path + ': bundle says');
    const strings = value => typeof value === 'string' ? [value] :
      value && typeof value === 'object' ? Object.values(value).flatMap(strings) : [];
    const names = declaredNames(raw);
    for (const text of strings(raw)) {
      check('kit-names', properNamesOk(text, names), path + ': ' + text.slice(0, 60));
    }
    check('kit-names', /^[a-z]+(?:-[a-z]+)*$/.test(raw.id) && raw.parts.every(part =>
      /^[a-z]+\/[a-z]+(?:-[a-z]+)*$/.test(part.part)), path);
}
export function checkKitWords(path, check, raw = JSON.parse(readFileSync(path, 'utf8'))) {
  const visit = (value, field = '') => {
    if (typeof value === 'string') {
      check('kit-words', !banned.test(value) && !spelling.test(value) &&
        !/[\u2013\u2014]/.test(value) && (value === '!=' || !value.includes('!')) &&
        !/\b(guarantee|guaranteed|always works|perfect)\b/i.test(value), path);
      if (['says', 'goal', 'lines'].includes(field)) check('kit-words',
        !/\b(rev|hash|seed|op|JSON)\b/i.test(value) &&
        shortSentences(value), path);
      if (path.startsWith('./kit/') && ['says', 'goal', 'lines'].includes(field)) {
        check('kit-visible-copy', !value.includes('COPY-DRAFT'), path + ': ' + field);
      }
    } else if (Array.isArray(value)) value.forEach(item => visit(item, field));
    else if (value && typeof value === 'object') {
      Object.entries(value).forEach(([key, item]) => visit(item, key));
    }
  };
  visit(raw);
}
