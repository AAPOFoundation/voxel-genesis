// Read JSON from a literal, a file or standard input for CLI modes.
import { readFileSync } from 'node:fs';
import { C } from './copy.mjs';
import { failure } from './errors.mjs';
const json = text => {
  try {
    return JSON.parse(text);
  } catch {
    throw failure('jsonCli');
  }
};
/** Decode one CLI argument without leaking file errors. */
export function input(arg = '{}') {
  try {
    return json(
      arg === '-' ? readFileSync(0, 'utf8'): arg.startsWith('@') ?
      readFileSync(arg.slice(1), 'utf8'): arg
    );
  } catch (e) {
    if (e.message === C.error.jsonCli) {
      throw e;
    }
    throw failure('file');
  }
}
