"use client";

import { useEffect, useState, useTransition } from "react";

export function LoanProgramSelect({
  currentProgramId,
  channelLabel,
  programs,
  saveAction,
}: {
  currentProgramId?: string;
  channelLabel: string;
  programs: { _id: string; name: string }[];
  saveAction: (formData: FormData) => Promise<void>;
}) {
  const [value, setValue] = useState(currentProgramId ?? "");
  const [pending, startTransition] = useTransition();

  // Re-sync if the server sends a different value on revalidation (e.g. another
  // tab updated the same loan). The user's latest in-flight pick stays put
  // until pending resolves.
  useEffect(() => {
    if (!pending) setValue(currentProgramId ?? "");
  }, [currentProgramId, pending]);

  function handleChange(next: string) {
    setValue(next);
    const fd = new FormData();
    fd.set("capitalProgramId", next);
    startTransition(async () => {
      await saveAction(fd);
    });
  }

  const isAssigned = value !== "";

  return (
    <select
      value={value}
      onChange={(e) => handleChange(e.target.value)}
      disabled={pending}
      className={`w-44 rounded-md border px-1 py-0.5 text-xs transition ${
        pending ? "opacity-60" : ""
      } ${
        isAssigned
          ? "border-zinc-300 bg-white"
          : "border-dashed border-zinc-300 bg-zinc-50 text-zinc-500"
      }`}
    >
      <option value="">— Unassigned ({channelLabel}) —</option>
      {programs.map((p) => (
        <option key={p._id} value={p._id}>
          {p.name}
        </option>
      ))}
    </select>
  );
}
