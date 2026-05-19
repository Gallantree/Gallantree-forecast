import ExcelJS from "exceljs";
import { Types } from "mongoose";
import { toDecimal128 } from "@/utils/money";

export interface ParsedLoan {
  scenarioId: Types.ObjectId;
  loanId: string;
  borrower?: string;
  lenderOfRecord?: string;
  state?: string;
  postcode?: string;
  assetClass?: string;
  propertyStatus?: string;
  location?: string;
  originationDate: Date;
  maturityDate: Date;
  termMonths: number;
  balance: Types.Decimal128;
  propertyValue?: Types.Decimal128;
  lvr?: Types.Decimal128;
  noi?: Types.Decimal128;
  ncf?: Types.Decimal128;
  icr?: Types.Decimal128;
  dscr?: Types.Decimal128;
  wale?: Types.Decimal128;
  internalScore?: number;
  internalGrade?: string;
  fitchIndicative?: string;
  moodysIndicative?: string;
  binding?: string;
  creditSpreadBps?: number;
  marginBps?: number;
  bbsw1mBps?: number;
  allInBps?: number;
  allInPct?: Types.Decimal128;
  annualInterest?: Types.Decimal128;
}

const HEADER_ALIASES: Record<string, string> = {
  "Loan ID": "loanId",
  Borrower: "borrower",
  "Lender of Record": "lenderOfRecord",
  State: "state",
  Postcode: "postcode",
  "Asset Class": "assetClass",
  "Property Status": "propertyStatus",
  Location: "location",
  "Origination Date": "originationDate",
  "Maturity Date": "maturityDate",
  "Term (months)": "termMonths",
  "Loan Balance": "balance",
  "Property Value": "propertyValue",
  LVR: "lvr",
  NOI: "noi",
  NCF: "ncf",
  ICR: "icr",
  DSCR: "dscr",
  WALE: "wale",
  "Internal Score": "internalScore",
  "Internal Grade": "internalGrade",
  "Fitch Indicative": "fitchIndicative",
  "Moody's Indicative": "moodysIndicative",
  Binding: "binding",
  "Credit Spread": "creditSpreadBps",
  "Margin / BBSW": "marginBps",
  "BBSW 1M": "bbsw1mBps",
  "All-In (bps)": "allInBps",
  "All-In (%)": "allInPct",
  "Annual Interest": "annualInterest",
};

function asString(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  const s = String(v).trim();
  return s.length ? s : undefined;
}

function asNumber(v: unknown): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function asDecimal(v: unknown): Types.Decimal128 | undefined {
  const n = asNumber(v);
  return n === undefined ? undefined : toDecimal128(n);
}

function asDate(v: unknown): Date | undefined {
  if (v instanceof Date) return v;
  if (typeof v === "string" || typeof v === "number") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? undefined : d;
  }
  return undefined;
}

export async function parseLoanTape(
  buffer: ArrayBuffer | Buffer,
  scenarioId: Types.ObjectId,
): Promise<ParsedLoan[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as ArrayBuffer);

  const ws = wb.getWorksheet("Loan Tape") ?? wb.worksheets[0];
  if (!ws) throw new Error("No worksheet found in workbook");

  // Find header row: first row that has 'Loan ID' in any cell.
  let headerRowIdx = -1;
  let headers: string[] = [];
  ws.eachRow({ includeEmpty: false }, (row, idx) => {
    if (headerRowIdx !== -1) return;
    const values = (row.values as unknown[]).slice(1).map((v) => asString(v) ?? "");
    if (values.includes("Loan ID")) {
      headerRowIdx = idx;
      headers = values;
    }
  });
  if (headerRowIdx === -1) throw new Error("Could not find 'Loan ID' header row");

  const fieldByCol = headers.map((h) => HEADER_ALIASES[h] ?? null);

  const out: ParsedLoan[] = [];
  ws.eachRow({ includeEmpty: false }, (row, idx) => {
    if (idx <= headerRowIdx) return;
    const cells = (row.values as unknown[]).slice(1);

    // Build a raw map of field → cell value.
    const raw: Record<string, unknown> = {};
    fieldByCol.forEach((field, i) => {
      if (field) raw[field] = cells[i];
    });
    if (!asString(raw.loanId)) return;

    const origination = asDate(raw.originationDate);
    const maturity = asDate(raw.maturityDate);
    const balance = asDecimal(raw.balance);
    const termMonths = asNumber(raw.termMonths);
    if (!origination || !maturity || !balance || !termMonths) return;

    out.push({
      scenarioId,
      loanId: asString(raw.loanId)!,
      borrower: asString(raw.borrower),
      lenderOfRecord: asString(raw.lenderOfRecord),
      state: asString(raw.state),
      postcode: asString(raw.postcode),
      assetClass: asString(raw.assetClass),
      propertyStatus: asString(raw.propertyStatus),
      location: asString(raw.location),
      originationDate: origination,
      maturityDate: maturity,
      termMonths,
      balance,
      propertyValue: asDecimal(raw.propertyValue),
      lvr: asDecimal(raw.lvr),
      noi: asDecimal(raw.noi),
      ncf: asDecimal(raw.ncf),
      icr: asDecimal(raw.icr),
      dscr: asDecimal(raw.dscr),
      wale: asDecimal(raw.wale),
      internalScore: asNumber(raw.internalScore),
      internalGrade: asString(raw.internalGrade),
      fitchIndicative: asString(raw.fitchIndicative),
      moodysIndicative: asString(raw.moodysIndicative),
      binding: asString(raw.binding),
      creditSpreadBps: asNumber(raw.creditSpreadBps),
      marginBps: asNumber(raw.marginBps),
      bbsw1mBps: asNumber(raw.bbsw1mBps),
      allInBps: asNumber(raw.allInBps),
      allInPct: asDecimal(raw.allInPct),
      annualInterest: asDecimal(raw.annualInterest),
    });
  });

  return out;
}
