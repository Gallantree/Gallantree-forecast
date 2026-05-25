import type { AccountType } from "@/models/account.model";

export interface SeedAccount {
  code: string;
  name: string;
  type: AccountType;
}

export const DEFAULT_COA: SeedAccount[] = [
  { code: "4000", name: "Management fees", type: "revenue" },
  { code: "4050", name: "Performance fees", type: "revenue" },
  { code: "4100", name: "NIM revenue — CRE CLO", type: "revenue" },
  { code: "4200", name: "NIM revenue — CMBS", type: "revenue" },
  { code: "4300", name: "NIM revenue — Warehouse", type: "revenue" },
  { code: "4400", name: "NIM revenue — Non-Conforming", type: "revenue" },
  { code: "4500", name: "Senior management fees", type: "revenue" },
  { code: "4510", name: "Subordinate management fees", type: "revenue" },
  { code: "4520", name: "Servicing fees", type: "revenue" },
  { code: "4530", name: "Other capital program fees", type: "revenue" },
  { code: "4600", name: "Platform license — Compliance SaaS", type: "revenue" },
  { code: "4610", name: "Platform license — Trustee", type: "revenue" },
  { code: "4900", name: "Other income", type: "revenue" },
  { code: "6000", name: "Salaries & wages", type: "expense" },
  { code: "6100", name: "Contractors", type: "expense" },
  { code: "6200", name: "Rent & occupancy", type: "expense" },
  { code: "6300", name: "Software & subscriptions", type: "expense" },
  { code: "6400", name: "Professional fees", type: "expense" },
  { code: "6500", name: "Trustee fees", type: "expense" },
  { code: "6700", name: "Depreciation — IT equipment & computers", type: "expense" },
  { code: "6710", name: "Depreciation — internally developed software", type: "expense" },
  { code: "6720", name: "Depreciation — servers & infrastructure", type: "expense" },
  { code: "6730", name: "Depreciation — furniture & fixtures", type: "expense" },
  { code: "6740", name: "Depreciation — leasehold improvements", type: "expense" },
  { code: "6750", name: "Depreciation — motor vehicles", type: "expense" },
  { code: "6760", name: "Depreciation — lab & testing equipment", type: "expense" },
  { code: "6770", name: "Depreciation — right-of-use assets (AASB 16)", type: "expense" },
  { code: "6800", name: "Interest expense — senior notes", type: "expense" },
  { code: "6810", name: "Interest expense — subordinate notes", type: "expense" },
  { code: "6820", name: "Interest expense — other tranches", type: "expense" },
  { code: "6900", name: "Other operating expenses", type: "expense" },
  { code: "1000", name: "Cash at bank", type: "asset" },
  { code: "1100", name: "Trade receivables", type: "asset" },
  { code: "1500", name: "Fixed assets", type: "asset" },
  { code: "2000", name: "Trade payables", type: "liability" },
  { code: "2100", name: "Accrued expenses", type: "liability" },
  { code: "3000", name: "Share capital", type: "equity" },
  { code: "3100", name: "Retained earnings", type: "equity" },
];
