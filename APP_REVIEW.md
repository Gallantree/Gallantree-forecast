# Gallantree Forecast — App Review

**Date:** 2026-05-23  
**Branch:** feat/program-ramp-amort-and-issuance-costs  
**Reviewer:** Claude Sonnet 4.6

---

## Contents

1. [User Flow Issues](#1-user-flow-issues)
2. [Security Issues](#2-security-issues)
3. [Missing Functionality](#3-missing-functionality)
4. [Test Coverage Gaps](#4-test-coverage-gaps)
5. [UX & Design Recommendations](#5-ux--design-recommendations)
6. [Architecture Recommendations](#6-architecture-recommendations)
7. [Priority Matrix](#7-priority-matrix)

---

## 1. User Flow Issues

### 1.1 Admin → Main App: No return path
**Severity: High**

When a superadmin navigates to `/admin`, there is no link back to the main scenario workspace (`/`). The admin sidebar only contains three links: Overview, Organisations, Users. A superadmin must manually edit the URL or click the logo (if one is present in the admin layout) to return.

**Fix:** Add a "Back to app" link in the admin sidebar, e.g. a top-level `← Gallantree Forecast` link pointing to `/`.

---

### 1.2 No empty-state handling on scenario tabs
**Severity: Medium**

Several tabs — Loan Book, Capital Programs, OPEX Staffing, Valuation — render charts/tables but show nothing meaningful when no data has been entered. A first-time user opening a blank scenario has no in-context guidance on what to do next.

**Fix:** Each tab should render an empty-state card when its data collection is empty, with a CTA ("Add your first loan", "Add a capital program", etc.) that either opens the relevant input modal or points to the correct tab.

---

### 1.3 No breadcrumb on scenario pages
**Severity: Low**

`/scenarios/[id]` renders 16 tabs but no breadcrumb. The only "back" path is the logo link. If a user is deep in a tab (e.g. Capital Programs → editing an item), there is no path context.

**Fix:** Add a breadcrumb: `Scenarios > [Scenario Name]`. This also helps distinguish which scenario is open when multiple tabs are open in the browser.

---

### 1.4 Admin: no per-row edit on Users or Organisations
**Severity: Medium**

`/admin/users` and `/admin/organisations` list rows from the database but have no visible Edit action per row (only an Add/Create button at the top). Users and organisations can be created but the only update path requires knowing a separate flow.

The server action `updateUser()` and `updateOrganisation()` exist and work — the UI simply doesn't surface them on existing rows.

**Fix:** Add an edit icon/button per row that opens a pre-filled modal using the existing update actions.

---

### 1.5 Control Panel tab contents unclear
**Severity: Low**

The 16th scenario tab is labelled "Control Panel" but its actual function (scenario-level assumptions? global toggles?) is not evident from the route structure alone. If it exposes scenario assumptions (CPI, WACC, opening cash, etc.) it is arguably the most important tab yet it is last in the list.

**Recommendation:** Rename to "Assumptions" or "Settings", move it to position 1 or behind a gear icon, and ensure it has a clear description of what each field does.

---

### 1.6 Admin "Modules" tile — Coming Soon
**Severity: Low**

The admin overview dashboard renders a "Modules" tile with a "Coming soon" label. This is placeholder UI left in production. It creates expectation without substance.

**Fix:** Remove the tile until the feature is defined, or replace with a real metric (e.g. "Scenarios created this month").

---

## 2. Security Issues

### 2.1 No scenario-level access control (CRITICAL)
**Severity: Critical**

Any authenticated user can read and modify **any** scenario in the system. There is no tenant/org isolation: user A from Organisation A can open a scenario that belongs to Organisation B simply by knowing (or guessing) its MongoDB ObjectId.

The middleware only checks "is the user authenticated?" — it does not verify "does this user own or belong to the org that owns this scenario?"

**Affected surfaces:**
- All `/api/scenarios/[id]/*` routes
- All server actions in `src/app/scenarios/[id]/_actions.ts`
- The scenario page itself (`src/app/scenarios/[id]/page.tsx`)

**Fix:** Add a `scenarioId → organisationId` ownership check on every route and action that accepts a `scenarioId`. Reject with 403 if `session.user.organisationId !== scenario.organisationId`. This is the single most important security fix.

---

### 2.2 No audit trail / change log
**Severity: High**

No writes to any model are logged. If data is changed or deleted — intentionally or accidentally — there is no record of who made the change, when, or what the previous value was.

Cascading hard-deletes (`deleteScenario`) are particularly dangerous: a single action permanently removes the scenario plus all its drivers, loans, programs, and headcount with no recovery path.

**Fix (short-term):** Add a `deletedAt` soft-delete field to `Scenario`, `Driver`, `Loan`, `CapitalProgram`, and `Headcount`. Filter `{ deletedAt: null }` on reads. This allows recovery.

**Fix (longer-term):** Introduce an `AuditLog` collection: `{ userId, action, modelName, documentId, before, after, timestamp }`. Write an entry on every create/update/delete in server actions.

---

### 2.3 No rate limiting on API routes or server actions
**Severity: High**

The magic-link endpoint (`/api/auth/email-exists`) and all API routes are unprotected from brute-force or enumeration. An attacker who obtains a valid session can call `/api/scenarios/[id]/export/xlsx` or `/api/scenarios/[id]/valuation` in a tight loop with no consequence.

**Fix:** Apply rate limiting at the middleware level or use a library like `@upstash/ratelimit` with a Redis/KV backend. At minimum, limit the email-check endpoint to 10 req/min per IP.

---

### 2.4 ObjectId enumeration on scenario routes
**Severity: Medium**

All scenario routes accept a MongoDB ObjectId in the URL. MongoDB ObjectIds are not secret — they embed a timestamp and are partially sequential. An authenticated user can iterate through ObjectIds to discover other users' scenarios (see 2.1 above).

**Fix:** This is addressed by fixing 2.1 (ownership checks). As a secondary measure, consider exposing a shorter, opaque `slug` field on Scenario for URLs and keeping the ObjectId internal.

---

### 2.5 Admin role check is only in server actions, not route layout
**Severity: Medium**

`requireSuperadmin()` is called in admin server actions, which is correct. However, the admin page components themselves (`/admin/page.tsx`, `/admin/users/page.tsx`) should also validate the session at the Server Component level so that the HTML is never rendered for unauthorised users — even if the actions can't be triggered.

Check whether `src/app/admin/layout.tsx` performs a session + role check before rendering children. If it relies solely on the actions to reject writes, a non-superadmin user may be able to see the admin UI without being able to act.

**Fix:** In `src/app/admin/layout.tsx`, call `auth()` and redirect to `/` if `session?.user?.userType !== "superadmin"`.

---

### 2.6 No CSRF protection on server actions
**Severity: Low**

Next.js 14+ Server Actions include built-in CSRF protection via the `Origin` header check for same-origin requests. However, if any actions are called directly from an API route rather than through React's form/action mechanism, that protection may not apply.

**Fix:** Audit any server action imported into an API route. Prefer invoking them exclusively through React form actions or `useTransition`.

---

### 2.7 Session does not invalidate on password change / status change
**Severity: Medium**

When an admin changes a user's `status` to `disabled`, that user's existing JWT session remains valid for up to 2 hours (the `maxAge`). A disabled user continues to have full access until their session expires.

**Fix:** In the JWT callback in `src/lib/auth.ts`, re-fetch the user from the database on each token refresh and check `status === "active"`. Reject the token (return `null`) if the user is disabled. This closes the window from 2 hours to ~30 minutes (the `updateAge`).

---

## 3. Missing Functionality

### 3.1 Scenario-level permissions / sharing
Users can only access scenarios if they can access all scenarios. There is no concept of "share this scenario with user X" or "this scenario belongs to organisation Y". This is related to 2.1 but is also a product gap — the admin UI has no way to assign scenarios to organisations.

### 3.2 No scenario duplication from the main list
The home page (`/`) allows branching from a base scenario, but not arbitrary duplication of any scenario. If a user wants to copy a non-base scenario they cannot.

### 3.3 No undo / revision history
All edits are destructive. There is no "undo last change" and no way to compare the current forecast with a previous state.

### 3.4 No notifications or alerts
There is no mechanism to notify users of changes to a shared scenario, upcoming period rollovers, or data quality warnings (e.g. a loan with a maturity date in the past).

### 3.5 Export only covers Excel
The export endpoint generates `.xlsx`. No PDF export of the P&L or overview charts, which are commonly required for board packs.

### 3.6 Loan CSV import has no error feedback
`importLoans()` parses a CSV but there is no indication of which rows failed or why. A large import with one malformed row silently drops that row.

### 3.7 Google OAuth is "optional, environment-dependent"
The Google OAuth provider is conditionally added but there is no fallback UI or error message shown if `GOOGLE_CLIENT_ID` is missing. A user attempting Google sign-in would see a cryptic error.

---

## 4. Test Coverage Gaps

### Current coverage
| Area | Status |
|---|---|
| Engine computation (`engine.test.ts`) | Good — 18KB of unit tests |
| Financial statements (`statements.test.ts`) | Good — 20KB |
| Valuation formulas | Covered |
| Platform licenses | Covered |
| Money utilities | Covered |
| Program growth factors | Covered |
| Admin server actions | **Missing** |
| Root server actions (`createScenario`, `deleteScenario`, `branchFromBase`) | **Missing** |
| Scenario server actions (add/delete driver, staff, loan, program) | Partial (programs only) |
| Auth flow (sign-in, session, JWT callback) | **Missing** |
| API routes | **Missing** |
| Permission/RBAC checks | **Missing** |
| UI components (React Testing Library) | **Missing** |
| End-to-end (Playwright/Cypress) | **Missing** |

### Recommended test additions (by priority)

**P1 — Critical path integration tests**
- `tests/integration/scenarios.actions.test.ts` — `createScenario`, `deleteScenario` (verify cascade), `branchFromBase` (verify deep copy)
- `tests/integration/permission.test.ts` — Verify a user cannot access a scenario belonging to another org (once 2.1 is fixed)
- `tests/integration/admin.actions.test.ts` — `createUser`, `updateUser`, `requireSuperadmin` rejection path

**P2 — API route tests**
- `tests/integration/api.scenarios.test.ts` — GET/POST `/api/scenarios`, 401 on unauthenticated request
- `tests/integration/api.export.test.ts` — Excel export returns valid workbook structure

**P3 — Auth tests**
- `tests/unit/auth.test.ts` — JWT callback enriches token with `userType` and `status`; disabled user token returns `null`

**P4 — Component tests (React Testing Library)**
- Scenario tab navigation renders correct tab on click
- Empty-state cards render when data arrays are empty
- Admin user table renders rows from mock data

**P5 — E2E (Playwright)**
- Full sign-in via magic link (mock SendGrid)
- Create a scenario, add a loan, view P&L tab
- Superadmin can reach `/admin`; non-superadmin gets redirected

---

## 5. UX & Design Recommendations

### 5.1 Tab order on scenario page
The current tab order places financial outputs (P&L, Balance Sheet, Cashflow, Valuation) before "Control Panel" (which holds the assumptions those outputs depend on). A user's natural flow is:

1. Set assumptions (Control Panel / Settings)
2. Enter inputs (Loan Book, Capital Programs, Revenue, OPEX)
3. Review outputs (P&L, Balance Sheet, Cashflow, Valuation)

Reorder tabs to match this flow, or separate inputs/outputs with a visual divider.

### 5.2 Scenario status indicators
The home page lists scenarios but doesn't show at a glance whether a scenario is a "base" or a "branch", how recently it was modified, or whether it has unsaved/draft changes. Add metadata chips: `BASE`, `Branch of: <name>`, `Last edited: X days ago`.

### 5.3 Loading and error states
Many tabs fetch data via Server Components on load, but if a database query fails, users likely see a blank page or an unhandled error. Add `error.tsx` boundaries at the scenario route level and per-tab where practical.

### 5.4 Mobile / responsive
This is a financial modelling tool likely used on desktop. Confirm that the tab bar on `/scenarios/[id]` does not break at narrower viewports (e.g. on a laptop with 100% zoom). If mobile is not supported, add a graceful "this tool is optimised for desktop" message.

### 5.5 Confirmation on destructive actions
`deleteScenario` is irreversible (hard delete + cascade). The UI should present a typed-confirmation dialog ("Type the scenario name to confirm deletion") before calling the action.

---

## 6. Architecture Recommendations

### 6.1 Consolidate inline UI components from admin pages
`/admin/page.tsx`, `/admin/users/page.tsx`, and `/admin/organisations/page.tsx` all define inline `Tile`, `Th`, `Td` components. These should live in `src/components/ui/` and be imported, keeping page files as orchestration-only.

### 6.2 Introduce a service layer for complex business logic
Some server actions are doing too much: validating input, querying the database, computing derived state, and calling `revalidatePath`. Consider extracting a `src/services/` layer for operations that touch multiple models (e.g. `ScenarioService.branch()` which touches Scenario, Driver, Headcount, Loan, CapitalProgram in a transaction).

Using MongoDB transactions for multi-document writes in `branchFromBase` and `deleteScenario` would also prevent partial-write corruption.

### 6.3 Add a `scenarioId` index on all child collections
Query performance on Loan, Driver, Headcount, and CapitalProgram will degrade as data grows if `scenarioId` is not indexed. Add `{ scenarioId: 1 }` compound indexes on these models.

### 6.4 Environment validation at startup
If `SENDGRID_API_KEY`, `AUTH_SECRET`, or `MONGODB_URI` are missing, the app fails at runtime in unexpected ways. Add a startup validation check (e.g. using `zod` to parse `process.env`) that fails fast with a clear error at boot time.

### 6.5 Consider paginating admin user/org tables
`/admin/users` fetches all users from the database. As user count grows this will become slow. Add server-side pagination or cursor-based fetching to the admin list queries.

---

## 7. Priority Matrix

| # | Issue | Severity | Effort | Priority |
|---|---|---|---|---|
| 2.1 | No scenario-level access control | Critical | Medium | **P0** |
| 2.2 | No audit trail / soft delete | High | Medium | **P0** |
| 1.1 | Admin → main app: no return path | High | Low | **P1** |
| 2.7 | Disabled user session still valid | Medium | Low | **P1** |
| 2.5 | Admin route not guarded at layout level | Medium | Low | **P1** |
| 1.4 | No per-row edit in admin tables | Medium | Low | **P1** |
| 2.3 | No rate limiting | High | Medium | **P2** |
| 1.2 | No empty-state handling on tabs | Medium | Medium | **P2** |
| 3.5 | No PDF export | Medium | High | **P2** |
| 4.* | Integration test gaps | High | High | **P2** |
| 5.5 | No confirmation on destructive deletes | Medium | Low | **P2** |
| 3.3 | No undo / revision history | Medium | High | **P3** |
| 3.6 | Loan CSV import no error feedback | Low | Low | **P3** |
| 1.5 | Control Panel tab position/naming | Low | Low | **P3** |
| 6.2 | Service layer for multi-model ops | Medium | High | **P3** |
| 6.3 | Missing `scenarioId` indexes | Medium | Low | **P3** |
| 5.1 | Tab ordering | Low | Low | **P3** |
| 1.6 | "Coming soon" tile in admin | Low | Low | **P4** |

---

*Generated from static analysis of `src/` on 2026-05-23. No runtime testing was performed.*
