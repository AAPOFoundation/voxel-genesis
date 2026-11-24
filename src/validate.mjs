// Validate the supported JSON schema subset for all tool calls.
/** Check a value recursively without coercion or extra object properties. */
export function valid(value, rule) {
  if (rule.type === 'integer' && !Number.isSafeInteger(value)) {
    return false;
  }
  if (rule.type === 'string' && typeof value !== 'string') {
    return false;
  }
  if (rule.type === 'boolean' && typeof value !== 'boolean') {
    return false;
  }
  if (rule.type === 'array' && !Array.isArray(value)) {
    return false;
  }
  if (rule.type === 'object' && (!value || typeof value !== 'object' || Array.isArray(value))) {
    return false;
  }
  if (rule.enum && !rule.enum.includes(value)) {
    return false;
  }
  if (
    rule.minimum !== undefined && value < rule.minimum || rule.maximum !== undefined &&
    value > rule.maximum
  ) {
    return false;
  }
  if (rule.pattern && !new RegExp(rule.pattern).test(value)) {
    return false;
  }
  if (
    rule.minItems !== undefined && value.length < rule.minItems ||
    rule.maxItems !== undefined && value.length > rule.maxItems
  ) {
    return false;
  }
  if (rule.items && !value.every(v => valid(v, rule.items))) {
    return false;
  }
  if (rule.properties) {
    if ((rule.required || []).some(k => !Object.hasOwn(value, k))) {
      return false;
    }
    for (const k of Object.keys(value)) if (!Object.hasOwn(rule.properties, k)) {
      if (rule.additionalProperties === false) {
        return false;
      }
    } else if (!valid(value[k], rule.properties[k])) {
      return false;
    }
  }
  return true;
}
