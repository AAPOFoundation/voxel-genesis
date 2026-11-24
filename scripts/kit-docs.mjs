// COPY-DRAFT: generate short reference pages directly from the live kind table.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { KINDS, EFFECTS, OPERATORS } from '../src/kit/kinds.mjs';
import { createKitFiles } from '../src/kit-files.mjs';

const begin = '[//]: # (kit-bundles:start)', end = '[//]: # (kit-bundles:end)';
const copy = { markers: 'Add the kit bundle markers to README.md.',
  stale: 'Kit docs differ. Run node scripts/kit-docs.mjs --write.' };
const wrap = text => text.match(/.{1,96}(?:\s|$)|\S+/g)?.map(line => line.trimEnd()) ?? [];
export function partsDoc() {
  const lines = ['# Kit parts', '', '[//]: # (COPY-DRAFT)', '',
    'Use world_look with {"view":"kit"} first. The live catalogue is the first source.',
    'Use {"view":"kit","of":"action"} for one kind. Omitted fields take these defaults.',
    'Each example is one part, passed as the second item of a part operation.', '',
    'Effects: ' + EFFECTS.join(', ') + '.',
    ...wrap('Operators: ' + OPERATORS.join(', ') + '.'), ''];
  for (const [name, kind] of Object.entries(KINDS)) {
    lines.push('## ' + name + ' (' + kind.section + ')', '', ...wrap(kind.doc), '',
      '| Field | Type | Default |', '|---|---|---|');
    for (const field of kind.fields) {
      lines.push('| ' + field + ' | ' + kind.types[field].replaceAll('|', '\\|') + ' | ' +
        '`' + JSON.stringify(kind.defaults[field]) + '` |');
    }
    const example = JSON.stringify(kind.example);
    lines.push('', '```json', ...(example.length <= 100 ? [example] :
      JSON.stringify(kind.example, null, 2).split('\n')), '```', '');
  }
  return lines.join('\n');
}
export function bundleList() {
  const lines = [begin, '[//]: # (COPY-DRAFT)', '',
    'These bundles are editable examples. Compose parts for the game you need.',
    'Start with the live catalogue, then inspect or copy individual parts.', '',
    '| Example | Sections | Parts |', '|---|---|---:|'];
  for (const bundle of createKitFiles({ folder: '.agent-work/no-project-kits' })
    .catalogue().bundles) {
    const sections = [...new Set(bundle.parts.map(part => KINDS[part.part.split('/')[0]].section))]
      .sort();
    lines.push('| ' + bundle.id + ' | ' + sections.join(', ') + ' | ' + bundle.parts.length + ' |');
  }
  return lines.concat(end).join('\n');
}
export function updateReadme(text, list = bundleList()) {
  const start = text.indexOf(begin), stop = text.indexOf(end);
  if (start < 0 || stop < start) throw new Error(copy.markers);
  return text.slice(0, start) + list + text.slice(stop + end.length);
}
function main() {
  const readme = readFileSync('README.md', 'utf8').replace(/\r\n/g, '\n');
  const outputs = [['docs/KIT-PARTS.md', partsDoc()], ['README.md', updateReadme(readme)]];
  if (process.argv.includes('--write')) {
    for (const [path, text] of outputs) writeFileSync(path, text);
    console.log('COPY-DRAFT: kit docs written.');
  } else {
    for (const [path, text] of outputs) {
      if (readFileSync(path, 'utf8').replace(/\r\n/g, '\n') !== text) {
        throw new Error(copy.stale);
      }
    }
    console.log('COPY-DRAFT: kit docs are in sync.');
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
