// Own domain errors and safe, bounded explanations shared by every door.
import { C, errorText, coinsError } from './copy.mjs';
import { fitText } from './budget.mjs';
const aliases = { wood: 'timber', stone: 'rock', leaves: 'leaf', home: 'house' };
function distance(left, right) {
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 0; i < left.length; i++) {
    const row = [i + 1];
    for (let j = 0; j < right.length; j++) {
      row.push(
        Math.min(row[j] + 1, previous[j + 1] + 1, previous[j] + Number(left[i] !== right[j]))
      );
    }
    previous = row;
  }
  return previous[right.length];
}
/** Build an error whose code can be logged without argument content. */
export function failure(code, value, allowed = [], field = code) {
  const word = typeof value === 'string' ? value.slice(0, 80):
  '';
  const nearest = allowed.includes(aliases[word]) ? aliases[word]:
  allowed.map(name => ({ name, distance: distance(word, name) })).filter(
    item => item.distance <= 2
  ).sort((left, right) => left.distance - right.distance)[0]?.name;
  const message = code === 'coins' && value ? coinsError(value) : C.error[code] ?? C[code];
  const error = new Error(message);
  Object.assign(error, {
    code: code === 'jsonCli' ? 'json' : code, value, field: field === 'jsonCli' ? 'json' : field,
    suggestion: nearest
  });
  return error;
}
/** Add the submitted operation path, retaining the original error code. */
export function opError(error, path, operation) {
  if (!error.code) {
    error.code = Object.keys(C.error).find(key => C.error[key] === error.message);
  }
  if (!error.code) {
    return error;
  }
  if (error.opPath) {
    return error;
  }
  error.opPath = path;
  error.message = fitText(
    errorText(
      path,
      error.field || error.code,
      error.value ?? operation,
      error.message,
      error.suggestion
    ),
    200
  );
  return error;
}
/** Expose known errors and conceal unexpected storage or engine details. */
export function publicError(error) {
  if (error.code && C.error[error.code]) {
    return error;
  }
  const code = Object.keys(C.error).find(key => C.error[key] === error.message);
  return failure(code || 'io');
}
