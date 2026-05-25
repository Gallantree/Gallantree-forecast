"use client";

import { useRef, useState, useTransition } from "react";
import type { ShareholderPayload } from "../_actions";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const SHARE_CLASSES = ["Founder Shares", "Ordinary", "Preference"];

const DEFAULT_DATE = new Date().toISOString().slice(0, 10);

export function AddShareholderModal({
  saveAction,
  trigger,
  initial,
}: {
  saveAction: (payload: ShareholderPayload) => Promise<void>;
  trigger?: React.ReactNode;
  initial?: ShareholderPayload & { _id?: string };
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const [name, setName] = useState(initial?.name ?? "");
  const [entityTrust, setEntityTrust] = useState(initial?.entityTrust ?? "");
  const [shareClass, setShareClass] = useState(initial?.shareClass ?? "Ordinary");
  const [customClass, setCustomClass] = useState(
    initial?.shareClass && !SHARE_CLASSES.includes(initial.shareClass) ? initial.shareClass : "",
  );
  const [shares, setShares] = useState(initial?.shares ?? "");
  const [pricePerShare, setPricePerShare] = useState(initial?.pricePerShare ?? "");
  const [beneficiallyHeld, setBeneficiallyHeld] = useState(initial?.beneficiallyHeld ?? false);
  const [dateOfIssue, setDateOfIssue] = useState(initial?.dateOfIssue ?? DEFAULT_DATE);

  const effectiveClass = shareClass === "__custom__" ? customClass.trim() : shareClass;

  const sharesNum = Math.floor(Number(shares));
  const priceNum = Number(pricePerShare);
  const totalPaidIn =
    Number.isFinite(sharesNum) && sharesNum > 0 && Number.isFinite(priceNum) && priceNum >= 0
      ? sharesNum * priceNum
      : null;

  const isValid =
    name.trim().length > 0 &&
    effectiveClass.length > 0 &&
    Number.isFinite(sharesNum) &&
    sharesNum >= 1 &&
    Number.isFinite(priceNum) &&
    priceNum >= 0 &&
    DATE_RE.test(dateOfIssue);

  function reset() {
    setName(initial?.name ?? "");
    setEntityTrust(initial?.entityTrust ?? "");
    setShareClass(initial?.shareClass ?? "Ordinary");
    setShares(initial?.shares ?? "");
    setPricePerShare(initial?.pricePerShare ?? "");
    setBeneficiallyHeld(initial?.beneficiallyHeld ?? false);
    setDateOfIssue(initial?.dateOfIssue ?? DEFAULT_DATE);
    setCustomClass("");
  }

  function show() {
    setOpen(true);
    dialogRef.current?.showModal();
  }
  function hide() {
    dialogRef.current?.close();
    setOpen(false);
  }

  function onSave() {
    if (!isValid) return;
    startTransition(async () => {
      await saveAction({
        name: name.trim(),
        entityTrust: entityTrust.trim() || undefined,
        shareClass: effectiveClass,
        shares,
        pricePerShare,
        beneficiallyHeld,
        dateOfIssue,
      });
      if (!initial) reset();
      hide();
    });
  }

  return (
    <div className="inline-flex">
      {trigger ? (
        <button type="button" onClick={show} className="cursor-pointer">
          {trigger}
        </button>
      ) : (
        <button
          type="button"
          onClick={show}
          className="whitespace-nowrap rounded-md bg-zinc-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-zinc-700"
        >
          Add shareholder
        </button>
      )}

      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        className="fixed inset-0 m-auto h-fit max-h-[90vh] w-fit max-w-[95vw] rounded-lg p-0 shadow-xl backdrop:bg-black/40"
      >
        {open && (
          <div className="flex w-[560px] flex-col gap-5 p-6 text-sm">
            <header>
              <h2 className="text-base font-semibold">
                {initial ? "Edit shareholder" : "Add shareholder"}
              </h2>
              <p className="mt-0.5 text-[11px] text-zinc-500">
                Share register entry — all fields flow into the capital table.
              </p>
            </header>

            <div className="grid grid-cols-2 gap-4 text-xs">
              {/* Name */}
              <Field label="Shareholder name" className="col-span-2">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Brett Anthony Hales"
                  autoFocus
                  className="w-full rounded-md border border-zinc-300 px-2 py-1.5"
                />
              </Field>

              {/* Entity / Trust */}
              <Field
                label="Entity / trust"
                hint="leave blank if same as name"
                className="col-span-2"
              >
                <input
                  value={entityTrust}
                  onChange={(e) => setEntityTrust(e.target.value)}
                  placeholder="e.g. Hales Discretionary Trust"
                  className="w-full rounded-md border border-zinc-300 px-2 py-1.5"
                />
              </Field>

              {/* Share class */}
              <Field label="Share class">
                <select
                  value={shareClass}
                  onChange={(e) => setShareClass(e.target.value)}
                  className="w-full rounded-md border border-zinc-300 px-2 py-1.5"
                >
                  {SHARE_CLASSES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                  <option value="__custom__">Custom…</option>
                </select>
                {shareClass === "__custom__" && (
                  <input
                    value={customClass}
                    onChange={(e) => setCustomClass(e.target.value)}
                    placeholder="Class name"
                    className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5"
                  />
                )}
              </Field>

              {/* Beneficially held */}
              <Field label="Beneficially held">
                <div className="flex gap-1 rounded-md bg-zinc-100 p-0.5">
                  {[
                    { label: "Yes", value: true },
                    { label: "No", value: false },
                  ].map((opt) => (
                    <button
                      key={String(opt.value)}
                      type="button"
                      onClick={() => setBeneficiallyHeld(opt.value)}
                      className={[
                        "flex-1 rounded px-3 py-1 text-[11px] font-medium transition",
                        beneficiallyHeld === opt.value
                          ? "bg-white text-zinc-900 shadow"
                          : "text-zinc-600 hover:text-zinc-900",
                      ].join(" ")}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </Field>

              {/* Number of shares */}
              <Field label="Number of shares">
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={shares}
                  onChange={(e) => setShares(e.target.value)}
                  placeholder="0"
                  className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-right tabular-nums"
                />
              </Field>

              {/* Price per share */}
              <Field label="Issue price ($ per share)">
                <input
                  type="number"
                  min={0}
                  step={0.001}
                  value={pricePerShare}
                  onChange={(e) => setPricePerShare(e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-right tabular-nums"
                />
              </Field>

              {/* Date of issue */}
              <Field label="Date of issue">
                <input
                  type="date"
                  value={dateOfIssue}
                  onChange={(e) => setDateOfIssue(e.target.value)}
                  className="w-full rounded-md border border-zinc-300 px-2 py-1.5 font-mono"
                />
              </Field>

              {/* Total paid-in preview */}
              <Field label="Total paid-in" hint="computed">
                <div className="flex h-[30px] items-center justify-end rounded-md border border-zinc-200 bg-zinc-50 px-2 tabular-nums text-zinc-700">
                  {totalPaidIn != null
                    ? `$${totalPaidIn.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    : "—"}
                </div>
              </Field>
            </div>

            <footer className="flex items-center justify-between border-t border-zinc-200 pt-3">
              <button
                type="button"
                onClick={() => {
                  reset();
                  hide();
                }}
                disabled={pending}
                className="rounded-md px-3 py-1 text-xs text-zinc-600 hover:bg-zinc-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onSave}
                disabled={pending || !isValid}
                className="rounded-md bg-zinc-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
              >
                {pending ? "Saving…" : initial ? "Save changes" : "Add shareholder"}
              </button>
            </footer>
          </div>
        )}
      </dialog>
    </div>
  );
}

function Field({
  label,
  hint,
  className,
  children,
}: {
  label: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`flex flex-col gap-1 ${className ?? ""}`}>
      <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
        {label}
        {hint ? <span className="ml-1 font-normal lowercase text-zinc-400">· {hint}</span> : null}
      </span>
      {children}
    </label>
  );
}
