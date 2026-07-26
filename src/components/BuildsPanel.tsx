"use client";

import { useCallback, useEffect, useState } from "react";
import type { Build, Project } from "./ProjectView";

export default function BuildsPanel({
  projectId,
  project,
  onChange,
}: {
  projectId: string;
  project: Project;
  onChange: () => void;
}) {
  const [builds, setBuilds] = useState<Build[]>(project.builds);
  const [error, setError] = useState<string | null>(null);
  const [logFor, setLogFor] = useState<string | null>(null);
  const [log, setLog] = useState("");

  const load = useCallback(
    () => fetch(`/api/projects/${projectId}/builds`).then((r) => r.json()).then(setBuilds),
    [projectId]
  );
  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (!logFor) return;
    const fetchLog = () => fetch(`/api/builds/${logFor}/log`).then((r) => r.text()).then(setLog);
    fetchLog();
    const t = setInterval(fetchLog, 4000);
    return () => clearInterval(t);
  }, [logFor]);

  async function trigger(platform: "android" | "ios") {
    setError(null);
    const res = await fetch(`/api/projects/${projectId}/builds`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ platform }),
    });
    const data = await res.json();
    if (!res.ok) return setError(data.error ?? "Failed to start build");
    setLogFor(data.id);
    load();
    onChange();
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <PlatformCard
          title="Android"
          subtitle="Produces an APK you can download and install directly on any Android phone."
          cta="Build Android APK"
          onClick={() => trigger("android")}
        />
        <PlatformCard
          title="iOS"
          subtitle="Builds a signed iOS app. Requires the Apple steps in Setup (developer account + App Store Connect key). Installed via TestFlight."
          cta="Build iOS app"
          onClick={() => trigger("ios")}
        />
      </div>
      {!project.isExpo && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          This repository isn&apos;t a mobile (Expo) app yet. Open the Chat tab and ask:
          “Convert this Lovable web app into an Expo mobile app”.
        </p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <section>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-stone-500">History</h3>
        {builds.length === 0 ? (
          <p className="text-sm text-stone-400">No builds yet.</p>
        ) : (
          <ul className="space-y-2">
            {builds.map((b) => (
              <li key={b.id} className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-medium capitalize">{b.platform}</span>
                  <StatusBadge status={b.status} />
                  <span className="text-xs text-stone-400">{new Date(b.createdAt).toLocaleString()}</span>
                  <span className="flex-1" />
                  {b.status === "success" && b.artifactUrl && (
                    <a
                      href={`/api/builds/${b.id}/artifact`}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500"
                    >
                      ⬇ Download {b.platform === "android" ? "APK" : "build"}
                    </a>
                  )}
                  <button
                    onClick={() => setLogFor(logFor === b.id ? null : b.id)}
                    className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm text-stone-600 hover:bg-stone-100"
                  >
                    {logFor === b.id ? "Hide log" : "View log"}
                  </button>
                </div>
                {b.error && <p className="mt-2 text-sm text-red-600">{b.error}</p>}
                {logFor === b.id && (
                  <pre className="mt-3 max-h-80 overflow-auto rounded-lg bg-stone-950 p-3 text-xs leading-relaxed text-stone-200">
                    {log || "Loading log…"}
                  </pre>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function PlatformCard({ title, subtitle, cta, onClick }: { title: string; subtitle: string; cta: string; onClick: () => void }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-1 min-h-10 text-xs text-stone-500">{subtitle}</p>
      <button onClick={onClick} className="mt-3 rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700">
        {cta}
      </button>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const style =
    status === "success"
      ? "bg-emerald-100 text-emerald-800"
      : status === "failed"
        ? "bg-red-100 text-red-800"
        : "bg-amber-100 text-amber-800";
  return <span className={`rounded-full px-2 py-0.5 text-xs ${style}`}>{status}</span>;
}
