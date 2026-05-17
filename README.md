# Gallantree Forecast

Driver-based 5-year financial model — Next.js + TypeScript + MongoDB Atlas.

Replaces the Excel forecast with a web app for building scenarios, comparing
versions, and (phase 2) reconciling against Xero actuals. Full design in
[`docs/Gallantree_Forecast_Model_Options.md`](docs/Gallantree_Forecast_Model_Options.md).

## Stack

- Next.js 16 (App Router) + React 19 + TypeScript
- Tailwind v4
- MongoDB Atlas (Sydney, `ap-southeast-2`) via Mongoose — `Decimal128` for all money/percentage fields
- Zod for runtime validation
- `decimal.js` for in-process money math (never raw `Number`)
- Vitest for unit/golden-file tests
- Vercel for hosting (functions pinned to `syd1`)

## Getting started

```bash
cp .env.example .env.local
# fill in MONGODB_URI

npm install
npm run dev          # http://localhost:3000
npm test             # vitest run
npm run typecheck    # tsc --noEmit
```

## Layout

```
src/
  app/             Next.js routes (App Router)
  lib/             db connection, shared infra
  models/          Mongoose models (Decimal128 for money/percentage)
  schemas/         Zod schemas — single source of truth for API I/O
  validators/      reusable Zod validator helpers
  utils/           money math, helpers
  constants/       periods, enums, magic-value-free constants
  components/      React components
tests/             vitest specs (incl. golden-file vs Excel baseline)
docs/              spec + design notes
```

## Non-negotiables

1. **Never use `Number` for money or percentages.** Storage = `Schema.Types.Decimal128`,
   math = `decimal.js` via `src/utils/money.ts`. Convert at the API boundary only.
2. **Don't store calculated totals.** Recompute on read; aggregation pipelines for
   multi-collection queries.
3. **Tests are non-optional.** A financial model without tests is the bug. Golden-file
   the current Excel baseline before decommissioning it.
4. **Pin regions.** Atlas in Sydney, Vercel functions in `syd1`.

## Phases

| Phase | Scope |
|-------|-------|
| Week 1 | Foundations: schemas, COA seed, periods, one driver → P&L vertical slice |
| Week 2 | Revenue + OPEX + headcount engine, scenario branching |
| Week 3 | Balance sheet, cashflow, xlsx + PDF exports |
| Week 4 | Auth (magic links), scenario compare, audit log, golden-file tests |
| Phase 2 | Xero actuals via `xero-node`, variance reports |
