// Share bounded, deterministic news between core operations and kit effects.
import { failure, opError } from '../errors.mjs';
import { fitWords } from '../kit-copy.mjs';
import { fitText } from '../budget.mjs';
/** Validate the same single-line text at core and kit entry points. */
export function validateNote(text, path) {
  if (typeof text !== 'string' || !text.trim() || /[\p{Cc}\u2028\u2029]/u.test(text)) {
    const error = failure('noteText', text, [], '1');
    throw path ? opError(error, path, ['note', text]) : error;
  }
  return text.trim();
}
/** Append a whole-word line at the revision of the current build. */
export function appendNote(world, text) {
  const line = validateNote(text);
  const says = fitText(line, 80) === line ? line :
    (fitWords(line, 77) || fitText(line, 77)) + '…';
  world.feed = [...(world.feed ?? []), { rev: world.rev + 1, says }].slice(-5);
}
export const note = {
  validate(world, op) {
    if (op.length !== 2) throw failure('form', op);
    validateNote(op[1]);
  },
  expand: op => [op],
  apply: (world, op) => appendNote(world, op[1])
};
