# Query Assist Backlog — "I don't know SQL" — kickoff 2026-09-03

Source: R1 rig, day one. Yannick, running the setup wizard on the cockpit against the
real rig, reached the first-goal step and stopped: the Key Result he wanted needs a
query, the table browser was empty (finding 33, fixed), and writing SQL from a blank
textarea is not something a broadcast-operations owner should have to do.
Mode: **DELIVERY** (`mode.md`). Framework: Backlog Builder v5.2. R6 story family
(product list), slotted next to R6-1 because both are "the owner can do it in the UI".

**Why now:** the wizard's whole promise is *a real number on screen in ten minutes*.
Today that promise holds only for people who can write the SELECT. Three layers were
proposed and accepted (cheapest first): presets with parameters, a deterministic
guided builder, and AI assistance behind an owner switch. This backlog builds the
first two and writes the third up as a decision spike — the AI layer's real risk is a
query that runs and returns a plausible wrong number, and that deserves a decision
with customer input, not a Friday feature.

## Readiness Decision

**PROCEED.** The plumbing exists: presets ship per dialect from
`GET /api/kpi/templates`; the schema browser returns tables and columns with types;
`LiveKRConfigPanel` is the one place both the goal form and the wizard configure a
live KR, so one change lands in both. Clarity 3, feasibility 3, completeness 3 → 9/9.

## Assumptions Ledger

| # | Assumption | Impact | Verified? |
|---|---|---|---|
| 1 | Every KR asked for so far is "count of rows", "percent of rows where X", or "average of a column", optionally within the last N days. | High | (verified) — all presets and both of today's KRs have that shape |
| 2 | The bridge's bind convention (`:start_date`/`:end_date` from `timeframeDays`) works for generated SQL on both dialects. | High | (verified) — `buildBinds` + `convertBinds` in `whatson/core.cjs`; presets already rely on it |
| 3 | Identifier and literal handling in the generator is enough for SELECT-only, owner-only use (the bridge still enforces SELECT-only; non-owners cannot run ad hoc SQL). | Med | (verified by design) — identifiers validated against `^[A-Za-z_][A-Za-z0-9_]*$`, literals quoted and escaped |
| 4 | Column type names from the browser are enough to tell numeric / text / date apart on both dialects. | Med | ASSUMED — QA-2 tests cover `integer`/`numeric`/`text`/`timestamp` (PG) and `NUMBER`/`VARCHAR2`/`DATE` (Oracle) |

## Backlog

Conventions: branch `feature/query-assist`, commit per story, `[type](scope): summary`,
tests first, suites + lint + build green before each commit, merge `--no-ff`.

### EPIC QA — A KR without writing SQL

- **Objective:** an owner reaches a real number in the wizard and the goal form
  without typing SQL: pick a preset, or describe the measure in three dropdowns; the
  generated SQL stays visible and editable.
- **Tracer bullet:** QA-1 — a preset picked in the wizard yields the number.
- **DoD:** presets and the builder in both places; generator unit-tested per dialect;
  RTL tests for the panel; spike document for the AI layer; CLAUDE.md updated.

#### QA-0 — Schema default follows the dialect · **XS**
- Connection form: switching Type to PostgreSQL sets Schema to `psi` when it still
  holds the Oracle default `PSI` (and back). Saved shape unchanged.
- **AC:** unit test on `connectionDraft`; finding 33's papercut closed.

#### QA-1 — Presets in the live-KR panel · **S · tracer**
- `LiveKRConfigPanel` gets `getTemplates?`; a "Start from a preset" select lists the
  presets for the selected connection's dialect; picking one fills sql, unit,
  direction, timeframe and target. Threaded through `GoalFormFields` → `GoalFormKRList`
  → GoalsPage/App, and `WizardBridge.getTemplates` for the wizard.
- **AC:** RTL test: pick a preset → textarea holds its SQL, unit/direction updated.

#### QA-2 — Guided builder · **M**
- `src/utils/queryBuilder.ts`: `buildKRQuery(spec, dialect, schema)` → `{ sql,
  usesTimeframe }`. Measures: count, percent-where, average-of. One optional
  condition (`=`, `≠`, `>`, `<`, is null, is not null). Optional date column → last N
  days via `:start_date`/`:end_date`. Dialect-correct schema case and rounding.
- `QueryBuilder.tsx` inside the panel behind a "Build it" toggle: table (loads),
  measure, column(s) (loads), condition, date column. Generated SQL is written into
  the textarea live and stays editable; switching back to "Write SQL" keeps it.
- **AC:** generator tests per dialect incl. escaping; panel test: build → SQL appears;
  wizard end-to-end on the rig: builder → "Create goal and fetch the number" → value.

#### QA-3 — AI assist decision spike · **S · document only**
- `docs/saas/2026-09-03-query-assist-spike.md`: what would be sent (schema metadata,
  never rows), where it runs (bridge-side call, owner-enabled per instance), the
  confirm-with-preview gate, cost shape, the failure mode that matters, the customer
  veto, and the shared-component angle with WHATS'ON Insights. Ends with a
  recommendation and the decision Yannick has to make.

## Sequencing

```
QA-0 (XS) → QA-1 (S, tracer) → QA-2 (M) → QA-3 (S, doc)
```
