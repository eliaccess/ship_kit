"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";

type Agent = {
  id: string;
  label: string;
  vendor: string;
  capability: string;
  capabilityNote: string;
  installMarkdown: string;
  detected: boolean;
  version: string | null;
};

export default function WelcomePage() {
  const [agents, setAgents] = useState<Agent[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [choice, setChoice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const router = useRouter();

  const load = useCallback(() => {
    setChecking(true);
    fetch("/api/agents")
      .then((r) => r.json())
      .then((d) => {
        setAgents(d.agents);
        setSelected(d.selected);
        setChoice((prev) => prev ?? d.selected ?? d.agents.find((a: Agent) => a.detected)?.id ?? null);
      })
      .finally(() => setChecking(false));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function connect() {
    if (!choice) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/agents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ agent: choice }),
    });
    setBusy(false);
    const data = await res.json();
    if (!res.ok) return setError(data.error ?? "Failed");
    router.push("/");
  }

  if (!agents) return <p className="text-sm text-stone-400">Looking for coding agents on your machine…</p>;

  const anyDetected = agents.some((a) => a.detected);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-semibold">Welcome to ShipKit</h1>
        <p className="mt-2 text-sm text-stone-500">
          ShipKit uses a <strong>coding agent</strong> running on your machine, under your own account,
          to rework your project into a native mobile app and make changes when you chat.
          Pick the one you have — or install one below.
        </p>
      </div>

      <div className="space-y-3">
        {agents.map((a) => (
          <label
            key={a.id}
            className={`block cursor-pointer rounded-xl border bg-white p-4 shadow-sm transition ${
              choice === a.id ? "border-stone-900 ring-1 ring-stone-900" : "border-stone-200 hover:border-stone-400"
            } ${!a.detected ? "opacity-90" : ""}`}
          >
            <div className="flex items-center gap-3">
              <input
                type="radio"
                name="agent"
                checked={choice === a.id}
                onChange={() => setChoice(a.id)}
                className="accent-stone-900"
              />
              <div className="flex-1">
                <span className="text-sm font-semibold">{a.label}</span>
                <span className="ml-2 text-xs text-stone-400">{a.vendor}</span>
                {selected === a.id && (
                  <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">connected</span>
                )}
                <p className="text-xs text-stone-500">{a.capabilityNote}</p>
              </div>
              <span
                className={`rounded-full px-2 py-0.5 text-xs ${
                  a.detected ? "bg-emerald-100 text-emerald-800" : "bg-stone-100 text-stone-500"
                }`}
              >
                {a.detected ? (a.version ?? "installed") : "not installed"}
              </span>
            </div>
            {choice === a.id && !a.detected && (
              <div className="prose-instructions mt-3 rounded-lg bg-stone-50 p-3">
                <ReactMarkdown>{a.installMarkdown}</ReactMarkdown>
              </div>
            )}
          </label>
        ))}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center justify-center gap-3">
        <button
          onClick={load}
          disabled={checking}
          className="rounded-lg border border-stone-300 px-4 py-2 text-sm text-stone-600 hover:bg-stone-100 disabled:opacity-50"
        >
          {checking ? "Checking…" : "↻ Re-check"}
        </button>
        <button
          onClick={connect}
          disabled={busy || !choice || !agents.find((a) => a.id === choice)?.detected}
          className="rounded-lg bg-stone-900 px-6 py-2 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-40"
        >
          {busy ? "Connecting…" : "Connect & continue"}
        </button>
      </div>
      {!anyDetected && (
        <p className="text-center text-xs text-stone-400">
          No agent found yet — pick one above, follow its install steps in a terminal, then Re-check.
        </p>
      )}
    </div>
  );
}
