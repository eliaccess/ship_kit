"use client";

import { useCallback, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";

export type DoctorCheck = {
  id: string;
  label: string;
  group: string;
  ok: boolean;
  detail: string;
  fixMarkdown: string | null;
};

type DoctorResponse = { checks: DoctorCheck[]; buildModes: { android: string; ios: string } };

const GROUPS: Record<string, string> = {
  core: "Basics",
  agent: "Coding agent (Chat tab)",
  expo: "Expo (build system)",
  "android-local": "Local Android builds",
  "ios-local": "Local iOS builds",
};

export default function MachinePanel() {
  const [data, setData] = useState<DoctorResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/doctor")
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function setMode(platform: "android" | "ios", mode: "cloud" | "local") {
    await fetch("/api/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: `build_mode_${platform}`, value: mode }),
    });
    load();
  }

  if (!data) return <p className="text-sm text-stone-400">Checking your machine…</p>;

  const groups = [...new Set(data.checks.map((c) => c.group))];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Your machine</h2>
        <button
          onClick={load}
          disabled={loading}
          className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm text-stone-600 hover:bg-stone-100 disabled:opacity-50"
        >
          {loading ? "Checking…" : "↻ Re-check"}
        </button>
      </div>
      <p className="text-sm text-stone-500">
        ShipKit runs entirely on your computer, under your own accounts. Green items are ready;
        open a red item for step-by-step setup instructions.
      </p>

      <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
        <h3 className="mb-2 text-sm font-semibold text-stone-700">Where should builds run?</h3>
        {(["android", "ios"] as const).map((platform) => (
          <div key={platform} className="mb-2 flex items-center gap-3 text-sm">
            <span className="w-16 capitalize">{platform}</span>
            {(["cloud", "local"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setMode(platform, mode)}
                className={`rounded-full px-3 py-1 text-xs ${
                  data.buildModes[platform] === mode
                    ? "bg-stone-900 text-white"
                    : "border border-stone-300 text-stone-600 hover:bg-stone-100"
                }`}
              >
                {mode === "cloud" ? "Cloud (easy, ~30 free builds/mo)" : "Local (unlimited, needs toolchain)"}
              </button>
            ))}
          </div>
        ))}
        <p className="mt-1 text-xs text-stone-400">
          Cloud builds run on Expo&apos;s servers under your Expo account. Local builds run on this machine —
          make sure the matching toolchain below is green first.
        </p>
      </div>

      {groups.map((group) => (
        <div key={group} className="rounded-xl border border-stone-200 bg-white shadow-sm">
          <h3 className="border-b border-stone-100 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
            {GROUPS[group] ?? group}
          </h3>
          {data.checks
            .filter((c) => c.group === group)
            .map((c) => (
              <div key={c.id} className="border-b border-stone-50 last:border-0">
                <button
                  onClick={() => setOpen(open === c.id ? null : c.id)}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left"
                >
                  <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${c.ok ? "bg-emerald-500" : "bg-red-400"}`} />
                  <span className="flex-1 text-sm">{c.label}</span>
                  <span className="max-w-[40%] truncate text-xs text-stone-400">{c.detail}</span>
                </button>
                {open === c.id && c.fixMarkdown && (
                  <div className="prose-instructions border-t border-stone-100 bg-stone-50 px-4 py-3">
                    <ReactMarkdown>{c.fixMarkdown}</ReactMarkdown>
                  </div>
                )}
              </div>
            ))}
        </div>
      ))}
    </div>
  );
}
