import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { db } from "../db";
import { workspaceDir } from "../paths";

const SYSTEM_APPEND = [
  "You are the in-app engineer for a non-technical founder using a mobile-app publishing platform.",
  "The current directory is their app's repository. It should become/remain a working Expo (React Native) app buildable with EAS.",
  "If the repo is a web app (e.g. exported from Lovable: React+Vite+Supabase), treat it as the SPEC and convert it: scaffold Expo, recreate the screens/data model natively, keep branding. Never wrap the web app in a WebView.",
  "Commit your changes with git after each coherent change (git add -A && git commit). Explain what you did in plain, non-technical language.",
].join(" ");

/** Reads the stored Claude session id for a project workspace, if any. */
function sessionFile(projectId: string): string {
  return path.join(workspaceDir(projectId), ".shipkit-session");
}

export type ChatEvent =
  | { type: "text"; text: string }
  | { type: "tool"; name: string }
  | { type: "done"; result: string }
  | { type: "error"; message: string };

/**
 * Runs one chat turn against the project's workspace via the local `claude` CLI.
 * Yields streaming events; persists the assistant reply to the DB when done.
 */
export async function* chatTurn(projectId: string, userMessage: string): AsyncGenerator<ChatEvent> {
  const dir = workspaceDir(projectId);
  if (!fs.existsSync(dir)) {
    yield { type: "error", message: "Repository not synced yet. Link the repo first (Overview tab)." };
    return;
  }

  await db.chatMessage.create({ data: { projectId, role: "user", content: userMessage } });

  const args = [
    "-p", userMessage,
    "--output-format", "stream-json",
    "--verbose",
    "--permission-mode", "acceptEdits",
    "--append-system-prompt", SYSTEM_APPEND,
  ];
  let priorSession: string | null = null;
  try {
    priorSession = fs.readFileSync(sessionFile(projectId), "utf8").trim() || null;
  } catch {
    /* first turn */
  }
  if (priorSession) args.push("--resume", priorSession);

  const child = spawn("claude", args, {
    cwd: dir,
    env: { ...process.env },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let buffer = "";
  let finalResult = "";
  let sessionId: string | null = null;
  let stderr = "";
  child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));

  const queue: ChatEvent[] = [];
  let resolveWake: (() => void) | null = null;
  let closed = false;
  const wake = () => {
    resolveWake?.();
    resolveWake = null;
  };

  const handleLine = (line: string) => {
    if (!line.trim()) return;
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }
    if (msg.type === "assistant") {
      const message = msg.message as { content?: Array<Record<string, unknown>> } | undefined;
      for (const block of message?.content ?? []) {
        if (block.type === "text" && typeof block.text === "string") {
          queue.push({ type: "text", text: block.text });
        } else if (block.type === "tool_use" && typeof block.name === "string") {
          queue.push({ type: "tool", name: block.name });
        }
      }
    } else if (msg.type === "result") {
      if (typeof msg.result === "string") finalResult = msg.result;
      if (typeof msg.session_id === "string") sessionId = msg.session_id;
    } else if (msg.type === "system" && typeof msg.session_id === "string") {
      sessionId = msg.session_id;
    }
    wake();
  };

  child.stdout.on("data", (data: Buffer) => {
    buffer += data.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    lines.forEach(handleLine);
  });

  const exitPromise = new Promise<number>((resolve) => {
    child.on("close", (code) => {
      if (buffer) handleLine(buffer);
      closed = true;
      wake();
      resolve(code ?? 1);
    });
    child.on("error", () => {
      closed = true;
      wake();
      resolve(127);
    });
  });

  while (!closed || queue.length > 0) {
    while (queue.length > 0) yield queue.shift()!;
    if (!closed) await new Promise<void>((r) => (resolveWake = r));
  }

  const code = await exitPromise;
  if (sessionId) {
    try {
      fs.writeFileSync(sessionFile(projectId), sessionId);
    } catch {
      /* non-fatal */
    }
  }

  if (code !== 0 && !finalResult) {
    const message = `Chat agent failed (exit ${code}). ${stderr.slice(0, 500)}`;
    await db.chatMessage.create({ data: { projectId, role: "system", content: message } });
    yield { type: "error", message };
    return;
  }

  const reply = finalResult || "(no reply)";
  await db.chatMessage.create({ data: { projectId, role: "assistant", content: reply } });
  yield { type: "done", result: reply };
}
