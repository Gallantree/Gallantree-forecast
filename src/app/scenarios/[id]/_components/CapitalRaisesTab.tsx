"use client";

import { useState, useTransition } from "react";
import { fmtMoney0 } from "@/utils/format";
import {
  addInvestor,
  type CapitalRaisePayload,
  type CapitalRaiseType,
  createCapitalRaise,
  deleteCapitalRaise,
  deleteInvestor,
  type InvestorPayload,
  type InvestorStatus,
  markAllInvestorsFunded,
  seedInitialConvertibleNote,
  updateCapitalRaise,
  updateInvestor,
} from "../_actions";

export interface InvestorRow {
  _id: string;
  name: string;
  commitment: string;
  fundingDate: string; // ISO
  numNotes?: number;
  status: InvestorStatus;
  notes?: string;
}

export interface UseOfFundsPlanRow {
  coverMonths: number;
  contingencyPct: number;
  includeRevenue: boolean;
  manualLines: Array<{ label: string; amount: number }>;
}

export interface CapitalRaiseRow {
  _id: string;
  name: string;
  type: CapitalRaiseType;
  raiseDate: string; // ISO
  targetSize: string;
  discountPct?: string;
  valuationCap?: string;
  pricePerUnit?: string;
  investors: InvestorRow[];
  useOfFundsPlan?: UseOfFundsPlanRow;
}

const TYPE_LABEL: Record<CapitalRaiseType, string> = {
  equity: "Equity",
  convertible_note: "Convertible note",
};

const STATUS_LABEL: Record<InvestorStatus, string> = {
  committed: "Committed",
  funded: "Funded",
  withdrawn: "Withdrawn",
};

const STATUS_TONE: Record<InvestorStatus, string> = {
  committed: "bg-sky-100 text-sky-800",
  funded: "bg-emerald-100 text-emerald-800",
  withdrawn: "bg-zinc-100 text-zinc-500 line-through",
};

function toIsoDate(d: string): string {
  // Accept either YYYY-MM-DD or full ISO; return YYYY-MM-DD.
  return d.slice(0, 10);
}

function totalCommitments(investors: InvestorRow[]): number {
  return investors
    .filter((i) => i.status !== "withdrawn")
    .reduce((acc, i) => acc + Number(i.commitment), 0);
}

export function CapitalRaisesTab({
  scenarioId,
  raises,
}: {
  scenarioId: string;
  raises: CapitalRaiseRow[];
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(raises.map((r) => r._id)));
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<CapitalRaiseRow | null>(null);
  const [addInvestorFor, setAddInvestorFor] = useState<string | null>(null);
  const [editingInvestor, setEditingInvestor] = useState<{
    raiseId: string;
    investor: InvestorRow;
  } | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="flex h-full flex-col overflow-auto bg-white">
      <div className="flex items-center justify-between border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-xs">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900">Capital raises</h2>
          <p className="mt-0.5 text-[11px] text-zinc-500">
            Equity rounds and convertible notes. Investor commitments flow into the cash flow
            statement on each funding date — equity bumps the equity balance, convertibles bump
            notes payable. No P&amp;L impact.
          </p>
        </div>
        <div className="flex gap-2">
          <SeedDropdown scenarioId={scenarioId} disabled={pending} />
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700"
          >
            Add raise
          </button>
        </div>
      </div>

      {raises.length === 0 ? (
        <div className="m-6 rounded-md border border-dashed border-zinc-300 p-8 text-center text-xs text-zinc-500">
          No capital raises yet. Click <strong>Add raise</strong> to record an equity round or
          convertible note.
        </div>
      ) : (
        <div className="flex flex-col gap-4 p-4">
          {raises.map((r) => {
            const isOpen = expanded.has(r._id);
            const totalCommitted = totalCommitments(r.investors);
            const target = Number(r.targetSize);
            const pctOfTarget = target > 0 ? (totalCommitted / target) * 100 : 0;
            return (
              <section key={r._id} className="rounded-md border border-zinc-200 bg-white shadow-sm">
                <header className="flex items-center gap-3 border-b border-zinc-100 bg-zinc-50 px-4 py-2">
                  <button
                    type="button"
                    onClick={() => toggle(r._id)}
                    className="text-zinc-500 hover:text-zinc-800"
                    title={isOpen ? "Collapse" : "Expand"}
                  >
                    {isOpen ? "▾" : "▸"}
                  </button>
                  <div className="flex-1">
                    <div className="flex items-baseline gap-3">
                      <span className="text-sm font-semibold text-zinc-900">{r.name}</span>
                      <span className="rounded-md bg-zinc-200 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-zinc-700">
                        {TYPE_LABEL[r.type]}
                      </span>
                      <span className="text-[11px] text-zinc-500">{toIsoDate(r.raiseDate)}</span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-zinc-500">
                      Target ${fmtMoney0(r.targetSize)} · Committed ${fmtMoney0(totalCommitted)} (
                      {pctOfTarget.toFixed(0)}%)
                      {r.discountPct
                        ? ` · Discount ${(Number(r.discountPct) * 100).toFixed(1)}%`
                        : ""}
                      {r.valuationCap ? ` · Cap $${fmtMoney0(r.valuationCap)}` : ""}
                      {r.pricePerUnit
                        ? ` · ${r.type === "equity" ? "Share" : "Note"} price $${r.pricePerUnit}`
                        : ""}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setEditing(r)}
                      className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-[11px] font-medium text-zinc-700 hover:bg-zinc-100"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => setAddInvestorFor(r._id)}
                      className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-[11px] font-medium text-zinc-700 hover:bg-zinc-100"
                    >
                      + Investor
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => {
                        const n = r.investors.filter((i) => i.status === "committed").length;
                        if (n === 0) return;
                        if (
                          !confirm(
                            `Mark all ${n} committed investor${n === 1 ? "" : "s"} on "${r.name}" as funded?`,
                          )
                        )
                          return;
                        startTransition(async () => {
                          await markAllInvestorsFunded(scenarioId, r._id);
                        });
                      }}
                      title="Flip every committed investor on this raise to funded"
                      className="rounded-md border border-emerald-300 bg-white px-2 py-1 text-[11px] font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                    >
                      Mark all funded
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => {
                        if (!confirm(`Delete raise "${r.name}" and all its investors?`)) return;
                        startTransition(async () => {
                          await deleteCapitalRaise(scenarioId, r._id);
                        });
                      }}
                      className="rounded-md border border-red-300 bg-white px-2 py-1 text-[11px] font-medium text-red-700 hover:bg-red-50"
                    >
                      Delete
                    </button>
                  </div>
                </header>

                {isOpen && (
                  <div className="overflow-x-auto">
                    {r.investors.length === 0 ? (
                      <div className="p-4 text-center text-[11px] text-zinc-400">
                        No investors yet.
                      </div>
                    ) : (
                      <table className="w-full text-xs">
                        <thead className="bg-zinc-50 text-[10px] uppercase tracking-wider text-zinc-500">
                          <tr>
                            <th className="px-3 py-1.5 text-left">Investor</th>
                            <th className="px-3 py-1.5 text-right">Commitment</th>
                            <th className="px-3 py-1.5 text-right">
                              {r.type === "equity" ? "Shares" : "Notes"}
                            </th>
                            <th className="px-3 py-1.5 text-center">Funding date</th>
                            <th className="px-3 py-1.5 text-center">Status</th>
                            <th className="px-3 py-1.5 text-left">Notes</th>
                            <th className="px-3 py-1.5"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {r.investors.map((inv) => (
                            <tr key={inv._id} className="border-t border-zinc-100">
                              <td className="px-3 py-1.5 font-medium text-zinc-800">{inv.name}</td>
                              <td className="px-3 py-1.5 text-right tabular-nums">
                                ${fmtMoney0(inv.commitment)}
                              </td>
                              <td className="px-3 py-1.5 text-right tabular-nums text-zinc-500">
                                {inv.numNotes ?? "—"}
                              </td>
                              <td className="px-3 py-1.5 text-center font-mono text-zinc-500">
                                {toIsoDate(inv.fundingDate)}
                              </td>
                              <td className="px-3 py-1.5 text-center">
                                <span
                                  className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${STATUS_TONE[inv.status]}`}
                                >
                                  {STATUS_LABEL[inv.status]}
                                </span>
                              </td>
                              <td className="px-3 py-1.5 text-zinc-500">{inv.notes ?? ""}</td>
                              <td className="px-3 py-1.5 text-right">
                                <div className="flex justify-end gap-1">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setEditingInvestor({ raiseId: r._id, investor: inv })
                                    }
                                    className="text-[11px] text-zinc-600 hover:text-zinc-900 hover:underline"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    disabled={pending}
                                    onClick={() => {
                                      if (!confirm(`Remove ${inv.name}?`)) return;
                                      startTransition(async () => {
                                        await deleteInvestor(scenarioId, r._id, inv._id);
                                      });
                                    }}
                                    className="text-[11px] text-red-600 hover:text-red-800 hover:underline"
                                  >
                                    Delete
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {addOpen && (
        <RaiseModal
          mode="create"
          onClose={() => setAddOpen(false)}
          onSubmit={(payload) =>
            startTransition(async () => {
              await createCapitalRaise(scenarioId, payload);
              setAddOpen(false);
            })
          }
          pending={pending}
        />
      )}
      {editing && (
        <RaiseModal
          mode="edit"
          initial={editing}
          onClose={() => setEditing(null)}
          onSubmit={(payload) =>
            startTransition(async () => {
              await updateCapitalRaise(scenarioId, editing._id, payload);
              setEditing(null);
            })
          }
          pending={pending}
        />
      )}
      {addInvestorFor && (
        <InvestorModal
          mode="create"
          onClose={() => setAddInvestorFor(null)}
          onSubmit={(payload) =>
            startTransition(async () => {
              await addInvestor(scenarioId, addInvestorFor, payload);
              setAddInvestorFor(null);
            })
          }
          pending={pending}
        />
      )}
      {editingInvestor && (
        <InvestorModal
          mode="edit"
          initial={editingInvestor.investor}
          onClose={() => setEditingInvestor(null)}
          onSubmit={(payload) =>
            startTransition(async () => {
              await updateInvestor(
                scenarioId,
                editingInvestor.raiseId,
                editingInvestor.investor._id,
                payload,
              );
              setEditingInvestor(null);
            })
          }
          pending={pending}
        />
      )}
    </div>
  );
}

// ── Modals ──────────────────────────────────────────────────────────────────

function RaiseModal({
  mode,
  initial,
  onClose,
  onSubmit,
  pending,
}: {
  mode: "create" | "edit";
  initial?: CapitalRaiseRow;
  onClose: () => void;
  onSubmit: (payload: CapitalRaisePayload) => void;
  pending: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [type, setType] = useState<CapitalRaiseType>(initial?.type ?? "equity");
  const [raiseDate, setRaiseDate] = useState(
    initial ? toIsoDate(initial.raiseDate) : new Date().toISOString().slice(0, 10),
  );
  const [targetSize, setTargetSize] = useState(initial?.targetSize ?? "");
  // UI takes whole percent (20 = 20%); persist as fraction (0.20).
  const [discountPct, setDiscountPct] = useState(
    initial?.discountPct ? (Number(initial.discountPct) * 100).toString() : "",
  );
  const [valuationCap, setValuationCap] = useState(initial?.valuationCap ?? "");
  const [pricePerUnit, setPricePerUnit] = useState(initial?.pricePerUnit ?? "");

  function submit() {
    if (!name.trim() || !targetSize.trim()) return;
    const discount =
      discountPct.trim() && Number(discountPct) >= 0
        ? (Number(discountPct) / 100).toString()
        : undefined;
    onSubmit({
      name: name.trim(),
      type,
      raiseDate,
      targetSize: targetSize.trim(),
      discountPct: type === "convertible_note" ? discount : undefined,
      valuationCap: type === "convertible_note" ? valuationCap.trim() || undefined : undefined,
      pricePerUnit: pricePerUnit.trim() || undefined,
    });
  }

  return (
    <Overlay onClose={onClose}>
      <h2 className="text-base font-semibold">
        {mode === "create" ? "New capital raise" : "Edit capital raise"}
      </h2>
      <div className="grid grid-cols-2 gap-3 text-xs">
        <Field label="Name" hint="e.g. Series A">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="rounded-md border border-zinc-300 px-2 py-1"
          />
        </Field>
        <Field label="Type">
          <select
            value={type}
            onChange={(e) => setType(e.target.value as CapitalRaiseType)}
            className="rounded-md border border-zinc-300 px-2 py-1"
          >
            <option value="equity">Equity</option>
            <option value="convertible_note">Convertible note</option>
          </select>
        </Field>
        <Field label="Raise date">
          <input
            type="date"
            value={raiseDate}
            onChange={(e) => setRaiseDate(e.target.value)}
            className="rounded-md border border-zinc-300 px-2 py-1"
          />
        </Field>
        <Field label="Target size $">
          <input
            value={targetSize}
            onChange={(e) => setTargetSize(e.target.value)}
            inputMode="decimal"
            className="rounded-md border border-zinc-300 px-2 py-1 text-right tabular-nums"
          />
        </Field>
        <Field label={type === "equity" ? "Price per share" : "Price per note"} hint="optional">
          <input
            value={pricePerUnit}
            onChange={(e) => setPricePerUnit(e.target.value)}
            inputMode="decimal"
            className="rounded-md border border-zinc-300 px-2 py-1 text-right tabular-nums"
          />
        </Field>
        {type === "convertible_note" && (
          <>
            <Field label="Discount %" hint="conversion discount">
              <input
                type="number"
                min={0}
                max={100}
                step="0.1"
                value={discountPct}
                onChange={(e) => setDiscountPct(e.target.value)}
                placeholder="20"
                className="rounded-md border border-zinc-300 px-2 py-1 text-right tabular-nums"
              />
            </Field>
            <Field label="Valuation cap $" hint="optional">
              <input
                value={valuationCap}
                onChange={(e) => setValuationCap(e.target.value)}
                inputMode="decimal"
                className="rounded-md border border-zinc-300 px-2 py-1 text-right tabular-nums"
              />
            </Field>
          </>
        )}
      </div>
      <ModalFooter
        onCancel={onClose}
        onSubmit={submit}
        pending={pending}
        submitLabel={mode === "create" ? "Create raise" : "Save"}
      />
    </Overlay>
  );
}

function InvestorModal({
  mode,
  initial,
  onClose,
  onSubmit,
  pending,
}: {
  mode: "create" | "edit";
  initial?: InvestorRow;
  onClose: () => void;
  onSubmit: (payload: InvestorPayload) => void;
  pending: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [commitment, setCommitment] = useState(initial?.commitment ?? "");
  const [fundingDate, setFundingDate] = useState(
    initial ? toIsoDate(initial.fundingDate) : new Date().toISOString().slice(0, 10),
  );
  const [numNotes, setNumNotes] = useState(
    initial?.numNotes !== undefined ? String(initial.numNotes) : "",
  );
  const [status, setStatus] = useState<InvestorStatus>(initial?.status ?? "committed");
  const [notes, setNotes] = useState(initial?.notes ?? "");

  function submit() {
    if (!name.trim() || !commitment.trim()) return;
    onSubmit({
      name: name.trim(),
      commitment: commitment.trim(),
      fundingDate,
      numNotes: numNotes.trim() ? Number(numNotes) : undefined,
      status,
      notes: notes.trim() || undefined,
    });
  }

  return (
    <Overlay onClose={onClose}>
      <h2 className="text-base font-semibold">
        {mode === "create" ? "Add investor" : "Edit investor"}
      </h2>
      <div className="grid grid-cols-2 gap-3 text-xs">
        <Field label="Investor name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="rounded-md border border-zinc-300 px-2 py-1"
          />
        </Field>
        <Field label="Commitment $">
          <input
            value={commitment}
            onChange={(e) => setCommitment(e.target.value)}
            inputMode="decimal"
            required
            className="rounded-md border border-zinc-300 px-2 py-1 text-right tabular-nums"
          />
        </Field>
        <Field label="Funding date">
          <input
            type="date"
            value={fundingDate}
            onChange={(e) => setFundingDate(e.target.value)}
            className="rounded-md border border-zinc-300 px-2 py-1"
          />
        </Field>
        <Field label="Number of notes / shares" hint="optional">
          <input
            type="number"
            min={0}
            step="1"
            value={numNotes}
            onChange={(e) => setNumNotes(e.target.value)}
            className="rounded-md border border-zinc-300 px-2 py-1 text-right tabular-nums"
          />
        </Field>
        <Field label="Status">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as InvestorStatus)}
            className="rounded-md border border-zinc-300 px-2 py-1"
          >
            <option value="committed">Committed</option>
            <option value="funded">Funded</option>
            <option value="withdrawn">Withdrawn</option>
          </select>
        </Field>
        <Field label="Notes" hint="optional">
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="rounded-md border border-zinc-300 px-2 py-1"
          />
        </Field>
      </div>
      <ModalFooter
        onCancel={onClose}
        onSubmit={submit}
        pending={pending}
        submitLabel={mode === "create" ? "Add investor" : "Save"}
      />
    </Overlay>
  );
}

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <button
        type="button"
        aria-label="Close modal"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/40"
      />
      <div
        role="dialog"
        aria-modal="true"
        className="relative flex w-[620px] max-w-[95vw] flex-col gap-4 rounded-lg bg-white p-6 shadow-xl"
      >
        {children}
      </div>
    </div>
  );
}

function ModalFooter({
  onCancel,
  onSubmit,
  pending,
  submitLabel,
}: {
  onCancel: () => void;
  onSubmit: () => void;
  pending: boolean;
  submitLabel: string;
}) {
  return (
    <div className="flex justify-end gap-2 border-t border-zinc-100 pt-3">
      <button
        type="button"
        onClick={onCancel}
        className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={onSubmit}
        disabled={pending}
        className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
      >
        {pending ? "Saving…" : submitLabel}
      </button>
    </div>
  );
}

function SeedDropdown({ scenarioId, disabled }: { scenarioId: string; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function runSeed() {
    setError(null);
    startTransition(async () => {
      const res = await seedInitialConvertibleNote(scenarioId);
      if (!res.ok) setError(res.error ?? "seed failed");
      setOpen(false);
    });
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled || pending}
        className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50"
      >
        {pending ? "Seeding…" : "Seed ▾"}
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-10 cursor-default bg-transparent"
          />
          <div className="absolute right-0 top-full z-20 mt-1 w-64 rounded-md border border-zinc-200 bg-white py-1 shadow-lg">
            <button
              type="button"
              onClick={runSeed}
              className="block w-full px-3 py-2 text-left text-xs hover:bg-zinc-100"
            >
              <div className="font-medium text-zinc-900">Initial Convertible Note</div>
              <div className="text-[10px] text-zinc-500">
                26 investors · AU$10k per note · total AU$4.52M
              </div>
            </button>
          </div>
        </>
      )}
      {error && (
        <div className="absolute right-0 top-full mt-1 w-72 rounded-md border border-rose-300 bg-rose-50 p-2 text-[11px] text-rose-700 shadow-lg">
          {error}
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
        {label}
        {hint ? <span className="ml-1 font-normal lowercase text-zinc-400">· {hint}</span> : null}
      </span>
      {children}
    </label>
  );
}
