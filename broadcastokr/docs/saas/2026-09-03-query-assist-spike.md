# Decision spike — AI query assistance for live Key Results

**Status:** input for a decision, not a plan. Written 2026-09-03 after day one on
the R1 rig, when the setup wizard's first-goal step stopped at "now write the SQL".
**Decision owner:** Yannick. **Decision needed:** whether BrOKR (and, by extension,
WHATS'ON Insights) gets a natural-language-to-SELECT assistant, and under what
guard rails — or whether the two deterministic layers shipped today are enough for
the first customers.

## What exists after today (no model in the loop)

1. **Presets with parameters.** Twelve preset KPIs per dialect
   (`bridge/whatson/templates.cjs`) are now offered in the live-KR panel — in the
   goal form and in the wizard — filtered to the connection's dialect. Picking one
   fills SQL, unit, direction, timeframe and target.
2. **Guided builder.** Three dropdowns — table, measure (count / percent where /
   average of), an optional condition and an optional "last N days" date column —
   generate the SELECT deterministically (`src/utils/queryBuilder.ts`). The SQL lands
   in the same editable textarea, so what runs is always visible. Every KR asked for
   so far (all presets, both of today's rig KRs, the one Yannick wanted) has one of
   those three shapes.

Both are safe by construction: identifiers are validated, literals escaped, the
bridge executes SELECT only, and non-owners cannot run anything but a KR's stored
query. Neither sends anything anywhere.

## What the AI layer would be

"Ask in words, get a vetted SELECT." The owner types *percent of products with a
media asset attached* and gets back a query, a preview number, and a one-line
explanation, then confirms or edits.

**What leaves the instance:** the question, the dialect, and schema *metadata* —
table and column names and types from the schema browser, never rows, never
credentials. That is still customer data in the contractual sense (their WHATS'ON
schema shape), which is why this is opt-in per instance and off by default.

**Where it runs:** bridge-side, not in the browser. The bridge holds the API key
(one more `BRIDGE_*` secret, encrypted at rest like connection passwords), scopes the
metadata, and applies the same SELECT-only gate to the model's output before the
owner ever sees it. The browser only ever talks to `/api/kpi/assist`.

**The gate that matters:** the model's SQL is never executed by itself. It is
placed in the textarea, previewed on the owner's click, and only then saved as the
KR's stored query — the same path a hand-written query takes. Non-owners never reach
it.

**Cost shape:** one call per question, a few thousand input tokens (schema metadata
for the tables the question names, not the whole schema), a few hundred output.
Negligible per instance; the price is operational, not financial.

## The risk that decides it

Not injection, not cost: **a query that runs and returns a plausible wrong number.**
A KR is a commitment people are held to for a quarter. A generated SELECT that
counts the wrong table, ignores a status column, or double-counts through a join
produces a confident 87 % that nobody questions until the review. The deterministic
builder cannot make that mistake because it cannot join; the model can, and will.

Mitigations, in order of value:

- Restrict generation to the builder's own vocabulary first (single table, one
  condition, one date column). The model then *fills the dropdowns* rather than
  writing SQL — a much smaller thing to get wrong, and the output is still fully
  inspectable in the builder. Joins come later, if ever.
- Always show the SQL and the preview value before saving. Already the case.
- Explain in one sentence what the query counts, generated from the *spec*, not by
  the model — deterministic explanations cannot drift from the SQL.

## The customer veto

Some customers will not allow schema metadata to leave their network under any
framing. For the on-prem connector-agent deployment (Tier 2) the assist would run
against the cloud instance's copy of the metadata, which the agent does not upload
today — so on that tier the feature does not exist unless the agent starts sending
table and column names. That is a contract change (FF-4 allowlist) and a
conversation, not a flag.

## Shared-component angle with WHATS'ON Insights

Insights is *ask a question, get an answer and a chart* over the same schema. The
piece that is common — question + schema metadata → vetted SELECT, with a
confirm-with-preview gate — is exactly this spike. Building it once, bridge-side,
behind one endpoint, serves both products; the difference is what happens after the
SELECT (Insights renders a chart, BrOKR stores a KR). The Insights prototype's
ChartConfig contract (`../whatson-insights.jsx`) stays the design asset for the
rendering half.

## Recommendation

1. **Ship what landed today and watch.** Presets plus the builder cover every KR
   seen so far. Log the questions owners actually type into the wizard's KR title
   during R1 and the first client demos — that list is the real requirements
   document for the AI layer.
2. **If the list shows shapes the builder cannot express** (joins, time buckets,
   "compared to last month"), build the assist as *model fills the builder* first,
   bridge-side, opt-in per instance, SELECT-only, preview-gated. Estimated effort:
   one week including the guard rails and a golden-question test set.
3. **Do not** let the model write free SQL into a KR until there is a golden set of
   fifty real questions with known-correct answers to score it against.

## The decision

- [ ] Layers 1 + 2 are enough for the first customers; revisit after R1 and the
      first demo.
- [ ] Build the assist now as "model fills the builder", opt-in, bridge-side.
- [ ] Build it as a shared Insights/BrOKR component from the start.
