"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";

type Message = { id: string; role: string; kind: string; content: string; runId: string | null };
type Run = { id: string; status: "running" | "done" | "error"; error: string | null } | null;

type PlatformReadiness = { platform: "android" | "ios"; mode: string | null; ready: boolean; missing: string[] };

function computeReadiness(
  checks: { id: string; ok: boolean }[],
  modes: { android: string | null; ios: string | null }
): PlatformReadiness[] {
  const ok = (id: string) => checks.find((c) => c.id === id)?.ok ?? false;
  return (["android", "ios"] as const).map((platform) => {
    const mode = modes[platform];
    if (!mode) return { platform, mode, ready: false, missing: ["no method selected yet"] };
    const missing: string[] = [];
    // The token is needed even for local builds: EAS orchestrates them and the
    // app's signing keys live in the user's Expo account (free for local builds).
    if (!ok("expo-token")) missing.push("Expo token — free, holds your app's signing keys, needed even for local builds (Setup tab)");
    if (mode === "local") {
      if (platform === "android") {
        if (!ok("android-sdk")) missing.push("Android SDK");
        if (!ok("java")) missing.push("Java JDK");
      } else {
        if (!ok("xcode")) missing.push("Xcode");
        if (!ok("cocoapods")) missing.push("CocoaPods");
      }
    }
    return { platform, mode, ready: missing.length === 0, missing };
  });
}

const EMOJI_RE = /^(\p{Extended_Pictographic}(?:️)?(?:‍\p{Extended_Pictographic})*)\s*/u;

export default function ChatPanel({
  projectId,
  isExpo,
  hasSuccessfulBuild,
  onShowBuilds,
}: {
  projectId: string;
  isExpo: boolean;
  hasSuccessfulBuild: boolean;
  onShowBuilds: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [run, setRun] = useState<Run>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [agentFix, setAgentFix] = useState<string | null>(null);
  const [agentLabel, setAgentLabel] = useState<string | null>(null);
  const [readiness, setReadiness] = useState<PlatformReadiness[] | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const countRef = useRef(0);
  const prefillDone = useRef(false);

  const running = run?.status === "running";

  const load = useCallback(async () => {
    const d = await fetch(`/api/projects/${projectId}/chat`).then((r) => r.json());
    const msgs: Message[] = d.messages ?? [];
    setMessages(msgs);
    setRun(d.run ?? null);
    // Conversion prefill: only on first arrival, only if the project is still a
    // web app and nothing has been asked yet — then drop the ?convert flag.
    if (!prefillDone.current) {
      prefillDone.current = true;
      const params = new URLSearchParams(window.location.search);
      if (params.get("convert") === "1") {
        const askedBefore = msgs.some((m) => m.role === "user");
        if (!isExpo && !askedBefore) {
          setInput(
            "This repository is a web app. Please rework it into a native Expo (React Native) mobile app: keep the same screens, features and branding, and make it buildable with EAS. Explain what you did when finished."
          );
        }
        params.delete("convert");
        const qs = params.toString();
        window.history.replaceState(null, "", window.location.pathname + (qs ? `?${qs}` : ""));
      }
    }
  }, [projectId, isExpo]);

  useEffect(() => {
    load();
    // Poll continuously: cheap, and it re-attaches to a run after any network cut / reload.
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    fetch("/api/agents")
      .then((r) => r.json())
      .then((d) => {
        if (!d.selected) {
          setAgentLabel(null);
          setAgentFix("No coding agent connected yet. Pick one on the [welcome screen](/welcome) — Claude Code, OpenAI Codex or Gemini CLI.");
          return;
        }
        const active = d.agents?.find((a: { id: string }) => a.id === d.selected);
        if (!active) return;
        setAgentLabel(active.label);
        setAgentFix(
          active.detected
            ? null
            : `Your selected coding agent (**${active.label}**) isn't installed on this machine.\n\n${active.installMarkdown}\n\nOr pick a different agent on the [welcome screen](/welcome).`
        );
      })
      .catch(() => {});
  }, [projectId]);

  // Build readiness for the "ready to build" card (doctor result is server-cached).
  useEffect(() => {
    if (!isExpo) return;
    fetch("/api/doctor")
      .then((r) => r.json())
      .then((d) => setReadiness(computeReadiness(d.checks ?? [], d.buildModes ?? { android: null, ios: null })))
      .catch(() => {});
  }, [projectId, isExpo]);

  useEffect(() => {
    if (messages.length !== countRef.current) {
      countRef.current = messages.length;
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, running]);

  async function send() {
    const message = input.trim();
    if (!message || running || sending) return;
    setSending(true);
    setSendError(null);
    const res = await fetch(`/api/projects/${projectId}/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message }),
    });
    setSending(false);
    const data = await res.json();
    if (!res.ok) return setSendError(data.error ?? "Failed to start");
    setInput("");
    load();
  }

  // Index of the last step of the ACTIVE run — that's the one that glows.
  const lastActiveStepIdx = running
    ? messages.reduce((acc, m, i) => (m.kind === "step" && m.runId === run!.id ? i : acc), -1)
    : -1;
  const activeRunHasSteps = lastActiveStepIdx !== -1;

  return (
    <div className="flex h-[70vh] flex-col rounded-xl border border-stone-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-stone-100 px-4 py-2">
        <span className="text-xs text-stone-400">
          {agentLabel ? (
            <>Powered by <span className="font-medium text-stone-600">{agentLabel}</span> — your account, running on your machine</>
          ) : (
            "No coding agent connected"
          )}
        </span>
        <a href="/welcome" className="text-xs text-blue-700 underline">change agent</a>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {agentFix && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="mb-2 text-sm font-semibold text-amber-900">Connect your coding agent</p>
            <div className="prose-instructions">
              <ReactMarkdown>{agentFix}</ReactMarkdown>
            </div>
          </div>
        )}
        {messages.length === 0 && !running && !agentFix && (
          <div className="mt-8 text-center text-sm text-stone-400">
            <p className="font-medium text-stone-500">Ask for anything, in plain language.</p>
            <p className="mt-2">“Convert this Lovable web app into an Expo mobile app”</p>
            <p>“Change the main color to dark blue”</p>
            <p>“Add a settings screen with a logout button”</p>
          </div>
        )}

        {messages.map((m, i) =>
          m.kind === "step" ? (
            <StepRow key={m.id} content={m.content} active={i === lastActiveStepIdx} />
          ) : m.kind === "action" ? (
            <ActionRow key={m.id} content={m.content} />
          ) : (
            <Bubble key={m.id} role={m.role} content={m.content} />
          )
        )}

        {running && !activeRunHasSteps && <StepRow content="🤔 Reading your request…" active />}
        {run?.status === "error" && run.error && (
          <div className="rounded-xl bg-red-50 px-4 py-2 text-sm text-red-800">⚠ {run.error}</div>
        )}
        {!running && isExpo && !hasSuccessfulBuild && messages.length > 0 && (
          <BuildReadyCard readiness={readiness} onShowBuilds={onShowBuilds} />
        )}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-stone-100 p-3">
        {running && (
          <p className="mb-2 flex items-center gap-2 text-xs text-amber-700">
            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-amber-300 border-t-amber-700" />
            The agent is working — you can close this page and come back, progress is saved.
          </p>
        )}
        {sendError && <p className="mb-2 text-xs text-red-600">{sendError}</p>}
        <div className="flex gap-2">
          <textarea
            rows={2}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={running ? `${agentLabel ?? "The agent"} is working…` : "Describe the change you want…"}
            disabled={running || sending}
            className="flex-1 resize-none rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-stone-500 focus:outline-none disabled:bg-stone-50"
          />
          <button
            onClick={send}
            disabled={running || sending || !input.trim()}
            className="rounded-lg bg-stone-900 px-4 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-40"
          >
            {sending ? "…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}

function BuildReadyCard({
  readiness,
  onShowBuilds,
}: {
  readiness: PlatformReadiness[] | null;
  onShowBuilds: () => void;
}) {
  const allReady = !!readiness && readiness.every((r) => r.ready);
  const modeLabel = (m: string | null) => (m === "cloud" ? "Cloud (Expo servers)" : m === "local" ? "Local (this machine)" : null);
  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
      <p className="text-sm font-semibold text-emerald-900">🎉 Your app is native and ready to build</p>

      {!readiness ? (
        <p className="mt-1 text-sm text-emerald-800">Checking your build setup…</p>
      ) : (
        <div className="mt-2 space-y-1.5">
          {readiness.map((r) => (
            <div key={r.platform} className="flex items-start gap-2 text-sm">
              <span className={`mt-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] text-white ${r.ready ? "bg-emerald-500" : "bg-amber-500"}`}>
                {r.ready ? "✓" : "!"}
              </span>
              <span className={r.ready ? "text-emerald-900" : "text-amber-900"}>
                <span className="font-medium capitalize">{r.platform}</span>
                {r.mode ? (
                  <> — <span className="font-medium">{modeLabel(r.mode)}</span>{r.ready ? " · all set" : ` · missing: ${r.missing.join(", ")}`}</>
                ) : (
                  <> — no build method selected yet</>
                )}
              </span>
            </div>
          ))}
          {!allReady && (
            <p className="pt-1 text-sm text-amber-800">
              Builds can run in the <strong>cloud</strong> (Expo&apos;s servers, zero setup, ~30 free builds/month)
              or <strong>locally</strong> on this machine (unlimited, needs the toolchain). Pick a method for each
              platform below, then come back.
            </p>
          )}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <a
          href="/settings"
          className={`rounded-lg px-3 py-1.5 text-sm ${
            allReady
              ? "border border-emerald-300 bg-white text-emerald-900 hover:bg-emerald-100"
              : "bg-amber-600 font-medium text-white hover:bg-amber-500"
          }`}
        >
          ⚙️ Choose where builds run
        </a>
        <button
          onClick={onShowBuilds}
          disabled={!allReady}
          title={allReady ? undefined : "Finish the build setup first"}
          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          🚀 Start a build
        </button>
        {!allReady && <span className="text-xs text-amber-700">button unlocks once setup is complete</span>}
      </div>
    </div>
  );
}

function ActionRow({ content }: { content: string }) {
  const label = content.replace(/^🙋\s*/, "").replace(/^action needed\s*:\s*/i, "");
  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
      <p className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-amber-700">
        🙋 Action needed — only you can do this
      </p>
      <div className="prose-instructions text-amber-900">
        <ReactMarkdown>{label}</ReactMarkdown>
      </div>
    </div>
  );
}

function StepRow({ content, active }: { content: string; active: boolean }) {
  const match = content.match(EMOJI_RE);
  const emoji = match?.[1] ?? "⚙️";
  const label = match ? content.slice(match[0].length) : content;
  return (
    <div
      className={`flex items-start gap-2.5 rounded-lg px-3 py-2 text-sm transition ${
        active ? "step-running text-amber-900" : "text-stone-500"
      }`}
    >
      <span className="mt-px">{emoji}</span>
      <span className={`min-w-0 flex-1 whitespace-pre-wrap break-words ${active ? "step-glow font-medium" : ""}`}>
        {label}
      </span>
      {!active && <span className="mt-0.5 text-xs text-emerald-500">✓</span>}
    </div>
  );
}

function Bubble({ role, content }: { role: string; content: string }) {
  if (role === "user") {
    return (
      <div className="ml-auto max-w-[80%] rounded-2xl rounded-br-sm bg-stone-900 px-4 py-2 text-sm text-white">
        {content}
      </div>
    );
  }
  return (
    <div className={`max-w-[85%] rounded-2xl rounded-bl-sm px-4 py-2 text-sm ${role === "system" ? "bg-red-50 text-red-800" : "bg-stone-100 text-stone-800"}`}>
      <div className="prose-instructions">
        <ReactMarkdown>{content}</ReactMarkdown>
      </div>
    </div>
  );
}
