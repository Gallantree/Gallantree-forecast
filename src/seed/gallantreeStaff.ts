// Deterministic staff seed — Gallantree's current team as published on
// gallantree.com.au/team. Each person carries:
//
//   • Phase 1 ("today") band/tier pinned to the closest grid cell and the
//     actual current dollar value carried as a salaryOverride.
//
// Phase 2 (the bump) is derived at seed time from the bumpBands parameter
// passed to seedGallantreeStaff — newBand = phase1.band − bumpBands, same
// tier, salary hydrated from the payband grid. Phase 2 starts Aug 2026 and
// runs open-ended.
//
// Advisors (Cissy Ma, Ivan Ritossa, Steve Toomey) are intentionally
// excluded — they are not payroll staff.
//
// Dan Castro is the only contractor (account 6100, employmentType
// "contractor"); everyone else is payroll on 6000.
//
// Paul Michowicz's and Sharif Sethi's current salaries were NOT supplied
// by Brett — they're inferred from the surrounding "Head of" / Director
// roster and flagged in the rationale.

export interface GallantreeStaffSeed {
  personName: string;
  role: string;
  employmentType?: "full_time" | "part_time" | "contractor";
  // Defaults to "6000" (Salaries & wages); contractors should be "6100".
  accountCode?: string;
  // Phase 1 — closest payband pin + actual current salary.
  currentBand: number;
  currentTier: number;
  currentSalary: number;
  rationale: string;
}

// Where the salary bump kicks in. Phase 1 ends the month before.
export const STAFF_BUMP_START_PERIOD_KEY = "2026-08";
export const STAFF_BUMP_PRECEDING_PERIOD_KEY = "2026-07";
export const STAFF_PHASE_1_START_PERIOD_KEY = "2026-01";

export const GALLANTREE_STAFF_SEED: GallantreeStaffSeed[] = [
  // ── Board / Executive ────────────────────────────────────────────────────
  {
    personName: "Brett Hales",
    role: "Chief Executive Officer & Executive Director",
    currentBand: 8,
    currentTier: 2,
    currentSalary: 176_000,
    rationale: "CEO — current $176k pinned to B8/T2.",
  },
  {
    personName: "Clive Kay",
    role: "M.D. Group General Manager & Executive Director",
    currentBand: 8,
    currentTier: 2,
    currentSalary: 176_000,
    rationale: "Group GM — current $176k pinned to B8/T2.",
  },
  {
    personName: "Richard Green",
    role: "M.D. Head of Institutional Clients & Executive Director",
    currentBand: 5,
    currentTier: 2,
    currentSalary: 330_000,
    rationale: "Senior MD — current $330k pinned to B5/T2 (essentially exact).",
  },

  // ── Heads of / Senior Directors ─────────────────────────────────────────
  {
    personName: "Ben Kilmartin",
    role: "M.D. Institutional Clients & Private Capital",
    currentBand: 6,
    currentTier: 4,
    currentSalary: 310_000,
    rationale: "MD Inst Clients & PC — current $310k pinned to B6/T4 (exact).",
  },
  {
    personName: "Dan Castro",
    role: "Head of Credit",
    employmentType: "contractor",
    accountCode: "6100",
    currentBand: 6,
    currentTier: 4,
    currentSalary: 300_000,
    rationale: "Contractor at $300k/yr pinned to B6/T4 (account 6100).",
  },
  {
    personName: "Paul Michowicz",
    role: "Head of Treasury & Securitisation",
    currentBand: 6,
    currentTier: 3,
    currentSalary: 286_000,
    rationale:
      "INFERRED — set to ~$286k as peer to Dan/Ben. Pinned to B6/T3. Adjust if you have the real number.",
  },
  {
    personName: "David Nichols",
    role: "Group Risk and Compliance",
    currentBand: 6,
    currentTier: 2,
    currentSalary: 272_000,
    rationale: "Group Risk & Compliance — current $272k pinned to B6/T2.",
  },
  {
    personName: "Tony Keating",
    role: "Chief Financial Officer",
    currentBand: 7,
    currentTier: 2,
    currentSalary: 212_000,
    rationale: "CFO — current $212k pinned to B7/T2 (exact).",
  },
  {
    personName: "Sharif Sethi",
    role: "Strategic Operations Director",
    currentBand: 7,
    currentTier: 2,
    currentSalary: 212_000,
    rationale: "INFERRED — set to ~$212k matching Tony Keating's Director-level. Pinned to B7/T2.",
  },

  // ── Director of Engineering ─────────────────────────────────────────────
  {
    personName: "Steve McCormick",
    role: "Director of Engineering & Platform",
    currentBand: 8,
    currentTier: 3,
    currentSalary: 178_000,
    rationale: "Director of Engineering — current ~$178k pinned to B8/T3.",
  },

  // ── Real Estate ED / Associate Director ─────────────────────────────────
  {
    personName: "James Pound",
    role: "Real Estate Executive Director",
    currentBand: 9,
    currentTier: 3,
    currentSalary: 146_000,
    rationale: "Real Estate ED — current $146k pinned to B9/T3 (exact).",
  },
  {
    personName: "Jesse Lee",
    role: "Associate Director",
    currentBand: 9,
    currentTier: 2,
    currentSalary: 132_000,
    rationale: "Associate Director — current $132k pinned to B9/T2.",
  },

  // ── Senior Software Engineers ───────────────────────────────────────────
  {
    personName: "Gavin Shaw",
    role: "Senior Software Engineer",
    currentBand: 9,
    currentTier: 3,
    currentSalary: 150_000,
    rationale: "Senior SWE — current ~$150k pinned to B9/T3.",
  },
  {
    personName: "Andrew McMiddlin",
    role: "Senior Software Engineer",
    currentBand: 9,
    currentTier: 3,
    currentSalary: 150_000,
    rationale: "Senior SWE — current ~$150k pinned to B9/T3.",
  },

  // ── Analysts / Specialists ──────────────────────────────────────────────
  {
    personName: "Harry Scotcher",
    role: "Credit Analyst - CRE",
    currentBand: 9,
    currentTier: 4,
    currentSalary: 154_000,
    rationale: "Credit Analyst (CRE) — current $154k pinned to B9/T4.",
  },
  {
    personName: "Andrew Donovan",
    role: "Financial Analyst",
    currentBand: 10,
    currentTier: 4,
    currentSalary: 124_000,
    rationale: "Financial Analyst — current $124k pinned to B10/T4.",
  },
  {
    personName: "Leisa Gunn",
    role: "Executive Assistant",
    currentBand: 10,
    currentTier: 4,
    currentSalary: 124_000,
    rationale: "Executive Assistant — current $124k pinned to B10/T4.",
  },
];
