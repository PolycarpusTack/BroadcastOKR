# ADR-A2 — The read-only SQL envelope: one scanner, one driver lifecycle, least privilege

Date: 2026-09-07. Status: accepted with A-2-T1/T2 (scanner) and A-2-T3/T4 (driver lifecycle, coded;
real-driver acceptance pending). Finding: F2. Contract: C2.

## Context

`assertSelectOnly` stripped comments and string literals with two regexes and then looked for a
semicolon. `SELECT '--'; DELETE FROM review_only` beat it: the line-comment regex consumed everything
after the `--` inside the literal, the semicolon went with it, and the statement was forwarded to the
driver unchanged. Nothing on the database side would have stopped the DELETE on an account with write
grants.

## Decision

1. **A scanner, not a parser** (`bridge/whatson/sqlEnvelope.cjs`). One pass over the text replaces every
   construct that can hide characters with a placeholder — `'…'` with `''` escapes, PostgreSQL `E'…'`
   with backslash escapes, `"quoted identifiers"`, `/* */` and `--` comments, `$tag$…$tag$` dollar
   quotes, Oracle `q'[…]'` / `nq'…'` alternative quotes — and leaves the statement's *code*. An
   unterminated construct is refused, not guessed. Decisions are made on the code only:
   - no `;` anywhere (a trailing one gets its own message),
   - the first word is `SELECT` (CTEs are not introduced; `WITH` is refused, as before),
   - no word from a short deny list appears: `INSERT UPDATE DELETE MERGE UPSERT DROP ALTER CREATE
     TRUNCATE GRANT REVOKE EXEC EXECUTE CALL COPY INTO LOCK COMMIT ROLLBACK SAVEPOINT SET`, plus the
     locking clauses `FOR UPDATE / SHARE / NO KEY UPDATE / KEY SHARE`.
   Statement starters that are plausible identifiers (`DO`, `DECLARE`, `START`, …) are not listed;
   the first-word and one-statement rules already exclude them. `REPLACE` is a string function.
   The SQL that passes is the SQL that is sent — the validator rewrites nothing. `assertSelectOnly`
   keeps its name and its two historical messages; it now delegates.
2. **The database enforces read-only on the same connection** (`bridge/whatson/core.cjs`).
   PostgreSQL: `BEGIN READ ONLY` → the query → `ROLLBACK` on one client from the pool; a failed or
   cancelled query still rolls back and releases the client *with the error*, so pg destroys it rather
   than hand a dirty session to the next caller. Oracle: `SET TRANSACTION READ ONLY` as the first
   statement, the query, `rollback()`, and `close({ drop: true })` after a failure. `statement_timeout`
   / `callTimeout` (15 s) are unchanged.
3. **One funnel.** `runQuery` is the only path to a driver and it validates first; `runQueryWithTimeout`
   and `executeScalarQuery` (the bridge sync loop, execute-batch, the connector agent) go through it.
   The preview route validates the user's SQL, wraps it, and the wrapped SQL is validated again. The
   wrapper now puts a newline before its closing parenthesis so a trailing `--` comment in the user's
   SQL cannot swallow it.
4. **What is not claimed.** A SELECT can call a function with side effects if the account was granted
   one. Dedicated least-privilege read-only accounts remain required (docs/operations.md); the
   read-only transaction is defence in depth, not a sandbox.

## Evidence

- `bridge/__tests__/sql-envelope.test.cjs`: the repository corpus (both dialects' KPI templates, the
  schema browser and test queries), the builder's shapes, a quoting/comment corpus, 31 negative cases
  including the reported payload on every entry point, and the driver lifecycle observed through fake
  `pg` / `oracledb` drivers injected via `createWhatsonCore({ drivers })`.
- `bridge/__tests__/assertSelectOnly.test.cjs` (the historical guard's 14 cases) still passes.
- **Pending (A-2-T3/T4 acceptance):** the same lifecycle against a real PostgreSQL 17 and Oracle 19c
  with a disposable schema and a deliberately write-capable test account, proving the read-only
  transaction refuses a write that the scanner would never see (a granted function). The R1 rig has
  both databases; run `SELECT` corpus + `SELECT f_write()` there and record it in `r1-findings.md`.

## Containment

`BRIDGE_TIER`/entitlements already disable live KRs per instance; if the envelope itself is suspected,
refuse `POST /api/preview-query`, `/api/kpi/execute-batch` and `/api/kpi/sync-now` at the RBAC table.
Never bypass the validator to keep queries running.
