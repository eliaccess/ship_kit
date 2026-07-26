"use client";

import { useCallback, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";

type WizardInput = { name: string; label: string; type: "text" | "textarea"; secret: boolean; placeholder?: string };

type Step = {
  id: string;
  phase: string;
  optional: boolean;
  requires: string[];
  title: string;
  summary: string;
  clockNote: string | null;
  instructionsMarkdown: string;
  verifyHints: string | null;
  inputs: WizardInput[];
  status: "pending" | "done" | "skipped";
  data: Record<string, string> | null;
};

export default function WizardPanel({ projectId }: { projectId: string }) {
  const [steps, setSteps] = useState<Step[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    () => fetch(`/api/projects/${projectId}/wizard`).then((r) => r.json()).then(setSteps),
    [projectId]
  );
  useEffect(() => {
    load();
  }, [load]);

  async function submit(step: Step, action: "complete" | "skip" | "reset") {
    setBusy(true);
    setErrors((e) => ({ ...e, [step.id]: "" }));
    const res = await fetch(`/api/projects/${projectId}/wizard`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        stepId: step.id,
        action,
        values: Object.fromEntries(step.inputs.map((i) => [i.name, values[`${step.id}.${i.name}`] ?? ""])),
      }),
    });
    setBusy(false);
    const data = await res.json();
    if (!res.ok) return setErrors((e) => ({ ...e, [step.id]: data.error ?? "Failed" }));
    if (action === "complete") setOpen(null);
    load();
  }

  const phases = [...new Set(steps.map((s) => s.phase))];
  const byId = new Map(steps.map((s) => [s.id, s]));

  return (
    <div className="space-y-6">
      {phases.map((phase) => (
        <section key={phase}>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-stone-500">{phase}</h2>
          <div className="space-y-2">
            {steps
              .filter((s) => s.phase === phase)
              .map((step) => {
                const blocked = step.requires.filter((r) => byId.get(r)?.status !== "done");
                const isOpen = open === step.id;
                return (
                  <div key={step.id} className="rounded-xl border border-stone-200 bg-white shadow-sm">
                    <button
                      onClick={() => setOpen(isOpen ? null : step.id)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left"
                    >
                      <StatusDot status={step.status} />
                      <span className="flex-1">
                        <span className="text-sm font-medium">{step.title}</span>
                        {step.optional && <span className="ml-2 text-xs text-stone-400">(optional)</span>}
                        <span className="block text-xs text-stone-500">{step.summary}</span>
                      </span>
                      <span className="text-stone-400">{isOpen ? "−" : "+"}</span>
                    </button>
                    {isOpen && (
                      <div className="border-t border-stone-100 px-4 py-4">
                        {step.clockNote && (
                          <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                            ⏱ {step.clockNote}
                          </p>
                        )}
                        {blocked.length > 0 && (
                          <p className="mb-3 rounded-lg bg-stone-100 px-3 py-2 text-xs text-stone-600">
                            Recommended first: {blocked.map((b) => byId.get(b)?.title ?? b).join(", ")}
                          </p>
                        )}
                        <div className="prose-instructions">
                          <ReactMarkdown>{step.instructionsMarkdown}</ReactMarkdown>
                        </div>
                        {step.inputs.length > 0 && (
                          <div className="mt-4 space-y-3">
                            {step.inputs.map((input) => (
                              <div key={input.name}>
                                <label className="mb-1 block text-xs font-medium text-stone-600">{input.label}</label>
                                {input.type === "textarea" ? (
                                  <textarea
                                    rows={4}
                                    value={values[`${step.id}.${input.name}`] ?? ""}
                                    onChange={(e) => setValues((v) => ({ ...v, [`${step.id}.${input.name}`]: e.target.value }))}
                                    placeholder={input.placeholder}
                                    className="w-full rounded-lg border border-stone-300 px-3 py-2 font-mono text-xs focus:border-stone-500 focus:outline-none"
                                  />
                                ) : (
                                  <input
                                    type={input.secret ? "password" : "text"}
                                    value={values[`${step.id}.${input.name}`] ?? (step.data?.[input.name] ?? "")}
                                    onChange={(e) => setValues((v) => ({ ...v, [`${step.id}.${input.name}`]: e.target.value }))}
                                    placeholder={input.placeholder}
                                    className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-stone-500 focus:outline-none"
                                  />
                                )}
                              </div>
                            ))}
                            {step.verifyHints && <p className="text-xs text-stone-400">✓ {step.verifyHints}</p>}
                          </div>
                        )}
                        {errors[step.id] && <p className="mt-2 text-sm text-red-600">{errors[step.id]}</p>}
                        <div className="mt-4 flex gap-2">
                          <button
                            disabled={busy}
                            onClick={() => submit(step, "complete")}
                            className="rounded-lg bg-stone-900 px-4 py-1.5 text-sm text-white hover:bg-stone-700 disabled:opacity-50"
                          >
                            {step.inputs.length > 0 ? "Save & mark done" : "Mark done"}
                          </button>
                          {step.optional && step.status !== "skipped" && (
                            <button
                              disabled={busy}
                              onClick={() => submit(step, "skip")}
                              className="rounded-lg border border-stone-300 px-4 py-1.5 text-sm text-stone-600 hover:bg-stone-100"
                            >
                              Skip
                            </button>
                          )}
                          {step.status !== "pending" && (
                            <button
                              disabled={busy}
                              onClick={() => submit(step, "reset")}
                              className="rounded-lg border border-stone-300 px-4 py-1.5 text-sm text-stone-600 hover:bg-stone-100"
                            >
                              Reset
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </section>
      ))}
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const style =
    status === "done" ? "bg-emerald-500" : status === "skipped" ? "bg-stone-300" : "border-2 border-stone-300 bg-white";
  return <span className={`inline-block h-3.5 w-3.5 shrink-0 rounded-full ${style}`} />;
}
