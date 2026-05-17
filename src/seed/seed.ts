import "dotenv/config";
import { connectToDatabase } from "@/lib/db";
import { Account, Period } from "@/models";
import { DEFAULT_COA } from "./coa";
import { FORECAST_HORIZON_MONTHS, periodKey } from "@/constants/periods";

// Gallantree fiscal year: July–June (Australian standard).
function fiscalYear(year: number, month: number): number {
  return month >= 7 ? year + 1 : year;
}

async function seedAccounts() {
  const ops = DEFAULT_COA.map((a) => ({
    updateOne: {
      filter: { code: a.code },
      update: { $setOnInsert: a },
      upsert: true,
    },
  }));
  const result = await Account.bulkWrite(ops);
  console.log(`accounts: upserted ${result.upsertedCount}, matched ${result.matchedCount}`);
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

async function main() {
  await connectToDatabase();
  await seedAccounts();
  await seedPeriods();
  console.log("seed complete");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
