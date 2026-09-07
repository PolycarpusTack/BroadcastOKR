/**
 * The read-only SQL envelope (ADR-A2, F2).
 *
 * The old guard stripped comments and string literals with two regexes and
 * then looked for a semicolon. `SELECT '--'; DELETE FROM review_only` beat it:
 * the "line comment" regex ate everything after the `--` inside the literal,
 * the semicolon went with it, and the statement was forwarded unchanged.
 *
 * This is a scanner, not a parser. It walks the text once, knows every way
 * the two supported dialects can hide characters — single-quoted strings with
 * '' escapes, PostgreSQL E'…' strings with backslash escapes, "quoted
 * identifiers", block and line comments, PostgreSQL $tag$…$tag$ dollar quotes,
 * Oracle q'[…]' alternative quotes — and produces the *code* of the statement
 * with all of that replaced by placeholders. Decisions are then made on the
 * code alone:
 *
 *   - exactly one statement (no `;` anywhere in code — a trailing one too,
 *     the message says how to fix it)
 *   - it starts with SELECT
 *   - no word from the deny list appears anywhere in code: DML/DDL/DCL,
 *     transaction control, SELECT INTO, locking clauses, procedure calls,
 *     COPY, session SET
 *
 * What it deliberately does not claim: that a SELECT cannot have side effects
 * (a granted function can). Least-privilege accounts and the driver-side
 * read-only transaction in core.cjs are the other two thirds of the envelope.
 * The SQL that passes is the SQL that is sent — no rewriting.
 */

// Words that never belong inside a read-only SELECT. Statement starters
// (DO, DECLARE, VACUUM, …) are not listed: the SELECT-first and one-statement
// rules already exclude them, and some are plausible identifiers. REPLACE is
// a string function, so it is not here either.
const DENY = new Set([
  'INSERT', 'UPDATE', 'DELETE', 'MERGE', 'UPSERT',
  'DROP', 'ALTER', 'CREATE', 'TRUNCATE',
  'GRANT', 'REVOKE',
  'EXEC', 'EXECUTE', 'CALL',
  'COPY', 'INTO', 'LOCK',
  'COMMIT', 'ROLLBACK', 'SAVEPOINT', 'SET',
]);

// Locking clauses hide behind FOR: `FOR UPDATE`, `FOR SHARE`, `FOR NO KEY UPDATE`, `FOR KEY SHARE`
const LOCKING_AFTER_FOR = new Set(['UPDATE', 'SHARE', 'NO', 'KEY']);

const DOLLAR_TAG = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/;
const ALT_QUOTE_CLOSER = { '[': ']', '{': '}', '(': ')', '<': '>' };
const isIdentChar = (c) => /[A-Za-z0-9_$#]/.test(c);

class SqlEnvelopeError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'SqlEnvelopeError';
    this.code = code;
  }
}

/**
 * Replace every literal, quoted identifier and comment with a placeholder so
 * that only code remains. Throws on an unterminated construct — an open quote
 * is not "probably fine", it is a statement we cannot reason about.
 */
function scanCode(sql) {
  const src = String(sql);
  let out = '';
  let i = 0;
  const n = src.length;
  const prev = () => (out.length ? out[out.length - 1] : ' ');

  while (i < n) {
    const c = src[i];
    const next = src[i + 1];

    // Block comment
    if (c === '/' && next === '*') {
      const end = src.indexOf('*/', i + 2);
      if (end < 0) throw new SqlEnvelopeError('Unterminated block comment', 'unterminated_comment');
      out += ' ';
      i = end + 2;
      continue;
    }
    // Line comment
    if (c === '-' && next === '-') {
      const end = src.indexOf('\n', i + 2);
      out += ' ';
      i = end < 0 ? n : end + 1;
      continue;
    }
    // Quoted identifier
    if (c === '"') {
      let j = i + 1;
      for (;;) {
        const k = src.indexOf('"', j);
        if (k < 0) throw new SqlEnvelopeError('Unterminated quoted identifier', 'unterminated_identifier');
        if (src[k + 1] === '"') { j = k + 2; continue; }
        j = k + 1;
        break;
      }
      out += '"?"';
      i = j;
      continue;
    }
    // Oracle alternative quoting: q'<delim>…<delim>' / nq'…' (only where a literal may start)
    if ((c === 'q' || c === 'Q' || ((c === 'n' || c === 'N') && (next === 'q' || next === 'Q'))) && !isIdentChar(prev())) {
      const qIdx = (c === 'n' || c === 'N') ? i + 1 : i;
      if (src[qIdx + 1] === "'" && qIdx + 2 < n) {
        const open = src[qIdx + 2];
        const close = ALT_QUOTE_CLOSER[open] || open;
        if (!/\s/.test(open)) {
          const end = src.indexOf(close + "'", qIdx + 3);
          if (end < 0) throw new SqlEnvelopeError('Unterminated alternative-quoted string', 'unterminated_string');
          out += "'?'";
          i = end + 2;
          continue;
        }
      }
    }
    // PostgreSQL E'…' string: backslash escapes are live inside
    if ((c === 'e' || c === 'E') && next === "'" && !isIdentChar(prev())) {
      let j = i + 2;
      for (;;) {
        if (j >= n) throw new SqlEnvelopeError('Unterminated string literal', 'unterminated_string');
        const ch = src[j];
        if (ch === '\\') { j += 2; continue; }
        if (ch === "'") {
          if (src[j + 1] === "'") { j += 2; continue; }
          j += 1;
          break;
        }
        j += 1;
      }
      out += "'?'";
      i = j;
      continue;
    }
    // Plain string literal, '' is the only escape
    if (c === "'") {
      let j = i + 1;
      for (;;) {
        const k = src.indexOf("'", j);
        if (k < 0) throw new SqlEnvelopeError('Unterminated string literal', 'unterminated_string');
        if (src[k + 1] === "'") { j = k + 2; continue; }
        j = k + 1;
        break;
      }
      out += "'?'";
      i = j;
      continue;
    }
    // PostgreSQL dollar quoting: $$…$$ or $tag$…$tag$ (a bare $1 bind is not a tag)
    if (c === '$') {
      const m = DOLLAR_TAG.exec(src.slice(i));
      if (m) {
        const tag = m[0];
        const end = src.indexOf(tag, i + tag.length);
        if (end < 0) throw new SqlEnvelopeError('Unterminated dollar-quoted string', 'unterminated_string');
        out += "'?'";
        i = end + tag.length;
        continue;
      }
    }
    out += c;
    i += 1;
  }
  return out;
}

/**
 * Validate one read-only statement. Returns the code view (useful for tests
 * and logs — it never contains literal text); throws SqlEnvelopeError with an
 * actionable message otherwise. Messages keep the two phrases the rest of the
 * bridge and its tests already match on: "Only SELECT queries are allowed" and
 * "Multiple statements are not allowed".
 */
function assertReadOnlySelect(sql) {
  if (typeof sql !== 'string') throw new SqlEnvelopeError('Only SELECT queries are allowed', 'not_select');
  const code = scanCode(sql);

  const semi = code.indexOf(';');
  if (semi >= 0) {
    const trailing = code.slice(semi + 1).trim() === '';
    throw new SqlEnvelopeError(
      trailing
        ? 'Multiple statements are not allowed — remove the trailing semicolon'
        : 'Multiple statements are not allowed — one SELECT per query',
      'multiple_statements',
    );
  }

  const words = code.match(/[A-Za-z_][A-Za-z0-9_$#]*/g) || [];
  if (words.length === 0 || words[0].toUpperCase() !== 'SELECT') {
    throw new SqlEnvelopeError('Only SELECT queries are allowed', 'not_select');
  }

  for (let k = 1; k < words.length; k++) {
    const w = words[k].toUpperCase();
    if (DENY.has(w)) {
      throw new SqlEnvelopeError(
        w === 'INTO'
          ? 'Only SELECT queries are allowed — SELECT INTO writes a table'
          : `Only SELECT queries are allowed — found ${w}`,
        'not_read_only',
      );
    }
    if (w === 'FOR' && k + 1 < words.length && LOCKING_AFTER_FOR.has(words[k + 1].toUpperCase())) {
      throw new SqlEnvelopeError('Only SELECT queries are allowed — locking clauses (FOR UPDATE / FOR SHARE) are not read-only', 'not_read_only');
    }
  }
  return code;
}

module.exports = { assertReadOnlySelect, scanCode, SqlEnvelopeError };
