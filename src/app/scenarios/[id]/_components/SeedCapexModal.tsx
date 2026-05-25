"use client";

import { useRef, useState, useTransition } from "react";
import { fmtMoney2 } from "@/utils/format";
import type { CapexDriverPayload } from "../_actions";

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function addMonths(periodKey: string, months: number): string {
  const [y, m] = periodKey.split("-").map(Number);
  const d = new Date(y, m - 1 + months, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

interface SeedItem {
  name: string;
  accountCode: string;
  inServicePeriodKey: string;
  cost: number;
  usefulLifeMonths: number;
  unitNote: string;
}

const SECTION_LABEL: Record<string, string> = {
  "6700": "IT equipment & computers",
  "6710": "Internally developed software",
  "6720": "Servers & infrastructure",
};

const IDS_NAMES = [
  "IDS — Platform core build (3 FTE)",
  "IDS — Feature release Y2 (3 FTE)",
  "IDS — Feature release Y3 (3 FTE)",
  "IDS — Feature release Y4 (3 FTE)",
  "IDS — Feature release Y5 (3 FTE)",
];

function buildItems(headcount: number, startPeriod: string): SeedItem[] {
  if (!PERIOD_RE.test(startPeriod) || headcount < 1) return [];

  const mac = Math.ceil(headcount / 2);
  const len = Math.floor(headcount / 2);
  const items: SeedItem[] = [];

  // 6700 — IT equipment
  items.push({
    name: `MacBook Pros (×${mac})`,
    accountCode: "6700",
    inServicePeriodKey: startPeriod,
    cost: mac * 2499,
    usefulLifeMonths: 36,
    unitNote: `${mac} × $2,499`,
  });
  if (len > 0)
    items.push({
      name: `Lenovo PCs (×${len})`,
      accountCode: "6700",
      inServicePeriodKey: startPeriod,
      cost: len * 2199,
      usefulLifeMonths: 36,
      unitNote: `${len} × $2,199`,
    });

  // 6710 — IDS: 5 annual capitalised releases
  // Model: 3 FTE engineers × $150k loaded × 80% capitalisation rate = $360k/year
  for (let i = 0; i < 5; i++) {
    items.push({
      name: IDS_NAMES[i],
      accountCode: "6710",
      inServicePeriodKey: addMonths(startPeriod, i * 12),
      cost: 360_000,
      usefulLifeMonths: 60,
      unitNote: "3 FTE × $150k × 80% cap",
    });
  }

  // 6720 — Servers: 2 Mac Minis + 2 monitors per staff
  items.push({
    name: `Mac Minis — dev stations (×${headcount * 2})`,
    accountCode: "6720",
    inServicePeriodKey: startPeriod,
    cost: headcount * 2 * 1299,
    usefulLifeMonths: 60,
    unitNote: `${headcount * 2} × $1,299`,
  });
  items.push({
    name: `Monitors (×${headcount * 2})`,
    accountCode: "6720",
    inServicePeriodKey: startPeriod,
    cost: headcount * 2 * 349,
    usefulLifeMonths: 60,
    unitNote: `${headcount * 2} × $349`,
  });

  return items;
}

export function SeedCapexModal({
  defaultStartPeriod,
  saveAction,
}: {
  defaultStartPeriod: string;
  saveAction: (payloads: CapexDriverPayload[]) => Promise<void>;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [headcount, setHeadcount] = useState("5");
  const [startPeriod, setStartPeriod] = useState(defaultStartPeriod);

  const hc = Math.max(1, Math.floor(Number(headcount) || 1));
  const items = buildItems(hc, startPeriod);
  const totalCost = items.reduce((s, i) => s + i.cost, 0);

  // Group items by account code for display
  const sections = ["6700", "6710", "6720"] as const;

  function show() {
    setOpen(true);
    dialogRef.current?.showModal();
  }
  function hide() {
    dialogRef.current?.close();
    setOpen(false);
  }

  function onSeed() {
    if (items.length === 0) return;
    const payloads: CapexDriverPayload[] = items.map((item) => ({
      name: item.name,
      accountCode: item.accountCode,
      inServicePeriodKey: item.inServicePeriodKey,
      cost: String(item.cost),
      usefulLifeMonths: item.usefulLifeMonths,
    }));
    startTransition(async () => {
      await saveAction(payloads);
      hide();
    });
  }

  return (
    <div className="inline-flex">
      <button
        type="button"
        onClick={show}
        className="whitespace-nowrap rounded-md border border-zinc-300 bg-white px-4 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
      >
        Seed capex
      </button>

      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        className="fixed inset-0 m-auto h-fit max-h-[90vh] w-fit max-w-[95vw] overflow-y-auto rounded-lg p-0 shadow-xl backdrop:bg-black/40"
      >
        {open && (
          <div className="flex w-[620px] flex-col gap-5 p-6 text-sm">
            <header className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold">Seed capex assets</h2>
                <p className="mt-0.5 text-[11px] text-zinc-500">
                  Bootstraps standard IT, software and server capex. Adjust headcount and start
                  period, then review assets before seeding.
                </p>
              </div>
            </header>

            {/* Inputs */}
            <div className="grid grid-cols-2 gap-4 text-xs">
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  Staff headcount
                </span>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={headcount}
                  onChange={(e) => setHeadcount(e.target.value)}
                  className="rounded-md border border-zinc-300 px-2 py-1.5 text-right tabular-nums"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  Start period{" "}
                  <span className="font-normal lowercase text-zinc-400">· YYYY-MM</span>
                </span>
                <input
                  value={startPeriod}
                  onChange={(e) => setStartPeriod(e.target.value)}
                  placeholder="YYYY-MM"
                  className="rounded-md border border-zinc-300 px-2 py-1.5 font-mono"
                />
              </label>
            </div>

            {/* Preview sections */}
            {items.length > 0 ? (
              <div className="flex flex-col gap-3">
                {sections.map((code) => {
                  const sectionItems = items.filter((i) => i.accountCode === code);
                  if (sectionItems.length === 0) return null;
                  return (
                    <section key={code} className="rounded-md border border-zinc-200">
                      <header className="border-b border-zinc-100 bg-zinc-50 px-3 py-1.5">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
                          {SECTION_LABEL[code]}
                        </span>
                        <span className="ml-2 text-[10px] text-zinc-400">
                          {code} · {code === "6700" ? "36" : "60"} mo straight-line
                        </span>
                        {code === "6710" && (
                          <span className="ml-2 text-[10px] italic text-zinc-400">
                            3 FTE × $150k loaded × 80% cap rate = $360k/yr
                          </span>
                        )}
                      </header>
                      <table className="w-full text-[11px]">
                        <tbody>
                          {sectionItems.map((item, idx) => (
                            <tr
                              key={idx}
                              className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50"
                            >
                              <td className="px-3 py-1.5 text-zinc-800">{item.name}</td>
                              <td className="px-3 py-1.5 text-zinc-400">{item.unitNote}</td>
                              <td className="px-3 py-1.5 font-mono text-zinc-500">
                                {item.inServicePeriodKey}
                              </td>
                              <td className="px-3 py-1.5 text-right tabular-nums font-medium text-zinc-800">
                                {fmtMoney2(item.cost.toFixed(0))}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </section>
                  );
                })}

                {/* Totals */}
                <div className="flex items-center justify-between rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs">
                  <span className="text-zinc-500">
                    <span className="font-semibold text-zinc-700">{items.length} assets</span> to
                    create
                  </span>
                  <span className="text-zinc-500">
                    Total outflow{" "}
                    <span className="font-semibold text-zinc-800">
                      {fmtMoney2(totalCost.toFixed(0))}
                    </span>
                  </span>
                </div>
              </div>
            ) : (
              <p className="rounded-md border border-amber-100 bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
                Enter a valid headcount and start period (YYYY-MM) to preview assets.
              </p>
            )}

            <footer className="flex items-center justify-between border-t border-zinc-200 pt-3">
              <button
                type="button"
                onClick={hide}
                disabled={pending}
                className="rounded-md px-3 py-1 text-xs text-zinc-600 hover:bg-zinc-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onSeed}
                disabled={pending || items.length === 0}
                className="rounded-md bg-zinc-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
              >
                {pending ? "Seeding…" : `Seed ${items.length} assets →`}
              </button>
            </footer>
          </div>
        )}
      </dialog>
    </div>
  );
}
