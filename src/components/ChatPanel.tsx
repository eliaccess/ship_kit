"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";

type Message = { id: string; role: string; kind: string; content: string; runId: string | null };
type Run = { id: string; status: "running" | "done" | "error"; error: string | null } | null;

const EMOJI_RE = /^(\p{Extended_Pictographic}(?:️)?(?:‍\p{Extended_Pictographic})*)\s*/u;

export default function ChatPanel({ projectId }: { projectId: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [run, setRun] = useState<Run>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [agentFix, setAgentFix] = useState<string | null>(null);
  const [agentLabel, setAgentLabel] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const countRef = useRef(0);

  const running = run?.status === "running";

  const load = useCallback(async () => {
    const d = await fetch(`/api/projects/${projectId}/chat`).then((r) => r.json());
    setMessages(d.messages ?? []);
    setRun(d.run ?? null);
  }, [projectId]);

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
    if (new URLSearchParams(window.location.search).get("convert") === "1") {
      setInput(
        "This repository is a web app. Please rework it into a native Expo (React Native) mobile app: keep the same screens, features and branding, and make it buildable with EAS. Explain what you did when finished."
      );
    }
  }, [projectId]);

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
          ) : (
            <Bubble key={m.id} role={m.role} content={m.content} />
          )
        )}

        {running && !activeRunHasSteps && <StepRow content="🤔 Reading your request…" active />}
        {run?.status === "error" && run.error && (
          <div className="rounded-xl bg-red-50 px-4 py-2 text-sm text-red-800">⚠ {run.error}</div>
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
