// Seed specifications for the Capital Programs "Seed" feature.
// Each export pairs a system prompt (cached prefix) with a tool definition
// (structured-output target) for one type of seed.

import { z } from "zod";
import type { ToolDef } from "./anthropic";

// ── Common helpers ──────────────────────────────────────────────────────────

const periodKey = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "must be YYYY-MM");

const moneyString = z.string().regex(/^-?\d+(\.\d+)?$/, "must be a numeric string");

// ── Program-creation schemas ────────────────────────────────────────────────

const FeeSchema = z.object({
  name: z.string(),
  category: z.enum(["senior_mgmt", "subordinate_mgmt", "servicing", "other"]),
  basisAmount: moneyString,
  feeBps: z.number().int().min(0),
  accountCode: z.string(),
});

const LiabilitySchema = z.object({
  name: z.string(),
  numNotes: z.number().int().min(0),
  returnProfileBps: z.number().int().min(0),
  calculationMethod: z.enum(["monthly", "quarterly", "annually"]),
  rateType: z.enum(["fixed", "variable"]),
  accountCode: z.string().default("6800"),
});

const ProgramSchema = z.object({
  name: z.string(),
  type: z.enum(["CRE_CLO", "CMBS", "MIT_FUND", "WAREHOUSE", "OTHER"]),
  dealSize: moneyString,
  faceValuePerNote: moneyString,
  startPeriodKey: periodKey,
  endPeriodKey: periodKey.optional(),
  notes: z.string().optional(),
  fees: z.array(FeeSchema),
  liabilities: z.array(LiabilitySchema),
});

export type SeedProgram = z.infer<typeof ProgramSchema>;

const ProgramsResultSchema = z.object({
  programs: z.array(ProgramSchema),
});

// JSON-Schema-as-object — kept inline so Claude sees exactly what we'll
// validate against.
const programInputSchema = {
  type: "object",
  properties: {
    programs: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          type: {
            type: "string",
            enum: ["CRE_CLO", "CMBS", "MIT_FUND", "WAREHOUSE", "OTHER"],
          },
          dealSize: { type: "string" },
          faceValuePerNote: { type: "string" },
          startPeriodKey: { type: "string" },
          endPeriodKey: { type: "string" },
          notes: { type: "string" },
          fees: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                category: {
                  type: "string",
                  enum: ["senior_mgmt", "subordinate_mgmt", "servicing", "other"],
                },
                basisAmount: { type: "string" },
                feeBps: { type: "number" },
                accountCode: { type: "string" },
              },
              required: ["name", "category", "basisAmount", "feeBps", "accountCode"],
            },
          },
          liabilities: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                numNotes: { type: "number" },
                returnProfileBps: { type: "number" },
                calculationMethod: {
                  type: "string",
                  enum: ["monthly", "quarterly", "annually"],
                },
                rateType: { type: "string", enum: ["fixed", "variable"] },
                accountCode: { type: "string" },
              },
              required: ["name", "numNotes", "returnProfileBps", "calculationMethod", "rateType"],
            },
          },
        },
        required: [
          "name",
          "type",
          "dealSize",
          "faceValuePerNote",
          "startPeriodKey",
          "fees",
          "liabilities",
        ],
      },
    },
  },
  required: ["programs"],
} as const;

// ── CRE CLO seed ────────────────────────────────────────────────────────────

const CRE_CLO_SYSTEM = `You are a CRE CLO structuring assistant for Gallantree, an Australian non-bank CRE lender. You generate realistic capital program specifications for a financial model.

GENERATE EXACTLY 4 CRE CLO PROGRAMS.

Program 1 — anchor deal (use these EXACT values):
  - name: "Gallantree CRE CLO 2026 FL-1"
  - type: "CRE_CLO"
  - startPeriodKey: "2026-07"
  - endPeriodKey: "2029-07"
  - dealSize: "1161500000"
  - faceValuePerNote: "1000"
  - Fees: Senior management 20bps on $1,161,500,000 (account 4500); Subordinate management 50bps on $1,161,500,000 (account 4510); Servicing 50bps on $1,160,000,000 (account 4520)
  - Tranches (name, numNotes, spread bps): X 1500/400, A 658000/175, A-S 152000/205, B 80000/235, C 64000/295, D 40000/360, E 22000/405, F 38000/535, G 26000/675, Equity 80000/0

Programs 2, 3, 4 — follow-on deals:
  - Names: "Gallantree CRE CLO 2026 FL-2", "Gallantree CRE CLO 2027 FL-1", "Gallantree CRE CLO 2027 FL-2"
  - startPeriodKey 4 months apart: 2026-11, 2027-03, 2027-07
  - endPeriodKey: 3 years after start (e.g. 2029-11)
  - faceValuePerNote: always "1000"
  - dealSize: pick a randomized total between 800,000,000 and 1,200,000,000 for each (different value each time)
  - Same fee structure as Program 1 (Senior 20bps, Sub 50bps, Servicing 50bps; basisAmount = dealSize for senior/sub, dealSize − 1.5m for servicing)
  - Same tranche structure: X, A, A-S, B, C, D, E, F, G, Equity
  - Tranche numNotes: scale proportionally with dealSize so each tranche's
    share matches Program 1.
    Shares: X 0.13%, A 56.65%, A-S 13.09%, B 6.89%, C 5.51%, D 3.44%,
            E 1.89%, F 3.27%, G 2.24%, Equity 6.89%.
    Compute: numNotes = round((share × dealSize) / 1000). Sum must equal
    dealSize / 1000. DO NOT return numNotes = 0 for any tranche.
  - Tranche spreads (pick a randomized integer in each range — vary across the 4 deals):
      X:  380-420
      A:  165-190
      A-S: 200-210
      B:  225-245
      C:  285-305
      D:  350-370
      E:  395-415
      F:  520-550
      G:  660-690
      Equity: 0

For EVERY tranche:
  - calculationMethod: "monthly"
  - rateType: "variable" for all DEBT tranches (X through G); "fixed" for Equity
  - accountCode: "6800"

Return the structured result via the create_capital_programs tool. Do not return prose.`;

export const CRE_CLO_TOOL: ToolDef<{ programs: SeedProgram[] }> = {
  name: "create_capital_programs",
  description:
    "Persist a batch of capital programs (CRE CLOs) with full fee and tranche structure.",
  input_schema: programInputSchema,
  parse: (input) => ProgramsResultSchema.parse(input),
};

export const CRE_CLO_SEED = {
  systemPrompt: CRE_CLO_SYSTEM,
  tool: CRE_CLO_TOOL,
  userMessage:
    "Generate the 4 CRE CLO programs per the specification. Vary the dealSize, numNotes, and tranche spreads as instructed.",
} as const;

// ── CMBS seed ───────────────────────────────────────────────────────────────

const CMBS_SYSTEM = `You are a CMBS structuring assistant for Gallantree, an Australian non-bank CRE lender. You generate realistic capital program specifications.

GENERATE EXACTLY 4 CMBS PROGRAMS plus 1 WAREHOUSE FACILITY (5 total).

──────────────────────────────────────────────────────────────────────────
CMBS Program 1 — anchor deal (use these EXACT values):
  - name: "Gallantree CRE CMBS 2026-1"
  - type: "CMBS"
  - startPeriodKey: "2026-07"
  - endPeriodKey: "2031-07"
  - dealSize: "500000000"
  - faceValuePerNote: "1000"
  - Fees: Senior management 15bps on $500,000,000 (account 4500); Subordinate management 35bps on $500,000,000 (account 4510); Servicing 25bps on $499,500,000 (account 4520)
  - Tranches (name, numNotes, spread bps):
      X       500     / 165
      A       350000  / 125
      A-S     50000   / 150
      B       30000   / 175
      C       20000   / 207
      D       10000   / 250
      Equity  39500   / 0
  - Notes sum to 500,000 — matches dealSize / faceValuePerNote. DO NOT
    deviate from these absolute numNotes values. Do not return 0.

CMBS Programs 2, 3, 4 — follow-on deals:
  - Names: "Gallantree CRE CMBS 2026-2", "Gallantree CRE CMBS 2027-1", "Gallantree CRE CMBS 2027-2"
  - startPeriodKey 6 months apart: 2027-01, 2027-07, 2028-01
  - endPeriodKey: 5 years after start (CMBS tenors are typically longer than CLOs)
  - faceValuePerNote: always "1000"
  - dealSize: pick a randomized total between 400,000,000 and 800,000,000 (different value each deal)
  - Same fee structure as Program 1 (Senior 15bps, Sub 35bps, Servicing 25bps; servicing basis = dealSize − 500,000)
  - Same tranche structure (X, A, A-S, B, C, D, Equity)
  - Tranche numNotes: scale proportionally with dealSize so each tranche's share matches Program 1
    (X 0.10%, A 70.00%, A-S 10.00%, B 6.00%, C 4.00%, D 2.00%, Equity 7.90%).
    Compute: numNotes = round((share × dealSize) / 1000). Sum must equal dealSize / 1000.
    DO NOT return numNotes = 0 for any tranche.
  - Tranche spreads — pick a randomized integer in each band, vary across the 4 deals.
    CMBS pricing is much tighter than CRE CLO because the collateral is stabilised:
      X:   150-180
      A:   120-130
      A-S: 145-155
      B:   170-180
      C:   200-215
      D:   240-260
      Equity: 0

For EVERY CMBS tranche:
  - calculationMethod: "monthly"
  - rateType: "variable" for debt tranches (X, A, A-S, B, C, D); "fixed" for Equity
  - accountCode: "6800"

──────────────────────────────────────────────────────────────────────────
Warehouse facility (1):
  - name: "Gallantree Warehouse Facility 2026"
  - type: "WAREHOUSE"
  - startPeriodKey: "2026-07"
  - endPeriodKey: "2029-07"
  - dealSize: "300000000"
  - faceValuePerNote: "1000"
  - Fees: Servicing 30bps on dealSize (account 4520) — no senior/sub management fees on a warehouse line
  - Tranches: just ONE — name "Facility", numNotes 300000, spread 240 bps (warehouse pricing is wider than CMBS but tighter than CLO mezz), calculationMethod "monthly", rateType "variable", accountCode "6800"

Return the structured result via the create_capital_programs tool. Do not return prose.`;

export const CMBS_SEED = {
  systemPrompt: CMBS_SYSTEM,
  tool: CRE_CLO_TOOL, // same tool, different prompt
  userMessage: "Generate the 4 CMBS programs and 1 Warehouse facility per the specification.",
} as const;

// ── Loan-book seed ──────────────────────────────────────────────────────────

const LoanSchema = z.object({
  loanId: z.string(),
  borrower: z.string(),
  lenderOfRecord: z.string().optional(),
  state: z.enum(["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"]),
  assetClass: z.enum([
    "Office",
    "Industrial",
    "Retail",
    "Multi-Family",
    "Mixed-Use",
    "Hospitality",
    "Healthcare",
    "Self-Storage",
    "Data Centre",
  ]),
  propertyStatus: z.enum(["Stabilised", "Transitional"]),
  capitalProgramId: z.string(),
  originationPeriod: periodKey,
  termMonths: z.number().int().min(6).max(180),
  balance: moneyString,
  lvr: moneyString, // 0-1
  dscr: moneyString,
  internalScore: z.number().int().min(0).max(200),
  internalGrade: z.string(),
  creditSpreadBps: z.number().int().min(0).max(2000),
});

export type SeedLoan = z.infer<typeof LoanSchema>;

const LoansResultSchema = z.object({
  loans: z.array(LoanSchema),
});

const loanInputSchema = {
  type: "object",
  properties: {
    loans: {
      type: "array",
      items: {
        type: "object",
        properties: {
          loanId: { type: "string" },
          borrower: { type: "string" },
          lenderOfRecord: { type: "string" },
          state: {
            type: "string",
            enum: ["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"],
          },
          assetClass: {
            type: "string",
            enum: [
              "Office",
              "Industrial",
              "Retail",
              "Multi-Family",
              "Mixed-Use",
              "Hospitality",
              "Healthcare",
              "Self-Storage",
              "Data Centre",
            ],
          },
          propertyStatus: {
            type: "string",
            enum: ["Stabilised", "Transitional"],
          },
          capitalProgramId: { type: "string" },
          originationPeriod: { type: "string" },
          termMonths: { type: "number" },
          balance: { type: "string" },
          lvr: { type: "string" },
          dscr: { type: "string" },
          internalScore: { type: "number" },
          internalGrade: { type: "string" },
          creditSpreadBps: { type: "number" },
        },
        required: [
          "loanId",
          "borrower",
          "state",
          "assetClass",
          "propertyStatus",
          "capitalProgramId",
          "originationPeriod",
          "termMonths",
          "balance",
          "lvr",
          "dscr",
          "internalScore",
          "internalGrade",
          "creditSpreadBps",
        ],
      },
    },
  },
  required: ["loans"],
} as const;

const LOAN_BOOK_SYSTEM = `You are a CRE loan-origination assistant for Gallantree. You generate realistic individual loans for a synthetic loan book that backs Gallantree's capital programs.

GENERATE EXACTLY 250 LOANS spread across the user-provided list of capital programs.

DISTRIBUTION (by capitalProgramId target):
  - ~60% (150 loans) assigned to CRE CLO programs (round-robin across them)
  - ~25% (62 loans) assigned to CMBS programs
  - ~15% (38 loans) assigned to the Warehouse facility (if present)
If no warehouse program is provided, push that 15% to CRE CLO.

PER-LOAN PROFILE BY PROGRAM TYPE:

CRE CLO loans (transitional / value-add):
  - propertyStatus: "Transitional" (~90%) or "Stabilised" (~10%)
  - creditSpreadBps: randomize 270-370 bps
  - balance: randomize 5,000,000 to 55,000,000 (as a string)
  - termMonths: 24-48
  - lvr: 0.55-0.75 (express as decimal like "0.642")
  - dscr: 1.05-1.40
  - internalScore: 60-120 (B-/B+ range)
  - internalGrade: matches score — A (>165), A- (135-165), B+ (120-135), B (105-120), B- (90-105), C+ (80-90), C (70-80), C- (60-70)

CMBS loans (stabilised income-producing):
  - propertyStatus: "Stabilised" (~95%) or "Transitional" (~5%)
  - creditSpreadBps: randomize 90-270 bps
  - balance: randomize 20,000,000 to 150,000,000
  - termMonths: 60-120
  - lvr: 0.50-0.68
  - dscr: 1.25-1.80
  - internalScore: 105-180 (B to A range)
  - internalGrade: matches score per the table above

Warehouse loans (short-term / pre-securitisation):
  - propertyStatus: "Transitional" (~70%) or "Stabilised" (~30%)
  - creditSpreadBps: randomize 200-350 bps
  - balance: randomize 30,000,000 to 200,000,000
  - termMonths: 12-24
  - lvr: 0.55-0.72
  - dscr: 1.10-1.45
  - internalScore: 70-130
  - internalGrade: matches score

REALISM:
  - loanId format: "SEED-XXXX" with sequential numbers 0001-0250
  - borrower: realistic Australian sponsor / REIT / fund names (e.g. "Harbour REIT", "Westwind Funds Management", "Concord Estates Trust", "Aurora Realty Capital", "Beacon Property Partners"). Use distinct names per loan, but it's fine to repeat sponsors across multiple loans (~20% repeat rate is realistic).
  - lenderOfRecord: leave blank
  - state distribution: NSW ~35%, VIC ~25%, QLD ~20%, WA ~10%, SA ~5%, others ~5%
  - assetClass distribution: Office ~30%, Industrial ~25%, Retail ~15%, Multi-Family ~10%, Mixed-Use ~10%, others ~10%
  - originationPeriod: spread across the first 12 months ("2026-07" through "2027-06")

Return the structured result via the create_loans tool. Do not return prose. Return exactly 250 loans.`;

export const LOAN_BOOK_TOOL: ToolDef<{ loans: SeedLoan[] }> = {
  name: "create_loans",
  description: "Persist a batch of synthetic loans assigned to existing capital programs.",
  input_schema: loanInputSchema,
  parse: (input) => LoansResultSchema.parse(input),
};

export interface ProgramRefForSeed {
  id: string;
  name: string;
  type: "CRE_CLO" | "CMBS" | "MIT_FUND" | "WAREHOUSE" | "OTHER";
}

export function buildLoanBookUserMessage(programs: ProgramRefForSeed[]): string {
  const lines = programs.map((p) => `  - id="${p.id}", name="${p.name}", type=${p.type}`);
  return `Available capital programs (assign loans by their id):\n${lines.join("\n")}\n\nGenerate exactly 250 loans per the specification.`;
}

export const LOAN_BOOK_SEED = {
  systemPrompt: LOAN_BOOK_SYSTEM,
  tool: LOAN_BOOK_TOOL,
  buildUserMessage: buildLoanBookUserMessage,
} as const;

// ── Per-FY loan seeding (parameterized) ─────────────────────────────────────
// A lean variant: Claude generates ~15 narrative + key-numeric fields per
// loan, and the server fills in derived financial fields (propertyValue, NOI,
// NCF, ICR, WALE, allInBps/Pct, annualInterest, ratings) deterministically.
// One AI call per FY; per-FY count, style preset, target program are all
// parameterized via the user message so the system prompt stays cache-stable.

export type LoanStyle = "CRE_CLO" | "CMBS";

const FyLoanRowSchema = z.object({
  loanId: z.string(),
  borrower: z.string(),
  state: z.enum(["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"]),
  postcode: z.string().regex(/^\d{4}$/, "must be a 4-digit postcode"),
  location: z.string(),
  assetClass: z.enum([
    "Office",
    "Industrial",
    "Retail",
    "Multi-Family",
    "Mixed-Use",
    "Hospitality",
    "Healthcare",
    "Self-Storage",
    "Data Centre",
  ]),
  propertyStatus: z.enum(["Stabilised", "Transitional"]),
  originationPeriod: periodKey,
  termMonths: z.number().int().min(6).max(180),
  balance: moneyString,
  lvr: moneyString,
  dscr: moneyString,
  creditSpreadBps: z.number().int().min(0).max(2000),
  internalScore: z.number().int().min(0).max(200),
  internalGrade: z.string(),
});

export type FySeedLoanRow = z.infer<typeof FyLoanRowSchema>;

const FyLoansResultSchema = z.object({ loans: z.array(FyLoanRowSchema) });

const fyLoansInputSchema = {
  type: "object",
  properties: {
    loans: {
      type: "array",
      items: {
        type: "object",
        properties: {
          loanId: { type: "string" },
          borrower: { type: "string" },
          state: {
            type: "string",
            enum: ["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"],
          },
          postcode: { type: "string" },
          location: { type: "string" },
          assetClass: {
            type: "string",
            enum: [
              "Office",
              "Industrial",
              "Retail",
              "Multi-Family",
              "Mixed-Use",
              "Hospitality",
              "Healthcare",
              "Self-Storage",
              "Data Centre",
            ],
          },
          propertyStatus: {
            type: "string",
            enum: ["Stabilised", "Transitional"],
          },
          originationPeriod: { type: "string" },
          termMonths: { type: "number" },
          balance: { type: "string" },
          lvr: { type: "string" },
          dscr: { type: "string" },
          creditSpreadBps: { type: "number" },
          internalScore: { type: "number" },
          internalGrade: { type: "string" },
        },
        required: [
          "loanId",
          "borrower",
          "state",
          "postcode",
          "location",
          "assetClass",
          "propertyStatus",
          "originationPeriod",
          "termMonths",
          "balance",
          "lvr",
          "dscr",
          "creditSpreadBps",
          "internalScore",
          "internalGrade",
        ],
      },
    },
  },
  required: ["loans"],
} as const;

const FY_LOANS_SYSTEM = `You are a CRE loan-origination assistant for Gallantree, an Australian non-bank CRE lender. You generate realistic individual loans for a synthetic loan book.

You receive parameters in the user message: a target fiscal year, a count, a style preset (CRE_CLO or CMBS), a target capital program name, and the list of valid origination period keys for that FY.

PER-LOAN PROFILE — STYLE: CRE_CLO (transitional / value-add deals)
  - propertyStatus: ~85% "Transitional", ~15% "Stabilised"
  - creditSpreadBps: randomize integer 270-370
  - balance: randomize 5,000,000 to 55,000,000 (string, no decimals required)
  - termMonths: 24-48 (integer)
  - lvr: 0.55-0.75 (decimal string with 3-4 dp e.g. "0.642")
  - dscr: 1.05-1.40 (decimal string with 2 dp e.g. "1.18")
  - internalScore: integer 60-120

PER-LOAN PROFILE — STYLE: CMBS (stabilised income-producing)
  - propertyStatus: ~90% "Stabilised", ~10% "Transitional"
  - creditSpreadBps: randomize integer 90-270
  - balance: randomize 20,000,000 to 150,000,000
  - termMonths: 60-120
  - lvr: 0.50-0.68
  - dscr: 1.25-1.80
  - internalScore: integer 105-180

INTERNAL GRADE (derive from internalScore for both styles, Gallantree's 15-tier scale):
  ≥195 A+ · ≥180 A · ≥165 A · ≥150 A- · ≥135 A- · ≥120 B+ · ≥105 B · ≥90 B- · ≥80 C+ · ≥70 C · ≥60 C- · ≥55 D+ · ≥50 D · ≥45 D- · ≥40 E+ · ≥30 E · else E-

REALISM RULES (apply to every loan):
  - loanId: format "SEED-{FY2}-{####}" with FY2 = last two digits of the fiscal year and #### = 4-digit zero-padded sequential within this FY (0001, 0002, …)
  - borrower: realistic Australian sponsor / REIT / trust / fund-manager names (e.g. "Harbour REIT", "Westwind Funds Management", "Concord Estates Trust", "Aurora Realty Capital", "Beacon Property Partners", "Drayton Investments Group", "Ironbark Estates", "Summit Trust", "Parkside Capital", "Riverview Partners", "Northgate Property Trust", "Highland Capital", "Cardinal Estates"). Distinct names per loan but ~20% repeat-sponsor rate is realistic — same sponsor can hold multiple loans.
  - state distribution: NSW ~35%, VIC ~25%, QLD ~20%, WA ~10%, SA ~5%, TAS/ACT/NT ~5%
  - postcode: 4-digit Australian postcode that matches the state (NSW 2xxx, VIC 3xxx, QLD 4xxx, WA 6xxx, SA 5xxx, TAS 7xxx, ACT 26xx, NT 08xx)
  - location: a real suburb in that state (e.g. "Surry Hills, NSW", "Richmond, VIC", "Fortitude Valley, QLD")
  - assetClass distribution: Office ~30%, Industrial ~25%, Retail ~15%, Multi-Family ~10%, Mixed-Use ~10%, Hospitality/Healthcare/Self-Storage/Data Centre ~10% combined
  - originationPeriod: MUST be one of the period keys listed in the user message — spread loans roughly uniformly across those months

Return all loans via the generate_fy_loans tool in a single call. Return EXACTLY the requested count. Do not return prose.`;

export const FY_LOANS_TOOL: ToolDef<{ loans: FySeedLoanRow[] }> = {
  name: "generate_fy_loans",
  description:
    "Generate a batch of realistic CRE loans for a single fiscal year and assign them to one capital program.",
  input_schema: fyLoansInputSchema,
  parse: (input) => FyLoansResultSchema.parse(input),
};

/**
 * Per-program credit-risk dial on a 1-5 scale.
 * 1 = lowest risk (tighter underwrites, lower LVR, higher DSCR, narrower spread, better grade)
 * 5 = highest risk (looser underwrites, higher LVR, lower DSCR, wider spread, weaker grade)
 * 3 = neutral (use the style band as-is — no shift)
 */
export type RiskLevel = 1 | 2 | 3 | 4 | 5;

// Risk-level qualitative hint plus a band-shift direction. The prompt cuts
// the style's randomization band roughly into thirds and biases the loan
// distribution toward one of them. Asymmetric risk lives in real CRE
// portfolios, so we just let the model interpret these directives within
// each loan's randomization rather than constraining numerically.
const RISK_LABEL: Record<RiskLevel, string> = {
  1: "VERY LOW risk — A-grade collateral, conservative sponsors, prime metro locations",
  2: "LOW risk — strong sponsors and stabilised assets, mild concentration",
  3: "MEDIUM risk — center of the style band, balanced mix",
  4: "HIGH risk — transitional / value-add bias, weaker sponsors allowed, secondary locations",
  5: "VERY HIGH risk — distressed / re-positioning bias, sub-prime sponsors, tertiary locations",
};

const RISK_BAND_DIRECTIVE: Record<RiskLevel, string> = {
  1: "Skew underwriting metrics to the SAFE end of the style band: LVR in the LOWER 30% of the range, DSCR in the UPPER 30%, creditSpreadBps in the LOWER 25% of the range, internalScore in the UPPER half of the range. assetClass mix biased to Office / Industrial / Multi-Family. propertyStatus 95%+ Stabilised even on CRE_CLO style.",
  2: "Skew metrics modestly safer than mid: LVR in the LOWER 40%, DSCR in the UPPER 40%, creditSpreadBps in the LOWER 40%, internalScore biased upward. Mostly Stabilised even on CRE_CLO style (~70% / 30%).",
  3: "Use the full style band as documented — no shift. Standard mix.",
  4: "Skew metrics modestly riskier than mid: LVR in the UPPER 40% of the range, DSCR in the LOWER 40%, creditSpreadBps in the UPPER 40%, internalScore biased downward. Heavier Transitional mix even on CMBS style (~30% / 70%). assetClass mix tilts to Retail / Hospitality / Mixed-Use.",
  5: "Skew metrics to the RISKY end: LVR in the UPPER 30%, DSCR in the LOWER 30%, creditSpreadBps in the UPPER 25%, internalScore in the LOWER half. assetClass tilt to Retail / Hospitality / Self-Storage. propertyStatus 95%+ Transitional even on CMBS style. Sponsor names should sound like emerging / opportunistic capital rather than blue-chip REITs.",
};

export function buildFyLoansUserMessage(opts: {
  fy: number;
  count: number;
  style: LoanStyle;
  programName: string;
  monthKeys: string[];
  riskLevel?: RiskLevel;
}): string {
  const risk = opts.riskLevel ?? 3;
  return [
    `Generate exactly ${opts.count} loans.`,
    `Fiscal year: FY${String(opts.fy).slice(-2)} (i.e. ${opts.monthKeys[0]} through ${opts.monthKeys[opts.monthKeys.length - 1]})`,
    `Style preset: ${opts.style}`,
    `Capital program (informational, code will assign): "${opts.programName}"`,
    `Risk profile: ${risk}/5 — ${RISK_LABEL[risk]}`,
    `Risk band directive: ${RISK_BAND_DIRECTIVE[risk]}`,
    `Valid originationPeriod values (pick one per loan, spread across all 12): ${opts.monthKeys.join(", ")}`,
    `loanId prefix: SEED-${String(opts.fy).slice(-2)}-####`,
  ].join("\n");
}

export const FY_LOANS_SEED = {
  systemPrompt: FY_LOANS_SYSTEM,
  tool: FY_LOANS_TOOL,
  buildUserMessage: buildFyLoansUserMessage,
} as const;
