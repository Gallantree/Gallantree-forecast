export const FORECAST_HORIZON_MONTHS = 60;

export function periodKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function generateHorizon(
  startYear: number,
  startMonth: number,
  months = FORECAST_HORIZON_MONTHS,
): string[] {
  const keys: string[] = [];
  let y = startYear;
  let m = startMonth;
  for (let i = 0; i < months; i++) {
    keys.push(periodKey(y, m));
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return keys;
}

// Australian fiscal-year convention: FY{N} covers Jul {N-1} → Jun {N}.
// e.g. month 7 of CY 2026 is FY27; month 6 of CY 2027 is FY27.
export function fiscalYearOf(year: number, month: number): number {
  return month >= 7 ? year + 1 : year;
}

/**
 * Construct an array of period descriptors for a scenario whose Year 1
 * starts in July of `firstCalendarYear` (Australian FY convention).
 * The shape matches what buildFYGroups + the engine consume.
 */
export function buildScenarioPeriods(
  firstCalendarYear: number,
  months: number = FORECAST_HORIZON_MONTHS,
): Array<{ key: string; fiscalYear: number; index: number }> {
  const out: Array<{ key: string; fiscalYear: number; index: number }> = [];
  let y = firstCalendarYear;
  let m = 7;
  for (let i = 0; i < months; i++) {
    out.push({
      key: periodKey(y, m),
      fiscalYear: fiscalYearOf(y, m),
      index: i,
    });
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}
