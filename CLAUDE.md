@AGENTS.md

# CLAUDE.md — Gallantree Forecast

Guidance for Claude agents working in this repo. Read this first before touching code.

---

## Project summary

A five-year forecasting platform for Gallantree Financial: capital programs (CRE CLO, CMBS, Warehouse, MIT Fund), CRE loan book modeling, NIM / WAS economics, three-statement projections (P&L, BS, CF), valuation, and an admin console.

**Stack**
- **Next.js 16** (App Router, Server Components, Server Actions). The `@AGENTS.md` reminder above is real — Next 16 has breaking changes vs. older docs.
- **React 19** + **TailwindCSS 4** + **Recharts** (visualizations) + **Sonner** (toasts)
- **Mongoose 9** on MongoDB. `Decimal128` throughout the money columns.
- **Auth.js v5** (next-auth beta) with **MongoDB adapter** + **SendGrid** magic links. JWT session strategy.
- **Vitest** (unit + integration) with **mongodb-memory-server** for DB tests.
- **Biome** (formatter + linter) and **ESLint** (Next rules) — both run in CI.
- **Anthropic SDK** (`claude-sonnet-4-6`) for AI-driven seeding of programs and loans.

---

## Architecture conventions

### Routes & data flow
- `src/app/scenarios/[id]/page.tsx` is the main forecast workspace — it loads everything server-side (scenario, programs, loans, drivers, headcount), computes derived data via `*Data.ts` aggregators, and passes typed props to client tab components.
- **Server actions** live in `_actions.ts` files next to the routes that consume them. Mark them `"use server"`. They:
  - Validate ObjectIds / regex shapes up front and silently no-op on bad input.
  - Call `connectToDatabase()` from `@/lib/db`.
  - Write via Mongoose models.
  - End with `revalidatePath(...)` to invalidate the relevant route's cache.
- **Aggregator pattern**: `*Data.ts` (server-safe, no `"use client"`) builds chart-ready data; `*Tab.tsx` (client) renders. This split keeps the heavy compute on the server and the client bundle small.

### Money & types
- All money fields persist as `Mongoose.Types.Decimal128`. Use `toDecimal128(s: string)` from `@/utils/money` to write; read via `.toString()` then `Number(...)` or `new Decimal(...)` from `decimal.js`.
- **Decimal128 stringifies with trailing-zero precision** (`"150000000.00000000"`). Tests must compare numerically (`Number(x.toString())`) not as strings.

### Fiscal year
- Australian FY: Jul → Jun. `FY{N}` = Jul {N-1} to Jun {N}. Helpers in `@/constants/periods` (`fiscalYearOf`, `buildFYGroups`, `periodKey`).

### Auth boundaries
- **Edge middleware** in `src/middleware.ts` imports only the **edge-safe** `src/lib/auth.config.ts` — never `@/lib/auth` (that would pull Mongoose into the edge bundle and break it).
- The Node-side `src/lib/auth.ts` adds the MongoDB adapter + SendGrid send + signIn/jwt callbacks.
- **Two MongoClient pools**: Mongoose (mongodb@7/bson@7) and the Auth.js adapter (mongodb@6/bson@6) point at the same DB but use separate clients. See `src/lib/mongoClient.ts` — do not "borrow" Mongoose's client for the adapter.
- Session strategy is **JWT** (not database). Auth.js v5 uses `jose` (`SignJWT` / `jwtVerify`) under the hood. `maxAge: 2h`, `updateAge: 30min` — active users get rolled, idle ones get cut.

### Gating
- `authorized()` in `auth.config.ts` is the single source of truth for what's public: `/login`, `/login/*`, `/api/auth/*`. Everything else requires `auth?.user`.
- Middleware matcher excludes Next internals + the Auth.js endpoint itself.
- Client-side `SessionExpiryGuard` (mounted in `src/app/layout.tsx`) pops a modal when an authed tab transitions to unauthenticated mid-use.

---

## Common gotchas

| Gotcha | Why it happens | Workaround |
|---|---|---|
| `Unsupported BSON version` in Auth.js | Mongoose 9 ships mongodb@7/bson@7; the adapter wants mongodb@6/bson@6 | Use the dedicated `authClientPromise` from `src/lib/mongoClient.ts` |
| Edge runtime crypto error in middleware | Importing `@/lib/auth` pulls in Mongoose | Import only `@/lib/auth.config` in the middleware |
| `JWE Invalid` after sign-in | Database session cookie can't be decrypted as JWE | Session strategy must be `"jwt"`; purge stale `sessions` collection |
| Verification error on prod magic links | `AUTH_URL` trailing slash, or `AUTH_TRUST_HOST` unset | Strip trailing slashes; set `AUTH_TRUST_HOST=true` |
| Decimal128 string mismatch in tests | `.toString()` returns `"150000000.00000000"` | Compare numerically: `expect(Number(x.toString())).toBe(...)` |
| `updateOne` "would create a conflict" | Same field appears in both `$set` and `$unset` | Make `$set` conditional too, not just `$unset` |
| Server-action import fails in Vitest | `next/cache` and `next/navigation` are server-only | `vi.mock("next/cache", ...)` at top of test (see `tests/helpers/next-mocks.ts`) |
| ESLint `set-state-in-effect` blocking CI | React 19 rule too strict for state-transition tracking | Already demoted to warn in `eslint.config.mjs` — don't re-promote without thought |

---

## Workflow

### Branching & commits
- Branch off `main`. Naming: `feat/...`, `fix/...`, `chore/...`, `docs/...`, `test/...`.
- Commits are conventional (`feat:`, `fix:`, `chore:`, etc.) with a short subject and a body that explains **why**.
- Co-authorship trailer: `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.
- **Never** push directly to `main`. Always open a PR via `gh pr create`.

### Pre-push checklist
```bash
npm run biome:fix    # auto-fix formatting + import order
npm run lint         # eslint (next rules)
npm run typecheck    # tsc --noEmit
npm test             # vitest run (unit + integration)
npm run build        # next build — final sanity check
```

If any of these fail in CI, the PR is blocked.

### Deploys
- `main` → Heroku via `git push heroku main`. App name: `gallantree-financials`.
- Heroku config vars hold runtime secrets (`AUTH_SECRET`, `SENDGRID_API_KEY`, `MONGODB_URI`, etc.). Never commit them; `.env.example` lists what's needed.

---

## When in doubt

- **Next 16 changed.** Check `node_modules/next/dist/docs/` before writing route handlers, middleware, or anything App-Router-shaped that feels different from what you remember.
- **Read the aggregator first** for any tab. If the data isn't computing right, the bug is almost always in `*Data.ts` not in the chart.
- **Run `npm test`** before declaring a task done. The integration tests are fast (~2s) and catch a lot.
- **Spawn a follow-up task** (via the chip system) for latent bugs you find while doing something else — don't pile fixes into an unrelated PR.

See `TESTING.md` for the full test framework guide.
