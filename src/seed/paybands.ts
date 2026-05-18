// Gallantree payband grid (as of 2025-10-28). Salaries are full-time-equivalent
// annual base. Band 1 / Tier 4 is "Case-by-Case" — no fixed value.
export interface PaybandRow {
  band: number;
  tier: number;
  salaryAnnual: number | null;
  caseByCase: boolean;
}

export const DEFAULT_PAYBANDS: PaybandRow[] = [
  { band: 1, tier: 1, salaryAnnual: 760000, caseByCase: false },
  { band: 1, tier: 2, salaryAnnual: 820800, caseByCase: false },
  { band: 1, tier: 3, salaryAnnual: 886464, caseByCase: false },
  { band: 1, tier: 4, salaryAnnual: null, caseByCase: true },
  { band: 2, tier: 1, salaryAnnual: 600000, caseByCase: false },
  { band: 2, tier: 2, salaryAnnual: 648000, caseByCase: false },
  { band: 2, tier: 3, salaryAnnual: 699840, caseByCase: false },
  { band: 2, tier: 4, salaryAnnual: 755828, caseByCase: false },
  { band: 3, tier: 1, salaryAnnual: 480000, caseByCase: false },
  { band: 3, tier: 2, salaryAnnual: 518400, caseByCase: false },
  { band: 3, tier: 3, salaryAnnual: 559872, caseByCase: false },
  { band: 3, tier: 4, salaryAnnual: 604662, caseByCase: false },
  { band: 4, tier: 1, salaryAnnual: 384000, caseByCase: false },
  { band: 4, tier: 2, salaryAnnual: 414720, caseByCase: false },
  { band: 4, tier: 3, salaryAnnual: 447897, caseByCase: false },
  { band: 4, tier: 4, salaryAnnual: 483729, caseByCase: false },
  { band: 5, tier: 1, salaryAnnual: 307200, caseByCase: false },
  { band: 5, tier: 2, salaryAnnual: 331776, caseByCase: false },
  { band: 5, tier: 3, salaryAnnual: 358317, caseByCase: false },
  { band: 5, tier: 4, salaryAnnual: 386983, caseByCase: false },
  { band: 6, tier: 1, salaryAnnual: 245760, caseByCase: false },
  { band: 6, tier: 2, salaryAnnual: 265420, caseByCase: false },
  { band: 6, tier: 3, salaryAnnual: 286653, caseByCase: false },
  { band: 6, tier: 4, salaryAnnual: 309586, caseByCase: false },
  { band: 7, tier: 1, salaryAnnual: 196608, caseByCase: false },
  { band: 7, tier: 2, salaryAnnual: 212336, caseByCase: false },
  { band: 7, tier: 3, salaryAnnual: 229322, caseByCase: false },
  { band: 7, tier: 4, salaryAnnual: 247668, caseByCase: false },
  { band: 8, tier: 1, salaryAnnual: 157286, caseByCase: false },
  { band: 8, tier: 2, salaryAnnual: 169868, caseByCase: false },
  { band: 8, tier: 3, salaryAnnual: 183457, caseByCase: false },
  { band: 8, tier: 4, salaryAnnual: 198134, caseByCase: false },
  { band: 9, tier: 1, salaryAnnual: 125828, caseByCase: false },
  { band: 9, tier: 2, salaryAnnual: 135894, caseByCase: false },
  { band: 9, tier: 3, salaryAnnual: 146765, caseByCase: false },
  { band: 9, tier: 4, salaryAnnual: 158507, caseByCase: false },
  { band: 10, tier: 1, salaryAnnual: 100662, caseByCase: false },
  { band: 10, tier: 2, salaryAnnual: 108715, caseByCase: false },
  { band: 10, tier: 3, salaryAnnual: 117412, caseByCase: false },
  { band: 10, tier: 4, salaryAnnual: 126805, caseByCase: false },
  { band: 11, tier: 1, salaryAnnual: 80529, caseByCase: false },
  { band: 11, tier: 2, salaryAnnual: 86972, caseByCase: false },
  { band: 11, tier: 3, salaryAnnual: 93929, caseByCase: false },
  { band: 11, tier: 4, salaryAnnual: 101444, caseByCase: false },
];
