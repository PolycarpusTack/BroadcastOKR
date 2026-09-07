/**
 * The one way a numeric route identifier is read (ADR-A1, F1).
 *
 * `req.path` is not decoded, so a middleware that does `Number(path.split('/').pop())`
 * sees `%32` as NaN while the handler's `req.params.id` sees `2` — the two layers
 * were authorising different targets. Every layer now decodes the same way and
 * fails closed: anything that is not a plain non-negative integer after ONE
 * percent-decoding is not an id (double encoding, signs, floats, whitespace,
 * empty segments all return null).
 */
function parseNumericId(segment) {
  if (segment === undefined || segment === null) return null;
  let decoded;
  try {
    decoded = decodeURIComponent(String(segment));
  } catch {
    return null;
  }
  if (!/^\d{1,15}$/.test(decoded)) return null;
  return Number(decoded);
}

module.exports = { parseNumericId };
