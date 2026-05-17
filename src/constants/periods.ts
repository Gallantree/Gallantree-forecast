export const FORECAST_HORIZON_MONTHS = 60;

export function periodKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function generateHorizon(startYear: number, startMonth: number, months = FORECAST_HORIZON_MONTHS): string[] {
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
