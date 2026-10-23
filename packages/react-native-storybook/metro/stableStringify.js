'use strict';

/**
 * Deterministic JSON: object keys are emitted in sorted order at every depth, so
 * two runs that produce equal data produce BYTE-IDENTICAL output regardless of
 * the order Metro happened to enumerate its graph. Arrays keep their order (the
 * caller sorts the arrays it cares about).
 */
function stableStringify(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map(stableStringify).join(',') + ']';
  }
  var keys = Object.keys(value).sort();
  var parts = keys.map(function (key) {
    return JSON.stringify(key) + ':' + stableStringify(value[key]);
  });
  return '{' + parts.join(',') + '}';
}

module.exports = stableStringify;
