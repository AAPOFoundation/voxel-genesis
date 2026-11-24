// Measure wire values and trim text without splitting Unicode characters.
const encoder = new TextEncoder();
/** Return the UTF-8 size of a JSON wire value. */
export function bytes(value) {
  return encoder.encode(JSON.stringify(value) ?? 'null').length;
}
/** Keep a text value inside a UTF-8 byte budget. */
export function fitText(text, limit) {
  let result = '';
  let size = 0;
  for (const character of text) {
    size += encoder.encode(character).length;
    if (size > limit) {
      break;
    }
    result += character;
  }
  return result;
}
