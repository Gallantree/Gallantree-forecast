import Decimal from "decimal.js";
import { fmtMoney2, fmtNum0, fmtPercent } from "@/utils/format";
import { createPlatformLicense, deletePlatformLicense, updatePlatformLicense } from "../_actions";
import { AddLicenseModal, type LicenseFormInitial } from "./AddLicenseModal";

export interface PlatformLicenseRow {
  _id: string;
  name: string;
  type: "compliance" | "trustee";
  startPeriodKey: string;
  endPeriodKey?: string;
  notes?: string;
  tier?: "starter" | "standard" | "professional" | "custom";
  monthlyFeePerSeat?: { toString: () => string };
  seatCount?: number;
  seatGrowthPctAnnual?: { toString: () => string };
  billingFrequency?: "monthly" | "annual";
  annualDiscountPct?: { toString: () => string };
  monthlyFee?: { toString: () => string };
  configFee?: { toString: () => string };
  aumByYear?: Array<{ toString: () => string }>;
  feePctOfAumByYear?: Array<{ toString: () => string }>;
}

const TYPE_LABEL: Record<PlatformLicenseRow["type"], string> = {
  compliance: "Compliance SaaS",
  trustee: "Trustee licence",
};

const TIER_LABEL: Record<NonNullable<PlatformLicenseRow["tier"]>, string> = {
  starter: "Starter",
  standard: "Standard",
  professional: "Professional",
  custom: "Custom",
};

function num(x: { toString: () => string } | undefined, fallback = 0): number {
  if (!x) return fallback;
  const n = Number(x.toString());
  return Number.isFinite(n) ? n : fallback;
}

function effectiveMonthlyForCompliance(l: PlatformLicenseRow): number {
  const fee = num(l.monthlyFeePerSeat);
  const seats = l.seatCount ?? 0;
  const discount = l.billingFrequency === "annual" ? 1 - num(l.annualDiscountPct) / 100 : 1;
  return fee * seats * discount;
}

function fiveYearForTrustee(l: PlatformLicenseRow): number {
  const monthly = num(l.monthlyFee);
  const config = num(l.configFee);
  const aumByYear = (l.aumByYear ?? []).map((v) => num(v));
  const feeByYear = (l.feePctOfAumByYear ?? []).map((v) => num(v) / 100);
  const years = Math.max(aumByYear.length, feeByYear.length, 1);
  let total = config;
  for (let y = 0; y < years; y++) {
    const aum = aumByYear[y] ?? aumByYear[aumByYear.length - 1] ?? 0;
    const fee = feeByYear[y] ?? feeByYear[feeByYear.length - 1] ?? 0;
    total += monthly * 12 + aum * fee;
  }
  return total;
}

function fiveYearForCompliance(l: PlatformLicenseRow): number {
  const eff = effectiveMonthlyForCompliance(l);
  const growth = num(l.seatGrowthPctAnnual) / 100;
  if (growth === 0) return eff * 12 * 5;
  let total = 0;
  for (let y = 0; y < 5; y++) {
    const factor = (1 + growth) ** y;
    total += eff * 12 * factor;
  }
  return total;
}

function fiveYearRevenue(l: PlatformLicenseRow): number {
  return l.type === "compliance" ? fiveYearForCompliance(l) : fiveYearForTrustee(l);
}

function toFormInitial(l: PlatformLicenseRow): LicenseFormInitial {
  if (l.type === "compliance") {
    return {
      name: l.name,
      type: "compliance",
      startPeriodKey: l.startPeriodKey,
      endPeriodKey: l.endPeriodKey,
      notes: l.notes,
      tier: l.tier ?? "custom",
      monthlyFeePerSeat: l.monthlyFeePerSeat ? l.monthlyFeePerSeat.toString() : "",
      seatCount: l.seatCount,
      seatGrowthPctAnnual: l.seatGrowthPctAnnual?.toString() ?? "0",
      billingFrequency: l.billingFrequency ?? "monthly",
      annualDiscountPct: l.annualDiscountPct?.toString() ?? "0",
    };
  }
  return {
    name: l.name,
    type: "trustee",
    startPeriodKey: l.startPeriodKey,
    endPeriodKey: l.endPeriodKey,
    notes: l.notes,
    monthlyFee: l.monthlyFee?.toString() ?? "",
    configFee: l.configFee?.toString() ?? "",
    aumByYear: (l.aumByYear ?? []).map((v) => v.toString()),
    feePctOfAumByYear: (l.feePctOfAumByYear ?? []).map((v) => v.toString()),
  };
}

export function PlatformRevenuesTab({
  scenarioId,
  licenses,
  defaultStartPeriod,
  fys,
}: {
  scenarioId: string;
  licenses: PlatformLicenseRow[];
  defaultStartPeriod: string;
  fys: number[];
}) {
  const total5y = licenses.reduce((acc, l) => acc + fiveYearRevenue(l), 0);
  const complianceCount = licenses.filter((l) => l.type === "compliance").length;
  const trusteeCount = licenses.filter((l) => l.type === "trustee").length;

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="flex items-end justify-between gap-4 border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-xs">
        <div className="flex gap-6">
          <Tile label="Licences" value={fmtNum0(licenses.length)} />
          <Tile label="Compliance SaaS" value={fmtNum0(complianceCount)} />
          <Tile label="Trustee" value={fmtNum0(trusteeCount)} />
          <Tile
            label="5y revenue"
            value={fmtMoney2(total5y)}
            tone={total5y > 0 ? "ok" : undefined}
          />
        </div>
        <AddLicenseModal
          defaultStartPeriod={defaultStartPeriod}
          fys={fys}
          saveAction={createPlatformLicense.bind(null, scenarioId)}
        />
      </div>

      <div className="flex-1 overflow-auto">
        {licenses.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-zinc-500">
            <div>No platform licences yet.</div>
            <div className="text-xs">
              Click <span className="font-medium text-zinc-700">Add licence</span> to model a
              Compliance SaaS subscription or a Trustee platform contract.
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4 p-4">
            {licenses.map((l) => (
              <LicenseCard
                key={l._id}
                license={l}
                scenarioId={scenarioId}
                fys={fys}
                defaultStartPeriod={defaultStartPeriod}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function LicenseCard({
  license: l,
  scenarioId,
  fys,
  defaultStartPeriod,
}: {
  license: PlatformLicenseRow;
  scenarioId: string;
  fys: number[];
  defaultStartPeriod: string;
}) {
  const annual5y = fiveYearRevenue(l);
  return (
    <section className="overflow-hidden rounded-md border border-zinc-200 bg-white shadow-sm">
      <header className="flex items-baseline justify-between border-b border-zinc-200 bg-zinc-50 px-4 py-2">
        <div className="flex items-baseline gap-3">
          <h3 className="text-sm font-semibold text-zinc-900">{l.name}</h3>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${
              l.type === "compliance" ? "bg-sky-100 text-sky-800" : "bg-violet-100 text-violet-800"
            }`}
          >
            {TYPE_LABEL[l.type]}
          </span>
          <span className="font-mono text-[11px] text-zinc-500">
            {l.startPeriodKey}
            {l.endPeriodKey ? ` → ${l.endPeriodKey}` : ""}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-zinc-500">
            5y revenue <span className="font-semibold text-emerald-700">{fmtMoney2(annual5y)}</span>
          </span>
          <AddLicenseModal
            defaultStartPeriod={defaultStartPeriod}
            fys={fys}
            initial={toFormInitial(l)}
            saveAction={updatePlatformLicense.bind(null, scenarioId, l._id)}
            triggerLabel="Edit"
            triggerClassName="rounded px-2 py-0.5 text-xs text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
          />
          <form action={deletePlatformLicense.bind(null, scenarioId, l._id)}>
            <button
              type="submit"
              className="rounded px-2 py-0.5 text-xs text-zinc-400 hover:bg-rose-50 hover:text-rose-600"
            >
              Delete
            </button>
          </form>
        </div>
      </header>
      {l.notes ? (
        <div className="border-b border-zinc-100 bg-amber-50/40 px-4 py-1.5 text-[11px] text-zinc-700">
          {l.notes}
        </div>
      ) : null}
      {l.type === "compliance" ? (
        <ComplianceBody license={l} />
      ) : (
        <TrusteeBody license={l} fys={fys} />
      )}
    </section>
  );
}

function ComplianceBody({ license: l }: { license: PlatformLicenseRow }) {
  const eff = effectiveMonthlyForCompliance(l);
  const baseFee = num(l.monthlyFeePerSeat);
  const discount = l.billingFrequency === "annual" ? num(l.annualDiscountPct) : 0;
  return (
    <div className="grid grid-cols-2 gap-px border-t border-zinc-100 bg-zinc-200 sm:grid-cols-6">
      <Mini label="Tier" value={l.tier ? TIER_LABEL[l.tier] : "—"} />
      <Mini label="Fee / seat / mo" value={fmtMoney2(baseFee)} />
      <Mini label="Seats" value={fmtNum0(l.seatCount ?? 0)} />
      <Mini
        label="Billing"
        value={l.billingFrequency === "annual" ? `Annual (-${fmtPercent(discount)})` : "Monthly"}
      />
      <Mini label="Seat growth p.a." value={fmtPercent(num(l.seatGrowthPctAnnual))} />
      <Mini label="Effective $/mo at t=0" value={fmtMoney2(eff)} emphasis />
    </div>
  );
}

function TrusteeBody({ license: l, fys }: { license: PlatformLicenseRow; fys: number[] }) {
  const monthly = num(l.monthlyFee);
  const config = num(l.configFee);
  const aumByYear = (l.aumByYear ?? []).map((v) => num(v));
  const feeByYear = (l.feePctOfAumByYear ?? []).map((v) => num(v));

  return (
    <div className="flex flex-col gap-3 px-4 py-3 text-xs">
      <div className="grid grid-cols-3 gap-px overflow-hidden rounded-md bg-zinc-200">
        <Mini label="Monthly platform fee" value={fmtMoney2(monthly)} />
        <Mini label="Configuration fee" value={fmtMoney2(config)} sub="one-off" />
        <Mini
          label="AUM-fee $/yr · Y1"
          value={fmtMoney2(((aumByYear[0] ?? 0) * (feeByYear[0] ?? 0)) / 100)}
        />
      </div>
      <div>
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
          AUM & fee % by CY
        </div>
        <table className="w-full border-collapse text-[11px]">
          <thead className="bg-zinc-50 text-zinc-500">
            <tr>
              <th className="px-2 py-1 text-left font-medium">Metric</th>
              {fys.map((fy) => (
                <th key={fy} className="px-2 py-1 text-right font-medium">
                  CY{String(fy).slice(-2)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-zinc-100">
              <td className="px-2 py-1 text-zinc-700">AUM ($)</td>
              {fys.map((fy, i) => (
                <td key={fy} className="px-2 py-1 text-right tabular-nums">
                  {fmtMoney2(aumByYear[i] ?? 0)}
                </td>
              ))}
            </tr>
            <tr className="border-t border-zinc-100">
              <td className="px-2 py-1 text-zinc-700">Fee % of AUM</td>
              {fys.map((fy, i) => (
                <td key={fy} className="px-2 py-1 text-right tabular-nums">
                  {fmtPercent(feeByYear[i] ?? 0)}
                </td>
              ))}
            </tr>
            <tr className="border-t border-zinc-100 bg-zinc-50 font-semibold">
              <td className="px-2 py-1 text-zinc-700">$ / yr</td>
              {fys.map((fy, i) => {
                const a = aumByYear[i] ?? 0;
                const f = feeByYear[i] ?? 0;
                const aumFee = (a * f) / 100;
                const annual = monthly * 12 + aumFee + (i === 0 ? config : 0);
                return (
                  <td key={fy} className="px-2 py-1 text-right tabular-nums text-emerald-700">
                    {fmtMoney2(annual)}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: "ok" }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
        {label}
      </div>
      <div
        className={`text-base font-semibold ${
          tone === "ok" ? "text-emerald-700" : "text-zinc-900"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function Mini({
  label,
  value,
  sub,
  emphasis = false,
}: {
  label: string;
  value: string;
  sub?: string;
  emphasis?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5 bg-white px-3 py-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
        {label}
        {sub ? <span className="ml-1 font-normal lowercase text-zinc-400">· {sub}</span> : null}
      </span>
      <span
        className={`text-sm font-semibold tabular-nums ${
          emphasis ? "text-emerald-700" : "text-zinc-900"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

void Decimal;
