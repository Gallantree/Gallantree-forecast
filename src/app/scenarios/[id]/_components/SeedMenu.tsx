"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { SeedResult } from "../_actions";

type SeedAction = (scenarioId: string) => Promise<SeedResult>;

interface SeedOption {
  key: string;
  label: string;
  description: string;
  // Optional — when present, used as a fallback if the streaming endpoint
  // is unreachable. The primary path is the streaming /seed route.
  action?: SeedAction;
}

// Runs the seed via the streaming route handler so Heroku's 30s router
// timeout never fires on slow AI calls — bytes are flushed every 10s and the
// final non-empty line is the SeedResult JSON.
async function runStreamingSeed(scenarioId: string, kind: string): Promise<SeedResult> {
  const res = await fetch(`/api/scenarios/${scenarioId}/seed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind }),
  });
  if (!res.ok || !res.body) {
    return { ok: false, error: `HTTP ${res.status}` };
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { value, done } = await reader.read();
    if (value) buf += decoder.decode(value, { stream: true });
    if (done) break;
  }
  buf += decoder.decode();
  const lines = buf
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const last = lines[lines.length - 1];
  if (!last) return { ok: false, error: "empty seed response" };
  try {
    return JSON.parse(last) as SeedResult;
  } catch {
    return { ok: false, error: "malformed seed response" };
  }
}

export function SeedMenu({
  scenarioId,
  enabled,
  options,
}: {
  scenarioId: string;
  enabled: boolean;
  options: SeedOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [toast, setToast] = useState<{ msg: string; tone: "ok" | "warn" } | null>(null);

  function run(opt: SeedOption) {
    setOpen(false);
    setRunning(opt.key);
    setToast({ msg: `Asking Claude to generate ${opt.label.toLowerCase()}…`, tone: "ok" });
    startTransition(async () => {
      const res = await runStreamingSeed(scenarioId, opt.key);
      setRunning(null);
      if (res.ok) {
        setToast({
          msg: `Seeded ${res.created} ${opt.label.toLowerCase()} record(s).`,
          tone: "ok",
        });
        router.refresh();
        setTimeout(() => setToast(null), 4000);
      } else {
        setToast({
          msg: `Seed failed: ${res.error ?? "unknown error"}`,
          tone: "warn",
        });
        setTimeout(() => setToast(null), 8000);
      }
    });
  }

  if (!enabled) {
    return (
      <button
        type="button"
        disabled
        title="Set ANTHROPIC_API_KEY in .env.development.local to enable seeding"
        className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-400"
      >
        Seed (disabled)
      </button>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={pending}
        className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50"
      >
        {pending && running
          ? `Seeding ${options.find((o) => o.key === running)?.label}…`
          : "Seed ▾"}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="absolute right-0 z-40 mt-1 w-72 rounded-md border border-zinc-200 bg-white shadow-lg">
            <div className="border-b border-zinc-100 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              AI-generated seed (Claude)
            </div>
            {options.map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => run(opt)}
                className="block w-full border-b border-zinc-100 px-3 py-2 text-left last:border-b-0 hover:bg-zinc-50"
              >
                <div className="text-xs font-semibold text-zinc-900">{opt.label}</div>
                <div className="text-[11px] text-zinc-500">{opt.description}</div>
              </button>
            ))}
          </div>
        </>
      )}
      {toast && (
        <div
          className={`fixed bottom-4 right-4 z-50 rounded-md px-4 py-2 text-xs font-medium shadow-lg ${
            toast.tone === "warn"
              ? "bg-rose-50 text-rose-800 ring-1 ring-rose-200"
              : "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200"
          }`}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}
