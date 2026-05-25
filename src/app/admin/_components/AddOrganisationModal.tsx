"use client";

import { useRef, useState, useTransition } from "react";
import { createOrganisation } from "../_actions";

export function AddOrganisationModal() {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDialogElement>(null);

  const [name, setName] = useState("");
  const [status, setStatus] = useState<"active" | "pending" | "archived">("active");
  const [notes, setNotes] = useState("");

  function show() {
    setError(null);
    setOpen(true);
    requestAnimationFrame(() => ref.current?.showModal());
  }
  function hide() {
    ref.current?.close();
    setOpen(false);
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await createOrganisation({ name, status, notes });
      if (!res.ok) {
        setError(res.error ?? "Failed to create");
        return;
      }
      setName("");
      setStatus("active");
      setNotes("");
      hide();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={show}
        className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"
      >
        <span className="text-base leading-none">+</span>
        Add organisation
      </button>
      {open && (
        <dialog
          ref={ref}
          onClose={() => setOpen(false)}
          className="fixed inset-0 m-auto w-[520px] max-w-[92vw] rounded-lg border border-zinc-200 p-0 shadow-xl backdrop:bg-zinc-900/40"
        >
          <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4">
            <h2 className="text-base font-semibold tracking-tight text-zinc-900">
              Add organisation
            </h2>
            <button
              type="button"
              onClick={hide}
              className="grid h-7 w-7 place-items-center rounded-md border border-zinc-300 text-zinc-500 hover:bg-zinc-100"
            >
              ×
            </button>
          </div>
          <div className="flex flex-col gap-4 px-6 py-5 text-sm">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-zinc-900">
                Name <span className="text-rose-500">*</span>
              </span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="e.g. Gallantree Capital"
                className="rounded-md border border-zinc-300 px-3 py-2"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-zinc-900">Status</span>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as "active" | "pending" | "archived")}
                className="rounded-md border border-zinc-300 px-3 py-2"
              >
                <option value="active">active</option>
                <option value="pending">pending</option>
                <option value="archived">archived</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-zinc-900">Notes</span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Optional"
                className="rounded-md border border-zinc-300 px-3 py-2"
              />
            </label>
            {error ? (
              <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
                {error}
              </div>
            ) : null}
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-zinc-200 px-6 py-4">
            <button
              type="button"
              onClick={hide}
              disabled={pending}
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={pending || !name.trim()}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {pending ? "Creating…" : "Create"}
            </button>
          </div>
        </dialog>
      )}
    </>
  );
}
