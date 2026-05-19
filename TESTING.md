# TESTING.md — Gallantree Forecast

## Test infrastructure

| Tool | Purpose |
|------|---------|
| **Vitest 4** | Test runner (unit + integration), via `vitest.config.ts` |
| **mongodb-memory-server** | In-memory MongoDB for integration tests — spins up a real `mongod` binary on the fly |
| **Mongoose 9** | Driven directly inside integration tests via the same models the app uses |
| **Vitest `vi.mock`** | Inline mocks for `next/cache`, `next/navigation`, `@/lib/auth` so server-action modules can be imported in a Node test process |
| **Biome 2** | Formatter + linter, runs in CI (`biome ci`) |
| **ESLint 9** (next-config) | Next.js-specific lint rules, runs in CI (`npm run lint`) |
| **GitHub Actions** | Single `ci.yml` workflow: install → biome → eslint → typecheck → test → build |

---

## Running tests

### All tests
```bash
npm test                  # vitest run — unit + integration (~2s)
npm run test:watch        # vitest watch mode
```

### Subsets
```bash
npm run test:unit         # tests/*.test.ts (engine, money, statements, valuation)
npm run test:integration  # tests/integration/**/*.test.ts (DB + server actions)
```

### Single file / pattern
```bash
npx vitest run tests/integration/programs.actions.test.ts
npx vitest run -t "createProgram"   # by test-name substring
```

### Type-check
```bash
npm run typecheck         # tsc --noEmit
```

### Biome (formatter + linter + import sorter)

**CI runs `biome ci`** — strict, no auto-fix. Always run `biome:fix` locally first.

```bash
npm run biome:fix         # auto-fix formatting + imports + lint where possible
npm run biome             # check only — what CI does
```

Common gotcha: when a test file declares `vi.mock(...)` calls between import groups, Biome will sort imports below the mocks alphabetically. The mocks still hoist correctly at runtime — re-run the test after the fix to confirm.

### Full verification (pre-push)
```bash
npm run biome:fix && npm run lint && npm run typecheck && npm test && npm run build
```

---

## Test structure

```
tests/
  engine.test.ts                     unit — forecast engine + projections
  money.test.ts                      unit — Decimal128 helpers
  statements.test.ts                 unit — three-statement assembly
  valuation.test.ts                  unit — DCF / multiples
  helpers/
    db.ts                            useMemoryMongo() lifecycle helper
    next-mocks.ts                    mockNextCache / mockNextNavigation / mockAuth
    factories.ts                     makeScenario / makeProgram / makeLoan
  integration/
    models.smoke.test.ts             memory-mongo smoke + Decimal128 round-trip
    programs.actions.test.ts         server actions end-to-end
```

Source-co-located tests (`src/**/*.test.ts`) are also picked up by the `include` glob in `vitest.config.ts`.

---

## Writing tests

### Naming
- `describe` for the module / route / function under test.
- Test names describe the **outcome**: `"createProgram persists a valid payload"` not `"handles create"`.
- For latent-bug regression tests: prefix with the action name and the scenario, e.g. `"updateProgram clears notes when notes is empty string"`.

### Unit tests

Plain Vitest. Import the function, drive it, assert. No DB, no mocks needed.

```ts
import { describe, expect, it } from "vitest";
import { computeNimBps } from "@/engine/program";

describe("computeNimBps", () => {
  it("returns assets WAS minus liabilities WAS", () => {
    expect(computeNimBps({ assetsWas: 350, liabsWas: 150 })).toBe(200);
  });

  it("returns negative when the program is underwater", () => {
    expect(computeNimBps({ assetsWas: 100, liabsWas: 150 })).toBe(-50);
  });
});
```

### Integration tests — memory MongoDB

Drop `useMemoryMongo()` into any `describe()` block. It mounts `beforeAll` / `afterEach` / `afterAll` hooks that:
1. Start a real `mongod` via `mongodb-memory-server`
2. Point `MONGODB_URI` at it and reset the `connectToDatabase()` cache
3. Connect Mongoose
4. Clear all collections between tests
5. Tear down at the end

```ts
import { describe, expect, it } from "vitest";
import { CapitalProgram } from "@/models";
import { useMemoryMongo } from "../helpers/db";
import { makeProgram, makeScenario } from "../helpers/factories";

describe("CapitalProgram repository", () => {
  useMemoryMongo();

  it("persists fees + liabilities as sub-docs", async () => {
    const scenario = await makeScenario();
    const program = await makeProgram(scenario._id, {
      fees: [{ name: "Senior", category: "senior_mgmt", basisAmount: "100000", feeBps: 50, accountCode: "4100" }],
    });

    const found = await CapitalProgram.findById(program._id);
    expect(found?.fees).toHaveLength(1);
  });
});
```

### Integration tests — server actions

Server actions live in `_actions.ts` files marked `"use server"`. They import `next/cache` (for `revalidatePath`) and sometimes `next/navigation` and `@/lib/auth`. Those modules can't be imported under Vitest as-is — `vi.mock` them at the top of the test file **before** importing the action.

The `tests/helpers/next-mocks.ts` helpers wrap the `vi.mock(...)` calls so they read cleanly:

```ts
import { describe, expect, it, vi } from "vitest";
import { mockNextCache } from "../helpers/next-mocks";

// Must run BEFORE importing the action module — vi.mock is hoisted, but the
// import order still matters for readability.
mockNextCache();

import { revalidatePath } from "next/cache";
import { CapitalProgram } from "@/models";
import { createProgram } from "@/app/scenarios/[id]/_actions";
import { useMemoryMongo } from "../helpers/db";
import { makeScenario } from "../helpers/factories";

describe("createProgram", () => {
  useMemoryMongo();

  it("persists and revalidates", async () => {
    const scenario = await makeScenario();
    await createProgram(scenario._id.toString(), { /* ...payload... */ });

    expect(await CapitalProgram.countDocuments({})).toBe(1);
    expect(revalidatePath).toHaveBeenCalledWith(`/scenarios/${scenario._id.toString()}`);
  });
});
```

### Factories

`tests/helpers/factories.ts` exports `makeScenario`, `makeProgram`, `makeLoan`. Each:
- Creates a minimal but valid document via the Mongoose model
- Returns the saved doc
- Accepts an `overrides` object — every field is replaceable
- Uses deterministic defaults so failed assertions point at the field you're testing

```ts
const scenario = await makeScenario({ name: "FY28 plan", firstYearLabel: 2028 });
const program = await makeProgram(scenario._id, { type: "CMBS" });
const loan = await makeLoan(scenario._id, program._id, { balance: toDecimal128("12500000") });
```

The Loan factory auto-increments `loanId` to satisfy the unique index without test boilerplate.

### Coverage checklist for server actions

Every action test should cover the matrix the action's guards already imply:

| Scenario | Expected behaviour |
|---|---|
| Invalid `scenarioId` (not an ObjectId) | Silent no-op, no DB write, no `revalidatePath` |
| Invalid `programId` (where applicable) | Silent no-op |
| Malformed payload field (bad regex / enum / negative bps) | That field is dropped or the whole payload is rejected — assert which |
| Happy path | DB state matches payload + `revalidatePath` was called with the right route |
| Cross-scenario isolation | Updating program X in scenario A doesn't touch program X in scenario B |

### Assertions

| Goal | Pattern |
|---|---|
| Count rows | `expect(await Model.countDocuments({...})).toBe(N)` |
| Field equality (money) | `expect(Number(doc.field.toString())).toBe(150_000_000)` — never compare Decimal128 as a string |
| Sub-doc shape | `expect(doc.fees).toHaveLength(1); expect(doc.fees[0].feeBps).toBe(50)` |
| Mock calls | `expect(revalidatePath).toHaveBeenCalledWith(...)` |
| Mock call args | `expect(mockFn.mock.calls[0][1]).toMatchObject({...})` |

---

## Gotchas specific to this repo

### Decimal128 string equality

```ts
// ❌ Will fail — Decimal128 stringifies with trailing precision
expect(found.dealSize.toString()).toBe("150000000");
//                                  actual: "150000000.00000000"

// ✅ Compare numerically
expect(Number(found.dealSize.toString())).toBe(150_000_000);
```

### `vi.mock` ordering

`vi.mock(...)` is hoisted by Vitest's transform, but it only works on the **first** import of the module. If a server action imports `next/cache` deep in its module graph, the mock must be registered before *any* import that transitively pulls `next/cache`. In practice this means `mockNextCache()` (or the inline `vi.mock` call) goes at the very top of the file, above all your other imports.

### `MongoServerError: Updating the path 'X' would create a conflict at 'X'`

A `$set` and `$unset` operation on the same field. Several actions (notably `updateProgram`) have this latent bug when an optional string field is cleared by passing `""`. If your test hits this, you've found one of these — file a spawned-task chip rather than papering over it.

### Connection-cache reuse

`src/lib/db.ts` keeps a global `mongooseCache` so repeated calls don't reconnect. `useMemoryMongo()` resets that cache at suite start — if you write a custom DB helper, make sure you do the same or the second suite in a run will connect to a dead URI.

### Test isolation

Collections are cleared between tests by default. If you want a fixture set built up once and shared across tests in a `describe`, opt out:

```ts
describe("program views with shared fixture", () => {
  useMemoryMongo({ clearBetweenTests: false });
  // ...
});
```

---

## CI integration

`.github/workflows/ci.yml` runs on every push and PR to `main`:

```
install → biome ci → eslint → typecheck → vitest → next build
```

Concurrency cancel-in-progress is on, so a force-push doesn't queue stale runs. The job has dummy `AUTH_SECRET` / `AUTH_URL` / `MONGODB_URI` envs so `next build` doesn't fail at config-eager-load time — real values come from Heroku at runtime.

---

## Heroku / smoke

There's no managed smoke-test suite yet. After a Heroku deploy:
1. Hit `/login` and confirm the page renders.
2. Sign in with a known account; confirm the magic link arrives and you land on `/` authenticated.
3. Open a scenario and confirm at least one tab loads its server data (`/scenarios/[id]`).

If we add a `/api/health` endpoint and a `tests/smoke/` directory later, this section will document them.
