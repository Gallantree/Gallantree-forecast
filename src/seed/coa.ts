import type { AccountType } from "@/models/account.model";

export interface SeedAccount {
  code: string;
  name: string;
  type: AccountType;
}

export const DEFAULT_COA: SeedAccount[] = [
  { code: "4000", name: "Management fees", type: "revenue" },
  { code: "4100", name: "Performance fees", type: "revenue" },
  { code: "4200", name: "Other income", type: "revenue" },
  { code: "6000", name: "Salaries & wages", type: "expense" },
  { code: "6100", name: "Contractors", type: "expense" },
  { code: "6200", name: "Rent & occupancy", type: "expense" },
  { code: "6300", name: "Software & subscriptions", type: "expense" },
  { code: "6400", name: "Professional fees", type: "expense" },
  { code: "6900", name: "Other operating expenses", type: "expense" },
  { code: "1000", name: "Cash at bank", type: "asset" },
  { code: "1100", name: "Trade receivables", type: "asset" },
  { code: "1500", name: "Fixed assets", type: "asset" },
  { code: "2000", name: "Trade payables", type: "liability" },
  { code: "2100", name: "Accrued expenses", type: "liability" },
  { code: "3000", name: "Share capital", type: "equity" },
  { code: "3100", name: "Retained earnings", type: "equity" },
];
