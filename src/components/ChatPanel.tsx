"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";

type Message = { id?: string; role: string; content: string };

export default function ChatPanel({ projectId }: { projectId: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [liveText, setLiveText] = useState("");
  const [liveTools, setLiveTools] = useState<string[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`/api/projects/${projectId}/chat`).then((r) => r.json()).then(setMessages);
  }, [projectId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, liveText, liveTools]);

  async function send() {
    const message = input.trim();
    if (!message || streaming) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content: message }]);
    setStreaming(true);
    setLiveText("");
    setLiveTools([]);

    try {
      const res = await fetch(`/api/projects/${projectId}/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message }),
      });
      if (!res.body) throw new Error("No stream");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          if (!part.startsWith("data: ")) continue;
          const event = JSON.parse(part.slice(6));
          if (event.type === "text") setLiveText((t) => t + event.text + "\n\n");
          else if (event.type === "tool") setLiveTools((t) => [...t.slice(-4), event.name]);
          else if (event.type === "done") finalText = event.result;
          else if (event.type === "error") finalText = `⚠ ${event.message}`;
        }
      }
      setMessages((m) => [...m, { role: "assistant", content: finalText || liveText || "(no reply)" }]);
    } catch (err) {
      setMessages((m) => [...m, { role: "system", content: `Error: ${err instanceof Error ? err.message : err}` }]);
    } finally {
      setStreaming(false);
      setLiveText("");
      setLiveTools([]);
    }
  }

  return (
    <div className="flex h-[70vh] flex-col rounded-xl border border-stone-200 bg-white shadow-sm">
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages.length === 0 && !streaming && (
          <div className="mt-8 text-center text-sm text-stone-400">
            <p className="font-medium text-stone-500">Ask for anything, in plain language.</p>
            <p className="mt-2">“Convert this Lovable web app into an Expo mobile app”</p>
            <p>“Change the main color to dark blue”</p>
            <p>“Add a settings screen with a logout button”</p>
          </div>
        )}
        {messages.map((m, i) => (
          <Bubble key={m.id ?? i} role={m.role} content={m.content} />
        ))}
        {streaming && (
          <div className="space-y-2">
            {liveTools.length > 0 && (
              <p className="text-xs text-stone-400">⚙ working: {liveTools.join(" → ")}</p>
            )}
            <Bubble role="assistant" content={liveText || "Thinking…"} />
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      <div className="flex gap-2 border-t border-stone-100 p-3">
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
          placeholder={streaming ? "Working…" : "Describe the change you want…"}
          disabled={streaming}
          className="flex-1 resize-none rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-stone-500 focus:outline-none disabled:bg-stone-50"
        />
        <button
          onClick={send}
          disabled={streaming || !input.trim()}
          className="rounded-lg bg-stone-900 px-4 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-40"
        >
          Send
        </button>
      </div>
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
