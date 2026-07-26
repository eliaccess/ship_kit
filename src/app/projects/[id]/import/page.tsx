"use client";

import { use, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Project = {
  id: string;
  name: string;
  status: string;
  statusMsg: string | null;
  kind: string | null;
  isExpo: boolean;
};

const CLONE_STEPS = ["Contacting GitHub", "Downloading your code", "Analyzing the project"];

export default function ImportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [project, setProject] = useState<Project | null>(null);
  const [tick, setTick] = useState(0);
  const [pat, setPat] = useState("");
  const [patError, setPatError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const router = useRouter();

  const load = useCallback(
    () => fetch(`/api/projects/${id}`).then((r) => (r.ok ? r.json() : null)).then((p) => p && setProject(p)),
    [id]
  );

  useEffect(() => {
    load();
    const poll = setInterval(load, 2500);
    const anim = setInterval(() => setTick((t) => t + 1), 1800);
    return () => {
      clearInterval(poll);
      clearInterval(anim);
    };
  }, [load]);

  async function retryWithPat() {
    setPatError(null);
    setRetrying(true);
    if (pat.trim()) {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: "github_pat", value: pat.trim() }),
      });
      if (!res.ok) {
        setRetrying(false);
        return setPatError("Couldn't save the token.");
      }
    }
    await fetch(`/api/projects/${id}/sync`, { method: "POST" });
    setRetrying(false);
    setPat("");
    load();
  }

  if (!project) return <Centered><p className="text-sm text-stone-400">Loading…</p></Centered>;

  const working = project.status === "created" || project.status === "cloning";
  const authIssue =
    project.status === "error" &&
    /auth|denied|could not read|invalid username|repository not found|403|404|128/i.test(project.statusMsg ?? "");

  return (
    <Centered>
      <div className="w-full max-w-lg rounded-2xl border border-stone-200 bg-white p-8 shadow-sm">
        <h1 className="text-lg font-semibold">Importing “{project.name}”</h1>

        {working && (
          <div className="mt-6">
            {/* One honest spinner — steps only get a ✓ once the import has REALLY succeeded. */}
            <div className="flex items-center gap-3 text-sm text-stone-700">
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-stone-300 border-t-stone-900" />
              <span>{CLONE_STEPS[Math.min(tick, CLONE_STEPS.length - 1)]}…</span>
            </div>
            <p className="mt-3 text-xs text-stone-400">This usually takes a few seconds. We&apos;ll tell you right away if anything needs your attention.</p>
          </div>
        )}

        {project.status === "error" && (
          <div className="mt-6 space-y-4">
            <div className="flex items-center gap-3 text-sm">
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs text-white">✗</span>
              <span className="font-medium text-red-800">We couldn&apos;t download your code.</span>
            </div>
            {authIssue ? (
              <div className="space-y-3">
                <p className="text-sm text-stone-600">
                  This usually means the repository is <strong>private</strong>. Paste a GitHub access token
                  so ShipKit can read it (nothing else):
                </p>
                <ol className="list-decimal space-y-1 pl-5 text-sm text-stone-600">
                  <li>Open <a className="text-blue-700 underline" href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noreferrer">github.com → Settings → Fine-grained tokens</a></li>
                  <li>Repository access: <em>Only select repositories</em> → pick this repo</li>
                  <li>Permissions → Contents: <em>Read-only</em> → Generate, then copy it</li>
                </ol>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={pat}
                    onChange={(e) => setPat(e.target.value)}
                    placeholder="github_pat_…"
                    className="flex-1 rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-stone-500 focus:outline-none"
                  />
                  <button
                    onClick={retryWithPat}
                    disabled={retrying}
                    className="rounded-lg bg-stone-900 px-4 py-2 text-sm text-white hover:bg-stone-700 disabled:opacity-50"
                  >
                    {retrying ? "Retrying…" : "Save & retry"}
                  </button>
                </div>
                {patError && <p className="text-sm text-red-600">{patError}</p>}
              </div>
            ) : (
              <div className="space-y-3">
                <pre className="max-h-40 overflow-auto rounded-lg bg-stone-50 p-3 text-xs text-stone-600">{project.statusMsg}</pre>
                <p className="text-sm text-stone-600">
                  Double-check the repository URL exists and is reachable, then retry.
                </p>
                <button
                  onClick={retryWithPat}
                  disabled={retrying}
                  className="rounded-lg bg-stone-900 px-4 py-2 text-sm text-white hover:bg-stone-700 disabled:opacity-50"
                >
                  {retrying ? "Retrying…" : "Retry"}
                </button>
              </div>
            )}
          </div>
        )}

        {project.status === "ready" && (
          <div className="mt-6 space-y-4">
            {project.kind === "expo" ? (
              <>
                <Result icon="✓" tone="emerald" title="Native mobile app detected" body="This is already an Expo app — you can set up your accounts and build right away." />
                <button onClick={() => router.push(`/projects/${id}`)} className="w-full rounded-lg bg-stone-900 py-2.5 text-sm font-medium text-white hover:bg-stone-700">
                  Continue to project →
                </button>
              </>
            ) : project.kind === "lovable" || project.kind === "web" ? (
              <>
                <Result
                  icon="↻"
                  tone="amber"
                  title={project.kind === "lovable" ? "Lovable project detected" : "Web app detected"}
                  body="This is a web app. App stores reject web apps in a thin wrapper, so your AI agent will rework it into a real native app — same screens, same branding, native code. It takes a few minutes and you can watch it work."
                />
                <button
                  onClick={() => router.push(`/projects/${id}?tab=Chat&convert=1`)}
                  className="w-full rounded-lg bg-stone-900 py-2.5 text-sm font-medium text-white hover:bg-stone-700"
                >
                  Rework it with AI →
                </button>
                <button onClick={() => router.push(`/projects/${id}`)} className="w-full rounded-lg border border-stone-300 py-2 text-sm text-stone-600 hover:bg-stone-100">
                  Skip for now
                </button>
              </>
            ) : (
              <>
                <Result icon="?" tone="stone" title="Unrecognized project" body={project.statusMsg ?? "We couldn't tell what kind of project this is. You can still open it and ask the AI agent to take a look."} />
                <button onClick={() => router.push(`/projects/${id}`)} className="w-full rounded-lg bg-stone-900 py-2.5 text-sm font-medium text-white hover:bg-stone-700">
                  Open project anyway →
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </Centered>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-[60vh] items-center justify-center">{children}</div>;
}

function Result({ icon, tone, title, body }: { icon: string; tone: string; title: string; body: string }) {
  const tones: Record<string, string> = {
    emerald: "bg-emerald-50 text-emerald-900",
    amber: "bg-amber-50 text-amber-900",
    stone: "bg-stone-50 text-stone-700",
  };
  return (
    <div className={`rounded-xl p-4 ${tones[tone]}`}>
      <p className="font-semibold">{icon} {title}</p>
      <p className="mt-1 text-sm opacity-90">{body}</p>
    </div>
  );
}
