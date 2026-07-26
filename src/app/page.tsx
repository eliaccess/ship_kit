"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Project = {
  id: string;
  name: string;
  repoUrl: string;
  status: string;
  statusMsg: string | null;
  isExpo: boolean;
  createdAt: string;
};

const STATUS_STYLE: Record<string, string> = {
  ready: "bg-emerald-100 text-emerald-800",
  cloning: "bg-amber-100 text-amber-800",
  created: "bg-stone-100 text-stone-600",
  error: "bg-red-100 text-red-800",
};

export default function Dashboard() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [name, setName] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const load = () => fetch("/api/projects").then((r) => r.json()).then(setProjects);
  useEffect(() => {
    // First run: send the user to connect a coding agent.
    fetch("/api/agents")
      .then((r) => r.json())
      .then((d) => {
        if (!d.selected) router.replace("/welcome");
      })
      .catch(() => {});
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function removeProject(e: React.MouseEvent, p: Project) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Delete "${p.name}"? This removes its local workspace, builds and chat history.`)) return;
    await fetch(`/api/projects/${p.id}`, { method: "DELETE" });
    load();
  }

  async function createProject(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, repoUrl }),
    });
    setBusy(false);
    const data = await res.json();
    if (!res.ok) return setError(data.error ?? "Failed");
    router.push(`/projects/${data.id}/import`);
  }

  return (
    <div className="space-y-8">
      <section className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
        <h1 className="text-lg font-semibold">Turn your app idea into a real mobile app</h1>
        <p className="mt-1 text-sm text-stone-500">
          Link the GitHub repository of your project (a Lovable export works). We&apos;ll guide you through
          every account and credential, then produce installable Android &amp; iOS builds.
        </p>
        <form onSubmit={createProject} className="mt-4 flex flex-col gap-3 sm:flex-row">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="App name (e.g. My Fitness App)"
            required
            className="flex-1 rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-stone-500 focus:outline-none"
          />
          <input
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            placeholder="https://github.com/you/your-repo"
            required
            className="flex-[2] rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-stone-500 focus:outline-none"
          />
          <button
            disabled={busy}
            className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-50"
          >
            {busy ? "Creating…" : "Create project"}
          </button>
        </form>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <p className="mt-2 text-xs text-stone-400">
          Private repo? Add a GitHub token in the project&apos;s Setup tab (or Settings) — cloning retries with it.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-500">Your projects</h2>
        {projects.length === 0 ? (
          <p className="text-sm text-stone-400">No projects yet.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {projects.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/projects/${p.id}`}
                  className="group block rounded-xl border border-stone-200 bg-white p-4 shadow-sm transition hover:border-stone-400"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{p.name}</span>
                    <span className="flex items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLE[p.status] ?? "bg-stone-100"}`}>
                        {p.status}
                      </span>
                      <button
                        onClick={(e) => removeProject(e, p)}
                        title="Delete project"
                        className="rounded-md px-1.5 py-0.5 text-stone-300 opacity-0 transition hover:bg-red-50 hover:text-red-600 group-hover:opacity-100"
                      >
                        ✕
                      </button>
                    </span>
                  </div>
                  <p className="mt-1 truncate text-xs text-stone-500">{p.repoUrl}</p>
                  {p.statusMsg && <p className="mt-2 line-clamp-2 text-xs text-stone-400">{p.statusMsg}</p>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
