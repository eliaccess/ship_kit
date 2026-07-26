"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type RawFile = { name: string; size: number };

/** Drop zone for raw store screenshots / icon source — lands in the project's store-assets/raw/. */
export default function AssetUpload({ projectId }: { projectId: string }) {
  const [files, setFiles] = useState<RawFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(
    () => fetch(`/api/projects/${projectId}/assets`).then((r) => r.json()).then((d) => setFiles(d.files ?? [])),
    [projectId]
  );
  useEffect(() => {
    load();
  }, [load]);

  async function upload(selected: FileList | null) {
    if (!selected?.length) return;
    setBusy(true);
    setError(null);
    const form = new FormData();
    [...selected].forEach((f) => form.append("files", f));
    const res = await fetch(`/api/projects/${projectId}/assets`, { method: "POST", body: form });
    setBusy(false);
    const data = await res.json();
    if (!res.ok) return setError(data.error ?? "Upload failed");
    load();
  }

  async function remove(name: string) {
    await fetch(`/api/projects/${projectId}/assets?name=${encodeURIComponent(name)}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="mt-4">
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          upload(e.dataTransfer.files);
        }}
        className="cursor-pointer rounded-xl border-2 border-dashed border-stone-300 bg-stone-50 px-4 py-6 text-center text-sm text-stone-500 transition hover:border-stone-400 hover:bg-stone-100"
      >
        {busy ? "Uploading…" : "📷 Drop your screenshots here (or click to choose) — PNG/JPG"}
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => upload(e.target.files)}
        />
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {files.length > 0 && (
        <ul className="mt-3 space-y-1">
          {files.map((f) => (
            <li key={f.name} className="flex items-center gap-2 text-sm text-stone-600">
              <span className="text-emerald-500">✓</span>
              <span className="flex-1 truncate">{f.name}</span>
              <span className="text-xs text-stone-400">{Math.round(f.size / 1024)} KB</span>
              <button onClick={() => remove(f.name)} className="rounded px-1.5 text-stone-300 hover:bg-red-50 hover:text-red-600">
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
