"use client";

import { useRef, useState, useTransition } from "react";
import { updateOrganisation } from "../_actions";

interface OrgRow {
  _id: string;
  name: string;
  status: string;
  notes?: string;
}

export function EditOrganisationModal({ org }: { org: OrgRow }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDialogElement>(null);

  const [name, setName] = useState(org.name);
  const [status, setStatus] = useState<"active" | "pending" | "archived">(
    org.status as "active" | "pending" | "archived",
  );
  const [notes, setNotes] = useState(org.notes ?? "");

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
      const res = await updateOrganisation(org._id, { name, status, notes });
      if (!res.ok) {
        setError(res.error ?? "Failed to update");
        return;
      }
      hide();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={show}
        className="rounded px-2 py-0.5 text-xs text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
        title="Edit organisation"
      >
        Edit
      </button>
      {open && (
        <dialog
          ref={ref}
          onClose={() => setOpen(false)}
          className="fixed inset-0 m-auto w-[480px] max-w-[92vw] rounded-lg border border-zinc-200 p-0 shadow-xl backdrop:bg-zinc-900/40"
        >
          <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4">
            <h2 className="text-base font-semibold tracking-tight text-zinc-900">
              Edit organisation
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
              {pending ? "Saving…" : "Save changes"}
            </button>
          </div>
        </dialog>
      )}
    </>
  );
}
