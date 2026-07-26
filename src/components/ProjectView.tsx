"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import WizardPanel from "./WizardPanel";
import BuildsPanel from "./BuildsPanel";
import ChatPanel from "./ChatPanel";
import RepoFix from "./RepoFix";

export type Project = {
  id: string;
  name: string;
  repoUrl: string;
  status: string;
  statusMsg: string | null;
  isExpo: boolean;
  appName: string | null;
  bundleId: string | null;
  builds: Build[];
  wizardSteps: { stepId: string; status: string }[];
};

export type Build = {
  id: string;
  platform: string;
  profile: string;
  status: string;
  artifactUrl: string | null;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
};

const TABS = ["Overview", "Setup", "Builds", "Chat"] as const;
type Tab = (typeof TABS)[number];

export default function ProjectView({ id }: { id: string }) {
  const [project, setProject] = useState<Project | null>(null);
  const [tab, setTab] = useState<Tab>("Overview");
  const router = useRouter();

  useEffect(() => {
    // Deep-link support: /projects/x?tab=Chat
    const wanted = new URLSearchParams(window.location.search).get("tab");
    if (wanted && (TABS as readonly string[]).includes(wanted)) setTab(wanted as Tab);
  }, []);

  async function removeProject() {
    if (!project) return;
    if (!confirm(`Delete "${project.name}"? This removes its local workspace, builds and chat history.`)) return;
    await fetch(`/api/projects/${id}`, { method: "DELETE" });
    router.push("/");
  }

  const load = useCallback(
    () =>
      fetch(`/api/projects/${id}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((p) => p && setProject(p)),
    [id]
  );

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  if (!project) return <p className="text-sm text-stone-400">Loading…</p>;

  const doneSteps = project.wizardSteps.filter((s) => s.status === "done").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{project.name}</h1>
          <p className="text-xs text-stone-500">{project.repoUrl}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => fetch(`/api/projects/${id}/sync`, { method: "POST" }).then(load)}
            className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm text-stone-700 hover:bg-stone-100"
          >
            ↻ Sync repo
          </button>
          <button
            onClick={removeProject}
            className="rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
          >
            Delete
          </button>
        </div>
      </div>

      <nav className="flex gap-1 rounded-xl bg-stone-200/60 p-1 text-sm">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-lg px-3 py-1.5 transition ${
              tab === t ? "bg-white font-medium shadow-sm" : "text-stone-600 hover:text-stone-900"
            }`}
          >
            {t}
          </button>
        ))}
      </nav>

      {tab === "Overview" && (
        <div className="grid gap-4 sm:grid-cols-2">
          {project.status === "error" ? (
            <div className="rounded-xl border border-red-200 bg-white p-4 shadow-sm sm:col-span-2">
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-red-700">
                <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] text-white">✗</span>
                Repository — we couldn&apos;t download your code
              </h3>
              <RepoFix projectId={id} statusMsg={project.statusMsg} onRetried={load} />
            </div>
          ) : (
            <Card title="Repository">
              <StatusRow ok={project.status === "ready"} label={`Status: ${project.status}`} />
              <StatusRow
                ok={project.isExpo}
                label={project.isExpo ? "Expo app detected — buildable" : "Not an Expo app yet — convert it in Chat"}
              />
              {project.statusMsg && <p className="mt-2 text-xs text-stone-500">{project.statusMsg}</p>}
            </Card>
          )}
          <Card title="App identity">
            <StatusRow ok={!!project.appName} label={project.appName ? `Name: ${project.appName}` : "No app name set"} />
            <StatusRow ok={!!project.bundleId} label={project.bundleId ? `Bundle ID: ${project.bundleId}` : "No bundle ID set"} />
            <p className="mt-2 text-xs text-stone-400">Set these in the Setup tab (step "App identity").</p>
          </Card>
          <Card title="Setup progress">
            <p className="text-2xl font-semibold">{doneSteps}<span className="text-sm font-normal text-stone-400"> steps done</span></p>
            <p className="mt-1 text-xs text-stone-400">The Setup tab walks you through accounts &amp; credentials — start the Apple step first, it takes 24–48h.</p>
          </Card>
          <Card title="Latest builds">
            {project.builds.length === 0 ? (
              <p className="text-sm text-stone-400">No builds yet — head to the Builds tab.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {project.builds.slice(0, 3).map((b) => (
                  <li key={b.id} className="flex justify-between">
                    <span className="capitalize">{b.platform}</span>
                    <span className={b.status === "success" ? "text-emerald-600" : b.status === "failed" ? "text-red-600" : "text-amber-600"}>
                      {b.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}

      {tab === "Setup" && <WizardPanel projectId={id} />}
      {tab === "Builds" && <BuildsPanel projectId={id} project={project} onChange={load} />}
      {tab === "Chat" && <ChatPanel projectId={id} />}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
      <h3 className="mb-2 text-sm font-semibold text-stone-700">{title}</h3>
      {children}
    </div>
  );
}

function StatusRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <p className="flex items-center gap-2 text-sm">
      <span className={`inline-block h-2 w-2 rounded-full ${ok ? "bg-emerald-500" : "bg-stone-300"}`} />
      {label}
    </p>
  );
}
