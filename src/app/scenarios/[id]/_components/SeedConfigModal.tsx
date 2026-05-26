"use client";

import { useCallback, useState } from "react";

// ── Public types ──────────────────────────────────────────────────────────────

export interface SeedProgramRow {
  name: string;
  dealSize: string; // numeric string, e.g. "500000000"
  startPeriodKey: string; // "YYYY-MM"
  endPeriodKey: string; // "YYYY-MM" (auto-calculated)
  collateralType?: "cre" | "corporate"; // CMBS only
}

export interface SeedProgramConfig {
  rows: SeedProgramRow[];
}

// ── Per-type metadata ────────────────────────────────────────────────────────

type SeedTypeKey = "cre-clo" | "cmbs" | "bsl" | "warehouses" | "enhanced-funds";

interface TypeMeta {
  label: string;
  description: string;
  defaultTenorYears: number;
  defaultSpacingMonths: number;
  hasCmbs: boolean;
}

const TYPE_META: Record<SeedTypeKey, TypeMeta> = {
  "cre-clo": {
    label: "CRE CLO",
    description: "Floating-rate securitisations of commercial real estate loans.",
    defaultTenorYears: 3,
    defaultSpacingMonths: 6,
    hasCmbs: false,
  },
  cmbs: {
    label: "CMBS",
    description: "Commercial mortgage-backed securities (CRE-backed then Corporate-backed).",
    defaultTenorYears: 5,
    defaultSpacingMonths: 6,
    hasCmbs: true,
  },
  bsl: {
    label: "BSL CLO",
    description: "Broadly-syndicated loan CLOs — one per calendar year.",
    defaultTenorYears: 4,
    defaultSpacingMonths: 12,
    hasCmbs: false,
  },
  warehouses: {
    label: "Warehouses",
    description: "Revolving warehouse facilities (CRE, Corporate Credit, SRT).",
    defaultTenorYears: 5,
    defaultSpacingMonths: 0,
    hasCmbs: false,
  },
  "enhanced-funds": {
    label: "Enhanced Funds",
    description: "MIS unit-class vehicles holding equity tranches from securitisations.",
    defaultTenorYears: 6,
    defaultSpacingMonths: 24,
    hasCmbs: false,
  },
};

// ── Default rows per type ────────────────────────────────────────────────────

function calcEnd(start: string, tenorYears: number): string {
  const [y, m] = start.split("-").map(Number);
  const totalMonths = m - 1 + tenorYears * 12;
  const endYear = y + Math.floor(totalMonths / 12);
  const endMonth = (totalMonths % 12) + 1;
  return `${endYear}-${String(endMonth).padStart(2, "0")}`;
}

const DEFAULT_ROWS: Record<SeedTypeKey, SeedProgramRow[]> = {
  "cre-clo": [
    {
      name: "Gallantree CRE CLO 2026 FL-1",
      dealSize: "1161500000",
      startPeriodKey: "2026-08",
      endPeriodKey: calcEnd("2026-08", 3),
    },
    {
      name: "Gallantree CRE CLO 2027 FL-1",
      dealSize: "877899000",
      startPeriodKey: "2027-02",
      endPeriodKey: calcEnd("2027-02", 3),
    },
    {
      name: "Gallantree CRE CLO 2027 FL-2",
      dealSize: "868150000",
      startPeriodKey: "2027-08",
      endPeriodKey: calcEnd("2027-08", 3),
    },
    {
      name: "Gallantree CRE CLO 2028 FL-1",
      dealSize: "1073650000",
      startPeriodKey: "2028-02",
      endPeriodKey: calcEnd("2028-02", 3),
    },
    {
      name: "Gallantree CRE CLO 2029 FL-1",
      dealSize: "636550000",
      startPeriodKey: "2029-02",
      endPeriodKey: calcEnd("2029-02", 3),
    },
    {
      name: "Gallantree CRE CLO 2029 FL-2",
      dealSize: "705501000",
      startPeriodKey: "2029-08",
      endPeriodKey: calcEnd("2029-08", 3),
    },
  ],
  cmbs: [
    {
      name: "Gallantree CRE CMBS 2026-1",
      dealSize: "500000000",
      startPeriodKey: "2026-09",
      endPeriodKey: calcEnd("2026-09", 5),
      collateralType: "cre",
    },
    {
      name: "Gallantree CRE CMBS 2027-1",
      dealSize: "480000000",
      startPeriodKey: "2027-03",
      endPeriodKey: calcEnd("2027-03", 5),
      collateralType: "cre",
    },
    {
      name: "Gallantree CRE CMBS 2027-2",
      dealSize: "520000000",
      startPeriodKey: "2027-09",
      endPeriodKey: calcEnd("2027-09", 5),
      collateralType: "cre",
    },
    {
      name: "Gallantree CRE CMBS 2028-1",
      dealSize: "460000000",
      startPeriodKey: "2028-03",
      endPeriodKey: calcEnd("2028-03", 5),
      collateralType: "cre",
    },
    {
      name: "Gallantree Corporate CMBS 2028-1",
      dealSize: "400000000",
      startPeriodKey: "2028-09",
      endPeriodKey: calcEnd("2028-09", 5),
      collateralType: "corporate",
    },
    {
      name: "Gallantree Corporate CMBS 2029-1",
      dealSize: "420000000",
      startPeriodKey: "2029-03",
      endPeriodKey: calcEnd("2029-03", 5),
      collateralType: "corporate",
    },
    {
      name: "Gallantree Corporate CMBS 2029-2",
      dealSize: "380000000",
      startPeriodKey: "2029-09",
      endPeriodKey: calcEnd("2029-09", 5),
      collateralType: "corporate",
    },
    {
      name: "Gallantree Corporate CMBS 2030-1",
      dealSize: "360000000",
      startPeriodKey: "2030-03",
      endPeriodKey: calcEnd("2030-03", 5),
      collateralType: "corporate",
    },
  ],
  bsl: [
    {
      name: "Gallantree BSL CLO 2026-1",
      dealSize: "750000000",
      startPeriodKey: "2026-01",
      endPeriodKey: calcEnd("2026-01", 4),
    },
    {
      name: "Gallantree BSL CLO 2027-1",
      dealSize: "680000000",
      startPeriodKey: "2027-01",
      endPeriodKey: calcEnd("2027-01", 4),
    },
    {
      name: "Gallantree BSL CLO 2028-1",
      dealSize: "720000000",
      startPeriodKey: "2028-01",
      endPeriodKey: calcEnd("2028-01", 4),
    },
    {
      name: "Gallantree BSL CLO 2029-1",
      dealSize: "810000000",
      startPeriodKey: "2029-01",
      endPeriodKey: calcEnd("2029-01", 4),
    },
    {
      name: "Gallantree BSL CLO 2030-1",
      dealSize: "760000000",
      startPeriodKey: "2030-01",
      endPeriodKey: calcEnd("2030-01", 4),
    },
  ],
  warehouses: [
    {
      name: "Gallantree CRE Warehouse 2026",
      dealSize: "500000000",
      startPeriodKey: "2026-01",
      endPeriodKey: calcEnd("2026-01", 5),
    },
    {
      name: "Gallantree Corporate Credit Warehouse 2026",
      dealSize: "400000000",
      startPeriodKey: "2026-01",
      endPeriodKey: calcEnd("2026-01", 5),
    },
    {
      name: "Gallantree SRT Warehouse 2026",
      dealSize: "300000000",
      startPeriodKey: "2026-10",
      endPeriodKey: calcEnd("2026-10", 5),
    },
  ],
  "enhanced-funds": [
    {
      name: "Gallantree Enhanced Income Fund I",
      dealSize: "200000000",
      startPeriodKey: "2026-08",
      endPeriodKey: calcEnd("2026-08", 6),
    },
    {
      name: "Gallantree Enhanced Income Fund II",
      dealSize: "500000000",
      startPeriodKey: "2028-08",
      endPeriodKey: calcEnd("2028-08", 7),
    },
  ],
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtDealSize(val: string): string {
  const n = Number(val);
  if (Number.isNaN(n)) return val;
  return `$${n.toLocaleString("en-AU")}`;
}

function parseDealSize(display: string): string {
  // Strip $, commas, whitespace and return a numeric string
  return display.replace(/[$,\s]/g, "");
}

/** Add months to a YYYY-MM string */
function addMonths(periodKey: string, months: number): string {
  const [y, m] = periodKey.split("-").map(Number);
  const totalMonths = m - 1 + months;
  const newYear = y + Math.floor(totalMonths / 12);
  const newMonth = (totalMonths % 12) + 1;
  return `${newYear}-${String(newMonth).padStart(2, "0")}`;
}

/** Derive tenor years from start/end period keys (rounded) */
function tenorYearsFromRange(start: string, end: string): number {
  const [sy, sm] = start.split("-").map(Number);
  const [ey, em] = end.split("-").map(Number);
  const months = (ey - sy) * 12 + (em - sm);
  return Math.max(1, Math.round(months / 12));
}

// ── Row component ────────────────────────────────────────────────────────────

interface RowProps {
  index: number;
  row: SeedProgramRow;
  showCmbs: boolean;
  canDelete: boolean;
  onChange: (index: number, updated: SeedProgramRow) => void;
  onDelete: (index: number) => void;
}

function ProgramRow({ index, row, showCmbs, canDelete, onChange, onDelete }: RowProps) {
  const tenorYears = tenorYearsFromRange(row.startPeriodKey, row.endPeriodKey);

  function handleField<K extends keyof SeedProgramRow>(field: K, value: SeedProgramRow[K]) {
    const updated = { ...row, [field]: value };
    // Recalculate end when start or tenor changes
    if (field === "startPeriodKey") {
      updated.endPeriodKey = calcEnd(value as string, tenorYears);
    }
    onChange(index, updated);
  }

  function handleTenor(years: number) {
    const safeYears = Math.max(1, years);
    onChange(index, { ...row, endPeriodKey: calcEnd(row.startPeriodKey, safeYears) });
  }

  function handleDealSizeBlur(e: React.FocusEvent<HTMLInputElement>) {
    // On blur: strip formatting back to numeric string
    const numeric = parseDealSize(e.target.value);
    if (numeric && !Number.isNaN(Number(numeric))) {
      onChange(index, { ...row, dealSize: numeric });
    }
  }

  const inputCls =
    "px-2 py-1 text-xs border border-zinc-200 rounded focus:border-zinc-400 focus:outline-none w-full";

  return (
    <tr className="border-b border-zinc-100 last:border-b-0">
      <td className="px-2 py-1.5 text-xs text-zinc-400 text-center w-6">{index + 1}</td>
      <td className="px-2 py-1.5 min-w-[180px]">
        <input
          type="text"
          value={row.name}
          onChange={(e) => handleField("name", e.target.value)}
          className={inputCls}
        />
      </td>
      <td className="px-2 py-1.5 min-w-[130px]">
        <input
          type="text"
          defaultValue={fmtDealSize(row.dealSize)}
          key={`ds-${index}-${row.dealSize}`}
          onBlur={handleDealSizeBlur}
          className={inputCls}
        />
      </td>
      <td className="px-2 py-1.5 w-[100px]">
        <input
          type="month"
          value={row.startPeriodKey}
          onChange={(e) => handleField("startPeriodKey", e.target.value)}
          className={inputCls}
        />
      </td>
      <td className="px-2 py-1.5 w-[70px]">
        <input
          type="number"
          min={1}
          max={30}
          value={tenorYears}
          onChange={(e) => handleTenor(Number(e.target.value))}
          className={`${inputCls} text-center`}
        />
      </td>
      <td className="px-2 py-1.5 w-[90px]">
        <span className="px-2 py-1 text-xs text-zinc-500 bg-zinc-50 rounded border border-zinc-100 block text-center">
          {row.endPeriodKey}
        </span>
      </td>
      {showCmbs && (
        <td className="px-2 py-1.5 w-[130px]">
          <select
            value={row.collateralType ?? "cre"}
            onChange={(e) => handleField("collateralType", e.target.value as "cre" | "corporate")}
            className={inputCls}
          >
            <option value="cre">CRE-backed</option>
            <option value="corporate">Corporate-backed</option>
          </select>
        </td>
      )}
      <td className="px-2 py-1.5 w-8 text-center">
        {canDelete && (
          <button
            type="button"
            onClick={() => onDelete(index)}
            className="text-zinc-300 hover:text-rose-500 transition-colors text-sm leading-none"
            title="Remove row"
          >
            ×
          </button>
        )}
      </td>
    </tr>
  );
}

// ── Main modal component ─────────────────────────────────────────────────────

interface SeedConfigModalProps {
  typeKey: SeedTypeKey;
  onClose: () => void;
  onSeed: (config: SeedProgramConfig) => void;
  running: boolean;
}

export function SeedConfigModal({ typeKey, onClose, onSeed, running }: SeedConfigModalProps) {
  const meta = TYPE_META[typeKey];

  const [rows, setRows] = useState<SeedProgramRow[]>(() =>
    DEFAULT_ROWS[typeKey].map((r) => ({ ...r })),
  );

  // Auto-spacing inputs
  const [spacingMonths, setSpacingMonths] = useState<number>(meta.defaultSpacingMonths);
  const [spacingFromDate, setSpacingFromDate] = useState<string>(
    () => DEFAULT_ROWS[typeKey][0]?.startPeriodKey ?? "2026-01",
  );

  const handleRowChange = useCallback((index: number, updated: SeedProgramRow) => {
    setRows((prev) => prev.map((r, i) => (i === index ? updated : r)));
  }, []);

  const handleRowDelete = useCallback((index: number) => {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }, []);

  function handleAddRow() {
    const last = rows[rows.length - 1];
    const newStart =
      last && meta.defaultSpacingMonths > 0
        ? addMonths(last.startPeriodKey, meta.defaultSpacingMonths)
        : (last?.startPeriodKey ?? "2026-01");
    const tenorYears = last
      ? tenorYearsFromRange(last.startPeriodKey, last.endPeriodKey)
      : meta.defaultTenorYears;
    const newRow: SeedProgramRow = {
      name: `Program ${rows.length + 1}`,
      dealSize: last?.dealSize ?? "500000000",
      startPeriodKey: newStart,
      endPeriodKey: calcEnd(newStart, tenorYears),
      ...(meta.hasCmbs ? { collateralType: "cre" as const } : {}),
    };
    setRows((prev) => [...prev, newRow]);
  }

  function handleApplySpacing() {
    if (rows.length === 0) return;
    const tenors = rows.map((r) => tenorYearsFromRange(r.startPeriodKey, r.endPeriodKey));
    setRows((prev) =>
      prev.map((r, i) => {
        const newStart = addMonths(spacingFromDate, i * spacingMonths);
        return {
          ...r,
          startPeriodKey: newStart,
          endPeriodKey: calcEnd(newStart, tenors[i] ?? meta.defaultTenorYears),
        };
      }),
    );
  }

  function handleSeed() {
    onSeed({ rows });
  }

  const isValid = rows.length > 0 && rows.every((r) => r.name.trim() && r.dealSize);

  return (
    <>
      {/* Overlay */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: overlay dismiss-on-click is intentional UX */}
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        {/* Modal box */}
        <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col mx-4">
          {/* Header */}
          <div className="px-5 pt-5 pb-3 border-b border-zinc-100">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-sm font-semibold text-zinc-900">Configure {meta.label} Seed</h2>
                <p className="text-xs text-zinc-500 mt-0.5">{meta.description}</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="text-zinc-400 hover:text-zinc-700 text-lg leading-none mt-0.5 shrink-0"
                aria-label="Close"
              >
                ×
              </button>
            </div>
          </div>

          {/* Auto-spacing bar */}
          {meta.defaultSpacingMonths > 0 && (
            <div className="px-5 py-2.5 bg-zinc-50 border-b border-zinc-100 flex items-center gap-2 text-xs text-zinc-600 flex-wrap">
              <span>Space</span>
              <input
                type="number"
                min={0}
                max={60}
                value={spacingMonths}
                onChange={(e) => setSpacingMonths(Number(e.target.value))}
                className="w-12 px-1.5 py-0.5 border border-zinc-200 rounded text-xs text-center focus:border-zinc-400 focus:outline-none"
              />
              <span>months apart from</span>
              <input
                type="month"
                value={spacingFromDate}
                onChange={(e) => setSpacingFromDate(e.target.value)}
                className="px-1.5 py-0.5 border border-zinc-200 rounded text-xs focus:border-zinc-400 focus:outline-none"
              />
              <button
                type="button"
                onClick={handleApplySpacing}
                className="px-2.5 py-0.5 bg-zinc-200 hover:bg-zinc-300 rounded text-xs font-medium text-zinc-700 transition-colors"
              >
                Apply
              </button>
            </div>
          )}

          {/* Table (scrollable) */}
          <div className="flex-1 overflow-auto px-5 py-3">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-zinc-200">
                  <th className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400 w-6">
                    #
                  </th>
                  <th className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                    Name
                  </th>
                  <th className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                    Deal Size
                  </th>
                  <th className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                    Start
                  </th>
                  <th className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                    Tenor (y)
                  </th>
                  <th className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                    End
                  </th>
                  {meta.hasCmbs && (
                    <th className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                      Type
                    </th>
                  )}
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <ProgramRow
                    key={i}
                    index={i}
                    row={row}
                    showCmbs={meta.hasCmbs}
                    canDelete={rows.length > 1}
                    onChange={handleRowChange}
                    onDelete={handleRowDelete}
                  />
                ))}
              </tbody>
            </table>

            {/* Add program button */}
            <button
              type="button"
              onClick={handleAddRow}
              className="mt-3 text-xs text-indigo-600 hover:text-indigo-800 font-medium"
            >
              ＋ Add program
            </button>
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-zinc-100 flex items-center justify-between gap-3">
            <span className="text-xs text-zinc-400">
              {rows.length} program{rows.length !== 1 ? "s" : ""} configured
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-1.5 text-xs font-medium text-zinc-700 border border-zinc-200 rounded-md hover:bg-zinc-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSeed}
                disabled={running || !isValid}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-md px-4 py-1.5 text-xs font-medium transition-colors"
              >
                {running
                  ? "Seeding…"
                  : `Seed ${rows.length} program${rows.length !== 1 ? "s" : ""} →`}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
