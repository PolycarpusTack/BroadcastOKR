# OKR ideas from the archived DashForge OKR layer — intake 2026-10-05

**Status: candidates, not a backlog.** Run them through Backlog Builder (v5.2) at the next
backlog refinement. Until then this is mention-not-make, in the same sense as the "Deliberately
out of scope" list in `hardening-backlog-2026-08-31.md`.

**Origin.** `C:\Projects\Dashboard` (DashForge) gained an OKR layer in about 120 AI-generated
commits on 2026-02-27 and 2026-03-09. A comparison on 2026-10-05 found that layer duplicates
BrOKR at lower quality on every shared feature: goals, live KRs, check-ins, RBAC, tenancy, audit,
reporting. The repo is archived at `C:\Projects\_archive\superseded\Dashboard`; its full history
is on `github.com/PolycarpusTack/Dashforge`, branch `archive/okr-layer`.

**Port ideas, not code.** That code is partly broken. For example, the Postgres adapter is
missing 56 methods, and a `demo`/`demo1234` user is seeded in every environment. Rewrite to BrOKR
conventions: bridge `.cjs` routes, SQLite migrations, server-side RBAC (`middleware/rbac.cjs`),
tenant isolation, and the audit log.

## Candidates (priority order)

### 1. Goal alignment / parent goals — **highest value**
- **Gap:** BrOKR goals have no parent field, so team goals can't roll up into client or org
  goals, and there is no alignment or strategy view.
- **Reference:** `web/modules/strategy-map/routes.js`, `web/src/pages/AlignmentTree.jsx`,
  `StrategyMapPage.jsx` (archived repo). Note that Dashboard's strategy map needs `dagre`, which
  was dropped from its `package.json`, so it never worked as committed.
- **Questions to settle:**
  - Can alignment cross tenants? Probably not; the cockpit fleet board covers cross-tenant views.
  - Does progress roll up automatically, or is the link informational only?
  - How do archived periods behave?

### 2. Threshold alerts on KRs / KPIs
- **Gap:** live KRs sync, but nothing alerts when a value crosses a threshold or stalls.
- **Fit:** `bridge/liveSync.cjs` already evaluates live KRs on a loop, and monitoring mode exists.
- **Reference:** `web/modules/alerts/service.js`, which sends nodemailer threshold alerts.
- **Questions:** which delivery channel (in-app only first? email? Teams webhook?); how to
  dampen alerts so a flapping metric doesn't spam; per-KR vs per-goal rules.

### 3. In-app notifications
- Unread count and mark-as-read. This is a prerequisite for delivering #2 and #4 in-app.
- **Reference:** `web/modules/notifications`.

### 4. Comments with @mentions on goals / KRs
- **Reference:** `web/modules/comments`.
- **Question:** comment visibility per role, and whether comments enter the audit trail.

### 5. Periodic OKR reviews / retrospectives
- A structured end-of-period review per goal: score, what went well, what to change. It links
  into the existing period archive.
- **Reference:** `web/modules/reviews`, `web/src/pages/ReviewsPage.jsx`.

### Low priority
- **Initiatives** linked to KRs (`web/modules/initiatives`).
- **Jira link** (`web/modules/jira`).
- **Free-form report builder** (`ReportBuilderPage.jsx`). BrOKR's three report views cover the
  main need.

## Not taken over
- **DashForge core (any file → chart).** It isn't a BrOKR concern: KRs are single SQL numbers.
  The chart/widget components are listed as a possible renderer behind the ChartConfig /
  ChartRenderer contract in CLAUDE.md "Next steps" #4. The salvage list is in the archived repo's
  `_ARCHIVED.md`.
- **The global check-in feed** (`CheckInFeed.jsx`). Small, so revisit only if users ask for it.
