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

// Calendar-year convention: CY{N} covers Jan {N} → Dec {N}.
// The function name and `fiscalYear` field are kept for back-compat with
// engine/aggregator code that consumes period descriptors, but the value
// returned is the calendar year of the period.
export function fiscalYearOf(year: number, _month: number): number {
  return year;
}

/**
 * Construct an array of period descriptors for a scenario whose Year 1
 * starts in January of `firstCalendarYear`. The shape matches what
 * buildFYGroups + the engine consume; the `fiscalYear` field carries the
 * calendar year of each period.
 */
export function buildScenarioPeriods(
  firstCalendarYear: number,
  months: number = FORECAST_HORIZON_MONTHS,
): Array<{ key: string; fiscalYear: number; index: number }> {
  const out: Array<{ key: string; fiscalYear: number; index: number }> = [];
  let y = firstCalendarYear;
  let m = 1;
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
