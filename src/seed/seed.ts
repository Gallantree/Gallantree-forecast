import { config as loadEnv } from "dotenv";
// Next.js convention: .env.development.local overrides .env.local overrides .env.
// Load in reverse so later files don't clobber earlier ones (override: false).
loadEnv({ path: ".env" });
loadEnv({ path: ".env.local" });
loadEnv({ path: ".env.development.local" });
import { connectToDatabase } from "@/lib/db";
import { Account, Period, Payband } from "@/models";
import { DEFAULT_COA } from "./coa";
import { DEFAULT_PAYBANDS } from "./paybands";
import { FORECAST_HORIZON_MONTHS, periodKey } from "@/constants/periods";
import { toDecimal128 } from "@/utils/money";

// Gallantree fiscal year: July–June (Australian standard).
function fiscalYear(year: number, month: number): number {
  return month >= 7 ? year + 1 : year;
}

async function seedAccounts() {
  // $set on seed-owned fields so re-seed re-asserts the canonical chart;
  // user-added accounts (those not in DEFAULT_COA) are untouched.
  const ops = DEFAULT_COA.map((a) => ({
    updateOne: {
      filter: { code: a.code },
      update: { $set: { name: a.name, type: a.type } },
      upsert: true,
    },
  }));
  const result = await Account.bulkWrite(ops);
  console.log(
    `accounts: upserted ${result.upsertedCount}, modified ${result.modifiedCount}, matched ${result.matchedCount}`,
  );
}

async function seedPeriods(startYear = 2026, startMonth = 7) {
  const ops: Parameters<typeof Period.bulkWrite>[0] = [];
  let y = startYear;
  let m = startMonth;
  for (let i = 0; i < FORECAST_HORIZON_MONTHS; i++) {
    const key = periodKey(y, m);
    ops.push({
      updateOne: {
        filter: { key },
        update: {
          $setOnInsert: {
            key,
            year: y,
            month: m,
            quarter: Math.ceil(m / 3),
            fiscalYear: fiscalYear(y, m),
            index: i,
          },
        },
        upsert: true,
      },
    });
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  const result = await Period.bulkWrite(ops);
  console.log(`periods: upserted ${result.upsertedCount}, matched ${result.matchedCount}`);
}

async function seedPaybands() {
  const ops = DEFAULT_PAYBANDS.map((p) => ({
    updateOne: {
      filter: { band: p.band, tier: p.tier },
      update: {
        $setOnInsert: {
          band: p.band,
          tier: p.tier,
          caseByCase: p.caseByCase,
          ...(p.salaryAnnual !== null ? { salaryAnnual: toDecimal128(p.salaryAnnual) } : {}),
        },
      },
      upsert: true,
    },
  }));
  const result = await Payband.bulkWrite(ops);
  console.log(`paybands: upserted ${result.upsertedCount}, matched ${result.matchedCount}`);
}

async function main() {
  await connectToDatabase();
  await seedAccounts();
  await seedPeriods();
  await seedPaybands();
  console.log("seed complete");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
