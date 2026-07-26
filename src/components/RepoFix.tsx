"use client";

import { useState } from "react";

export function isAuthIssue(statusMsg: string | null): boolean {
  return /auth|denied|could not read|invalid username|repository not found|403|404|128|device not configured/i.test(
    statusMsg ?? ""
  );
}

/** Guided recovery for a failed repo download — shared by the import page and the project Overview. */
export default function RepoFix({
  projectId,
  statusMsg,
  onRetried,
}: {
  projectId: string;
  statusMsg: string | null;
  onRetried?: () => void;
}) {
  const [pat, setPat] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const auth = isAuthIssue(statusMsg);

  async function retry() {
    setError(null);
    setRetrying(true);
    if (pat.trim()) {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: "github_pat", value: pat.trim() }),
      });
      if (!res.ok) {
        setRetrying(false);
        return setError("Couldn't save the token.");
      }
    }
    await fetch(`/api/projects/${projectId}/sync`, { method: "POST" });
    setRetrying(false);
    setPat("");
    onRetried?.();
  }

  return (
    <div className="space-y-3">
      {auth ? (
        <>
          <p className="text-sm text-stone-600">
            This usually means the repository is <strong>private</strong>. Paste a GitHub access token so
            ShipKit can read it (nothing else):
          </p>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-stone-600">
            <li>
              Open{" "}
              <a
                className="text-blue-700 underline"
                href="https://github.com/settings/personal-access-tokens/new"
                target="_blank"
                rel="noreferrer"
              >
                github.com → Settings → Fine-grained tokens
              </a>
            </li>
            <li>Repository access: <em>Only select repositories</em> → pick this repo</li>
            <li>Permissions → Contents: <em>Read-only</em> → Generate, then copy it</li>
          </ol>
          <div className="flex gap-2">
            <input
              type="password"
              value={pat}
              onChange={(e) => setPat(e.target.value)}
              placeholder="github_pat_…"
              className="min-w-0 flex-1 rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-stone-500 focus:outline-none"
            />
            <button
              onClick={retry}
              disabled={retrying}
              className="shrink-0 rounded-lg bg-stone-900 px-4 py-2 text-sm text-white hover:bg-stone-700 disabled:opacity-50"
            >
              {retrying ? "Retrying…" : "Save & retry"}
            </button>
          </div>
        </>
      ) : (
        <>
          <pre className="max-h-40 overflow-auto rounded-lg bg-stone-50 p-3 text-xs text-stone-600">{statusMsg}</pre>
          <p className="text-sm text-stone-600">Double-check the repository URL exists and is reachable, then retry.</p>
          <button
            onClick={retry}
            disabled={retrying}
            className="rounded-lg bg-stone-900 px-4 py-2 text-sm text-white hover:bg-stone-700 disabled:opacity-50"
          >
            {retrying ? "Retrying…" : "Retry"}
          </button>
        </>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
