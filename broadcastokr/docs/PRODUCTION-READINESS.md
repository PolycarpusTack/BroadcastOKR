# BroadcastOKR — Production Readiness Report

**Date:** 2026-06-01
**Assessed against:** `main` (post production-readiness phases 1–7 + hardening pass)
**Deployment model:** Internal broadcast-operations OKR tool — Electron desktop app + local read-only bridge service, on a trusted network.

---

## Verdict

**Production-ready for its intended context** (internal/team tool, trusted network). The critical issues found during assessment (auth bypass, broken build) are fixed and verified. Security fundamentals are sound. The remaining items are either deliberate trade-offs of the local-first architecture or hardening for broader exposure — none block an internal rollout.

---

## Verified green (evidence)

| Dimension | Status | Evidence |
|---|---|---|
| Production build | ✅ | `npm run build` exit 0 (`tsc -b && vite build`) |
| Type safety | ✅ | `tsc --noEmit` clean |
| Unit tests | ✅ | 157 vitest tests, 28 files, 0 failing |
| Bridge tests | ✅ | 48 node:test tests, 0 failing |
| E2E tests | ✅ | 3 Playwright specs pass; run in CI |
| Dependency audit | ✅ | `npm audit`: **0 vulnerabilities** |
| Auth enforcement | ✅ | API key required on all data endpoints; verified 401 unauth / 200 with key / `/api/health` exempt |
| SQL injection | ✅ | `assertSelectOnly` (strips comments, blocks stacked statements) on the proxy; all internal queries parameterized (`?` placeholders) |
| Rate limiting | ✅ | Per-IP limit via express-rate-limit, configurable, `/api/health` exempt |
| Secrets hygiene | ✅ | No `.env`, `.db`, or `config.json` committed; `.gitignore` covers them |
| Electron security | ✅ | `contextIsolation: true`, `nodeIntegration: false`, preload bridge, external-link scheme check, dev-only DevTools |
| CI | ✅ | tsc + unit + bridge + real build (`npm run build`) + E2E on every push/PR |
| Bundle | ✅ | Initial chunk 1.21 MB → **67 kB** (20 kB gzip) via route + exceljs code-splitting |
| Docs/ops | ✅ | README, bridge API docs, operations guide, changelog, Dockerfile (all real, not stubs) |
| Resilience | ✅ | Error boundary, retry w/ backoff, connection indicator, global error handlers, localStorage persistence, System Health panel |

## Issues found and fixed during this assessment

1. **Auth bypass (critical)** — auth + logging middleware were mounted *after* the CRUD routers, so every data endpoint was unauthenticated even with `BRIDGE_API_KEY` set. Moved before routes; verified. *(commit 38ee165)*
2. **Broken production build** — `npm run build` failed on 9 `noUnusedLocals` errors that CI never caught (CI ran `tsc --noEmit` on the base config + `vite build` directly, skipping `tsc -b`). Fixed the code and the CI gap. *(45fa9a0)*
3. **Dependency vulns** — exceljs→uuid advisory; overrode to patched uuid 11, audit now clean. *(8f1cf80)*
4. **Large bundle** — code-split routes + exceljs. *(b69fd2f)*
5. **No rate limiting** — added. *(e5cb7d3)*
6. **E2E tested the wrong app** — `reuseExistingServer: true` let Playwright latch onto an unrelated local dev server; specs also assumed path routing (app uses HashRouter). Fixed; wired into CI. *(6b170be)*

## Known gaps & dispositions

**Architecture trade-offs (by design — local-first):**
- **API key is baked into the frontend bundle** (`VITE_BRIDGE_API_KEY`, build-time). Acceptable for a desktop app on a trusted machine; not a real secret against a local user. A blocker only if the web build is ever served to untrusted users.
- **`/api/health` is unauthenticated** and exposes DB size + table count. Minor info disclosure; acceptable internally, gate if public.

**Deferred / backlog (not blockers for internal use):**
- **Offline mutation queue** — when the bridge is down, failed mutations are dropped (`.catch`); the bridge doesn't converge with offline edits on reconnect. localStorage keeps local state intact, so this is server-convergence, not in-app data loss. (Phase 3 item, deferred.)
- **Backups are manual** — `GET /api/sync/backup` downloads the DB; no scheduled job. Documented in the operations guide.
- **Component test coverage ~18%** (9/50) — store/bridge logic (the risk-bearing code) is well covered; UI components mostly have render-smoke tests.

## Recommendation

Ship for internal use. Before any broader/untrusted exposure, revisit: the frontend-embedded API key, `/api/health` gating, and the offline mutation queue.
