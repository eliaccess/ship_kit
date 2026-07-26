"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import MachinePanel from "@/components/MachinePanel";

const FIELDS = [
  { key: "github_pat", label: "GitHub personal access token", hint: "Lets ShipKit clone your private repositories (read-only Contents permission)." },
  { key: "expo_token", label: "Expo access token", hint: "Powers the Android/iOS build pipeline (expo.dev → Account settings → Access tokens)." },
];

function BackButton() {
  const router = useRouter();
  return (
    <button
      onClick={() => (window.history.length > 1 ? router.back() : router.push("/"))}
      className="-mb-6 rounded-lg border border-stone-300 px-3 py-1.5 text-sm text-stone-600 hover:bg-stone-100"
    >
      ← Back
    </button>
  );
}

export default function SettingsPage() {
  const [presence, setPresence] = useState<Record<string, boolean>>({});
  const [values, setValues] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings").then((r) => r.json()).then(setPresence);
  }, []);

  async function save(key: string) {
    setError(null);
    setSaved(null);
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key, value: values[key] }),
    });
    const data = await res.json();
    if (!res.ok) return setError(data.error ?? "Failed");
    setSaved(key);
    setValues((v) => ({ ...v, [key]: "" }));
    setPresence((p) => ({ ...p, [key]: true }));
  }

  return (
    <div className="max-w-xl space-y-10">
      <BackButton />
      <MachinePanel />
      <h1 className="text-lg font-semibold">Tokens</h1>
      <p className="text-sm text-stone-500">
        Tokens are encrypted at rest. The Setup tab of each project walks you through creating them —
        this page is just where to update them later.
      </p>
      {FIELDS.map((f) => (
        <div key={f.key} className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">{f.label}</label>
            {presence[f.key] && (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">configured</span>
            )}
          </div>
          <p className="mt-1 text-xs text-stone-400">{f.hint}</p>
          <div className="mt-2 flex gap-2">
            <input
              type="password"
              value={values[f.key] ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              placeholder={presence[f.key] ? "•••••••• (paste to replace)" : "Paste token"}
              className="flex-1 rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-stone-500 focus:outline-none"
            />
            <button
              onClick={() => save(f.key)}
              className="rounded-lg bg-stone-900 px-3 py-2 text-sm text-white hover:bg-stone-700"
            >
              Save
            </button>
          </div>
          {saved === f.key && <p className="mt-1 text-xs text-emerald-600">Saved.</p>}
        </div>
      ))}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
