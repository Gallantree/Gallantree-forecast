# Gallantree 5-Year Forecast Model — Build Options & Recommendation

**Prepared for:** Brett Hales
**Date:** 17 May 2026
**Status:** Discussion / decision document
**Stack decision:** Node.js + Next.js + MongoDB Atlas (locked in by Brett — existing Mongo account, JS-end-to-end preference)

---

## 1. TL;DR

Replace the Excel forecast with a Next.js web app that you and the exec team use to build driver-based scenarios, compare versions, and (later) reconcile against Xero actuals. Targeting "few weeks of focused work" the realistic day-one deliverable is:

- A **Next.js (App Router) + TypeScript + MongoDB Atlas** app, hosted on **Vercel** (or Heroku if you'd prefer to stay), with **driver-based P&L, OPEX, headcount, balance sheet and cashflow**, and **named scenarios** you can branch and compare.
- Xero integration as a **phase 2** add-on once the engine is working.
- Keep Excel alive as a **read-only export target** for the board pack — it's the format your audience already knows.

The single most important technical commitment in this stack: **all monetary and percentage values must be stored and computed as `Decimal128`, never as a JavaScript `Number`.** Floats and money don't mix. More on this in §7.

---

## 2. Why the Excel model goes stale (and what to design around)

Naming the actual failure modes before picking a stack:

- **Single-user, single-file.** Two people can't safely model at the same time, and "v_FINAL_v3_brett_edit.xlsx" is the audit trail.
- **Drivers and outputs live in the same place.** Touching a formula in P&L can silently break the balance sheet.
- **No first-class scenarios.** You either copy whole tabs (and they drift) or fight INDIRECT/CHOOSE formulas.
- **No actuals overlay.** Excel can't keep itself in sync with Xero without manual paste-special.
- **Hard to share read-only views** with the board without freezing a PDF that's stale the next day.

A web app fixes these by separating **assumptions** (drivers), **calculations** (the model engine), and **outputs** (statements, charts, exports), with scenarios as first-class versioned objects. This framing is stack-agnostic — applies whether you build it in Node, Python, or buy it.

---

## 3. Three options, side-by-side

### Option A — Recommended: Next.js + TypeScript + MongoDB Atlas on Vercel

| Component | Choice | Why |
|---|---|---|
| Framework | **Next.js 15 (App Router)** | One framework for UI + API routes + SSR. Great DX. Pages for assumptions/scenarios/statements, route handlers for the engine. |
| Language | **TypeScript everywhere** | Non-negotiable for a financial model. Types prevent the exact class of bug that destroys trust in numbers (wrong field, wrong sign, wrong period). |
| Database | **MongoDB Atlas** (your account) | Documents map naturally to scenarios (one doc = one set of assumptions). M10 cluster is plenty; M0 free tier works for the prototype. |
| ODM / schemas | **Mongoose** with strict schemas | Validates types, prevents drift, defines indexes. Use `Schema.Types.Decimal128` for every money/percentage field. |
| Runtime validation | **Zod** at API boundaries | Belt-and-braces with Mongoose — validates request/response bodies, generates TypeScript types from schemas. |
| Money math | **`decimal.js`** or **`big.js`** for arithmetic, **`Decimal128`** for storage | JS `Number` is IEEE 754 float — 0.1 + 0.2 = 0.30000000000000004. Unacceptable in P&L. See §7. |
| UI components | **Tailwind + shadcn/ui** | Beautiful out of the box, fully ownable code (not a black-box library). Board-grade visuals with little effort. |
| Charts | **Recharts** (or **Chart.js**) | Both excellent. Recharts is more React-native, Chart.js renders faster on big datasets. |
| Forms / tables | **TanStack Table** + **React Hook Form** | Spreadsheet-like grids and bulletproof form validation. |
| State | **Zustand** or React Context | Scenarios + drivers are mostly server state — keep client state minimal. Use Next's server components where you can. |
| Auth | **NextAuth.js (Auth.js)** with email magic links | Few users, no passwords to manage. Add SSO later if needed. |
| Exports | **`exceljs`** for .xlsx, **`@react-pdf/renderer`** or **Puppeteer** for board-pack PDF | Board still gets a familiar artifact. |
| Background jobs | None initially. Add a queue (e.g. **Inngest** or **BullMQ + Redis**) only when Xero sync arrives. | Don't pay complexity tax early. |
| Hosting | **Vercel** (preferred) or **Heroku** | Vercel is the natural Next.js home, generous free tier, AU-edge available. Heroku still works — just pricier and a less seamless DX for Next. |

**Pros**
- One language and one mental model from browser to database.
- Vercel deploys on every push — staging URL per PR, instant rollback, near-zero ops.
- shadcn/ui + Tailwind ships board-presentable UI fast.
- Realistic to deliver day-one scope (driver P&L + OPEX + headcount + BS/CF + scenarios) in 3–5 focused weeks.

**Cons (and how to mitigate)**
- **Mongo isn't intrinsically a financial-model shape.** Mitigated by modelling scenarios as documents, using Decimal128, and using aggregation pipelines (`$lookup`, `$facet`, `$group`) for variance and scenario diffs. See §4 and §7.
- **TypeScript is stricter than the JS you may know.** Worth it. The compiler will catch real bugs before they hit a board paper.
- **Vercel + Mongo Atlas can mean a US-region round-trip** unless you pin both to a Sydney region. Atlas has Sydney (`ap-southeast-2`); Vercel Edge runs globally but your serverless functions should be pinned to `syd1`.

**Indicative cost / month (small team):**
- Vercel Pro: US$20/user/month (or free tier for a single dev).
- Mongo Atlas M10 (Sydney): ~US$60/month, or M0 free for prototype.
- Domain + email: trivial.
- **Total realistic running cost: under US$100/month.**

---

### Option B — Stay closer to Heroku: Next.js + MongoDB + Heroku

Same stack as Option A, but deployed to Heroku instead of Vercel.

**Pros**
- Single hosting vendor with the rest of your Gallantree infrastructure — simpler ops mental model.
- You already have Heroku accounts, billing, monitoring, and patterns.

**Cons**
- Next.js's full feature set (image optimisation, edge runtime, ISR, instant rollbacks, preview deployments) doesn't shine on Heroku the way it does on Vercel.
- More expensive at equivalent capability (eco/basic dynos sleep; performance dynos are pricier than Vercel Pro).
- You'll wire up your own preview environments instead of getting them free per-PR.

**Pick this if:** consolidating with existing Heroku infra matters more than Next.js DX. Otherwise default to Option A.

---

### Option C — Buy, don't build: SaaS planning platform

Worth a serious look before writing any code.

| Tool | Fit |
|---|---|
| **Causal** (now part of Lucanet) | Best-in-class for driver-based modelling and scenario UX. Web-based, formula-first. Xero connector. |
| **Mosaic** | Strong for SaaS-style metrics + headcount planning; pricier, sales-led. |
| **Cube** | Spreadsheet-native (lives on top of Excel/Sheets) — least change for your team. |
| **Pry Financials** (acquired by Brex) | Cheap, decent three-statement + Xero. |
| **Joiin / Spotlight Reporting / Fathom** | Xero-native reporting + light forecasting, popular in AU. |

**Pros**
- Live in days, not weeks. Xero integration is solved. Audit trail and scenario UX are built.
- Zero hosting / maintenance burden — meaningful when your day job isn't building software.
- AU vendors (Spotlight, Fathom) are well-known to AU accountants and may already be in your auditors' workflow.

**Cons**
- Per-seat pricing escalates. Causal starts around US$250/mo; enterprise tiers climb quickly.
- You're capped at what the vendor models — if your revenue logic is unusual (and Gallantree's likely is, given the credit/treasury work), you may hit walls.
- Less learning value for your team; you don't own the engine.

**Recommendation on Option C:** spend 60 minutes trialling Causal and Fathom before committing to a build. If either covers 80%+ of your use case, building is sentiment, not strategy.

---

## 4. Recommended architecture (Option A, deeper view)

```
┌─────────────────────────────────────────────────────────────┐
│ Browser (Brett, exec, board read-only)                      │
│   • Next.js pages (App Router) — Server Components by       │
│     default, Client Components for grids/forms              │
│   • Tailwind + shadcn/ui, Recharts                          │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTPS
┌──────────────────────────▼──────────────────────────────────┐
│ Next.js API routes / route handlers (Vercel functions)      │
│   ├─ /api/scenarios      (create, branch, compare)          │
│   ├─ /api/drivers        (revenue, OPEX, headcount, capex)  │
│   ├─ /api/statements     (P&L, BS, CF — derived)            │
│   ├─ /api/exports        (xlsx via exceljs, pdf board pack) │
│   └─ /api/xero/*         (phase 2)                          │
│                                                             │
│   Engine: pure TS functions, decimal.js for math,           │
│   never `Number` for money. 100% unit-testable.             │
└──────────────────────────┬──────────────────────────────────┘
                           │ Mongoose
┌──────────────────────────▼──────────────────────────────────┐
│ MongoDB Atlas (Sydney region — ap-southeast-2)              │
│   Collections:                                              │
│   • entities, accounts (chart of accounts), periods         │
│   • scenarios (parentId for branching, status, lockedAt)    │
│   • assumptions (scenarioId, driverId, periodId, value)     │
│   • headcountPlan (role, startDate, endDate, salary,        │
│     onCostPct, mapsToAccountId)                             │
│   • actuals (periodId, accountId, amount) ← Xero feeds      │
│   • auditLog (who changed what, when)                       │
└─────────────────────────────────────────────────────────────┘
```

### Core data model

Five concepts do most of the work:

1. **Chart of accounts** — the line items you forecast against (mirror your Xero COA so reconciliation is mechanical later).
2. **Periods** — monthly grain over 60 months, with helpers for quarter/year roll-ups.
3. **Scenarios** — first-class documents. A scenario has a `parentId` so "Base FY27" can branch into "Aggressive hire plan" without duplicating everything.
4. **Assumptions / drivers** — the inputs (revenue per FUM bps, headcount adds, opex growth %, etc.) keyed by `(scenarioId, driverId, periodId)`. Calculated values are *derived*, never stored, so you can never have a stale total.
5. **Headcount plan** — separate, per-person or per-role documents with start/end dates, salary, on-cost %, and which OPEX line they map to. Headcount cost flows into OPEX automatically.

### Doing scenarios well in MongoDB

This is where Mongo earns its keep if you set it up right:

- A scenario is a document. Branching = clone the parent and store `parentId`. Cheap.
- Compare two scenarios: an **aggregation pipeline** with `$lookup` to pull assumption sets, then `$facet` to compute base/variant deltas in a single query.
- Inheritance (a child scenario overrides only the drivers it changes): store overrides only, resolve at read time via aggregation. Saves storage and makes "what's different about this scenario" trivially queryable.
- Joining actuals (period-keyed) with forecast values (period × scenario keyed): `$lookup` on `periodId` + `accountId`. Index those fields.
- Use **transactions** (Atlas supports them) for any multi-document write — e.g. creating a scenario + its initial assumptions atomically.

### Three-statement mechanics

Standard chain (same in any language):

- **Revenue drivers → P&L revenue**.
- **Headcount + OPEX drivers → P&L expenses**.
- **P&L → retained earnings (BS equity)**.
- **Working capital assumptions (DSO, DPO) → BS receivables/payables**.
- **Capex schedule → BS assets + depreciation back into P&L**.
- **BS movements → indirect cashflow**.

All implemented as **pure TypeScript functions** that take a scenario and return a typed result object. Pure functions = testable. Write Jest/Vitest tests for each. A financial model without tests is the bug.

---

## 5. Phased build plan (~4 focused weeks)

**Week 1 — Foundations**
- Repo (Next.js 15 + TS + Tailwind + shadcn/ui), Mongoose connection, Vercel deploy from `main`.
- Mongo collections + schemas defined. Decimal128 enforced on every money/percentage field.
- COA seeded from your Xero export. Periods seeded for 60 months.
- One end-to-end vertical slice: create a scenario, add one revenue driver, see one P&L line render. Proves the loop works.

**Week 2 — Revenue + OPEX + Headcount engine**
- Driver types implemented: revenue (fee × volume, recurring × growth, one-off), OPEX (fixed, % of revenue, per-FTE), capex schedule.
- Headcount module: role-based, start/end, salary growth, on-cost %, maps to OPEX line.
- Scenario branching working.

**Week 3 — Balance sheet, cashflow, exports**
- Working capital, depreciation, equity roll-forward.
- Cashflow (indirect) derived.
- Excel export via `exceljs` (mirror current model structure so reviewers can sanity-check).
- PDF board-pack export via `@react-pdf/renderer` or Puppeteer.

**Week 4 — Polish, auth, scenario compare**
- NextAuth.js with email magic links; roles (admin, modeller, viewer).
- Scenario compare view (side-by-side, % delta, computed via aggregation pipeline).
- Audit log surfaced in UI.
- **Tests:** golden-file tests where the TypeScript engine reproduces the current Excel model exactly for a baseline scenario. This is the proof you can decommission Excel.

**Phase 2 (later)** — Xero integration
- OAuth 2.0 via the official **`xero-node`** SDK.
- Daily pull of actuals into the `actuals` collection, mapped by COA code.
- Variance reports (forecast vs actual, MTD/QTD/YTD), computed via aggregation pipeline.
- Trigger a refresh on demand from the UI.

**Phase 3 (later still)** — nice-to-haves
- Multi-entity consolidation if Gallantree has subsidiaries.
- Monte Carlo / sensitivity sweeps over key drivers.
- API key access for the board-pack generator.

---

## 6. Xero integration — the right way (Node edition)

When you get to it:

- Use **`xero-node`** (official SDK). OAuth 2.0; Custom Connection if it's internal-only, full OAuth flow if you'd ever multi-tenant.
- **Don't** treat Xero as the source of truth for forecasts — only for **actuals**. Pull the trial balance monthly into the `actuals` collection. Never overwrite forecast data.
- Map Xero account codes → your internal COA via a `mapping` collection editable in the UI (you'll renumber accounts; you don't want to redeploy when that happens).
- Cache the bearer token in Mongo; refresh tokens last 60 days — set a Vercel cron job to refresh weekly so you never expire.
- Audit every sync (timestamp, rows pulled, hash of the response) in `auditLog` for compliance.

Given Gallantree's AFSL context, anything that touches financial data needs a clear audit log; design it in from day one rather than retrofitting.

---

## 7. Risks & things people get wrong

### The Mongo-and-money one (read this twice)

- **JavaScript `Number` is IEEE 754 floating point.** `0.1 + 0.2 === 0.3` is `false`. Multiplying a few hundred line items across 60 months compounds the drift into visible cents of error. Cents in a P&L destroy credibility.
- **Mitigation:**
  - Storage: `Schema.Types.Decimal128` for every money or percentage field in Mongoose.
  - Math: `decimal.js` (or `big.js`) — never `+`, `-`, `*`, `/` on raw `Number` values for money.
  - Boundary: a single utility `toDecimal()` / `fromDecimal()` pair that converts at the API edge. Lint-rule it.
  - Tests: at least one snapshot test that proves a 60-month roll-up matches Excel to the cent.

### The general ones

- **Treating Mongo like a relational store** — i.e. lots of round-tripping to join collections in Node. Use aggregation pipelines (`$lookup`, `$group`, `$facet`) for any multi-collection read. Index `scenarioId`, `periodId`, `accountId`.
- **Storing calculated totals.** Don't. Recompute on read. The moment you cache totals in the DB, drift starts.
- **No tests.** Financial models without tests *are* the bug. Vitest or Jest; golden-file the current Excel for the base scenario.
- **Authentication afterthought.** It's exec data. Auth on day one, even if it's just one admin user. NextAuth + magic links = 30 minutes of setup.
- **Building before you've validated the math.** Spend day one re-deriving one quarter of the current Excel model in a Node script. If you can't reproduce it in TypeScript, the web app won't help.
- **Scope creep into "real-time".** You don't need WebSockets or streaming. Server-rendered React with `revalidate` tags is plenty real-time-feeling and far simpler to operate.
- **Skipping the buy evaluation.** Spend the 60 minutes on Causal/Fathom. Coming back and saying "we evaluated and decided to build" is much stronger than "we never looked".
- **Mongo Atlas in the wrong region.** Pin Atlas to Sydney (`ap-southeast-2`) and pin Vercel functions to `syd1`. Otherwise you'll pay every request in trans-Pacific latency.

---

## 8. Recommendation

1. **Today / this week:** trial Causal and Fathom for 60 minutes each. Disqualify or qualify build-vs-buy.
2. **If building (likely):** go Option A — Next.js + TypeScript + MongoDB Atlas on Vercel. Heroku works as a fallback if consolidation with existing infra matters more than Next.js DX.
3. **Start with a Node script** reproducing one quarter of the current Excel before writing any UI code. That script becomes the test fixture.
4. **Ship phases 1–4 over ~4 focused weeks**, then re-evaluate before committing to the Xero integration.
5. **Keep Excel alive as an export target** for the board pack — don't fight the format your audience knows.

---

## 9. Open questions to lock down before week 1

- How many entities? Just Gallantree, or subsidiaries that need consolidation?
- Monthly grain is right for 5Y, agreed? Or do you want weekly for year 1?
- Who needs write access vs read-only? (drives auth scope)
- Is the current Excel model the authoritative baseline to reproduce, or is there a known correction list?
- Do you want this hosted under a `gallantree.com.au` subdomain? Both Vercel and Heroku handle custom domains; Vercel auto-issues SSL.
- Compliance: any data residency requirement (AU vs US)? Atlas has Sydney; Vercel functions pinned to `syd1` keeps the request path in-country.
- Vercel or Heroku for hosting? Default recommendation is Vercel, but happy to stay on Heroku if it matters for ops simplicity.
