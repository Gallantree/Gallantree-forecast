const AUD0 = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  maximumFractionDigits: 0,
});

const AUD2 = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  maximumFractionDigits: 2,
});

const NUM0 = new Intl.NumberFormat("en-AU", { maximumFractionDigits: 0 });

export function fmtMoney0(value: string | number): string {
  return AUD0.format(typeof value === "string" ? Number(value) : value);
}

export function fmtMoney2(value: string | number): string {
  return AUD2.format(typeof value === "string" ? Number(value) : value);
}

export function fmtNum0(value: string | number): string {
  return NUM0.format(typeof value === "string" ? Number(value) : value);
}

export function fmtPercent(value: string | number): string {
  const n = typeof value === "string" ? Number(value) : value;
  const trimmed = Number.isFinite(n) ? Number(n.toFixed(4)) : 0;
  return `${trimmed}%`;
}
