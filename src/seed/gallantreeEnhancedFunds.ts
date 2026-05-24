// Deterministic seed for Gallantree's Enhanced Income Funds — two MIT_FUND
// programs that acquire the equity tranches of Gallantree's own CMBS / CRE
// CLO / BSL securitisations. Each fund issues a single unit class targeting
// BBSW + 700 bps and Gallantree earns a 50 bps senior management fee on
// total notes. At seed time the captiveEquityHoldings field is populated
// with every "Equity" tranche from the existing programs in the scenario;
// the user can adjust the selection afterwards via the holdings selector.

export interface EnhancedFundSpec {
  name: string;
  dealSize: number; // AUD principal
  termYears: number;
  startPeriodKey: string;
  notes: string;
}

export const GALLANTREE_ENHANCED_FUNDS: EnhancedFundSpec[] = [
  {
    name: "Gallantree Enhanced Income Fund I",
    dealSize: 200_000_000,
    termYears: 6,
    startPeriodKey: "2026-01",
    notes:
      "MIS — captive vehicle holding the equity tranches of Gallantree's CMBS / CRE CLO / BSL securitisations. Unit class targets BBSW + 700 bps; Gallantree earns 50 bps senior mgmt on notes.",
  },
  {
    name: "Gallantree Enhanced Income Fund II",
    dealSize: 500_000_000,
    termYears: 7,
    startPeriodKey: "2026-01",
    notes:
      "MIS — second-vintage captive equity vehicle. Same economics as Fund I (BBSW + 700 bps unit class, 50 bps senior mgmt) at larger scale and longer tenor.",
  },
];

// Bps the fund targets on its unit class — BBSW + 700.
export const ENHANCED_FUND_UNIT_RETURN_BPS = 700;
// Gallantree's senior management fee on the fund (bps of dealSize / notes).
export const ENHANCED_FUND_MGMT_FEE_BPS = 50;
