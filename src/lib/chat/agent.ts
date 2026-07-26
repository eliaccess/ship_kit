import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { db } from "../db";
import { workspaceDir } from "../paths";
import { getSelectedAgent, AgentId, AGENTS } from "../agents";

const BRIEF = [
  "You are the in-app engineer for a non-technical founder using a mobile-app publishing platform.",
  "The current directory is their app's repository. It should become/remain a working Expo (React Native) app buildable with EAS.",
  "If the repo is a web app (e.g. exported from Lovable: React+Vite+Supabase), treat it as the SPEC and convert it: scaffold Expo, recreate the screens/data model natively, keep branding. Never wrap the web app in a WebView.",
  "Commit your changes with git after each coherent change (git add -A && git commit). Explain what you did in plain, non-technical language.",
].join(" ");

export type ChatEvent =
  | { type: "text"; text: string }
  | { type: "tool"; name: string }
  | { type: "done"; result: string }
  | { type: "error"; message: string };

function sessionFile(projectId: string, agent: AgentId): string {
  return path.join(workspaceDir(projectId), `.shipkit-session-${agent}`);
}

function readSession(projectId: string, agent: AgentId): string | null {
  try {
    return fs.readFileSync(sessionFile(projectId, agent), "utf8").trim() || null;
  } catch {
    return null;
  }
}

type Spawned = {
  events: AsyncGenerator<ChatEvent>;
};

/** Generic line-oriented subprocess → ChatEvent stream. */
function streamProcess(
  cmd: string,
  args: string[],
  cwd: string,
  onLine: (line: string, emit: (e: ChatEvent) => void) => void,
  onExit: (code: number, stderr: string, emit: (e: ChatEvent) => void) => void
): Spawned {
  async function* events(): AsyncGenerator<ChatEvent> {
    const child = spawn(cmd, args, { cwd, env: { ...process.env }, stdio: ["ignore", "pipe", "pipe"] });
    const queue: ChatEvent[] = [];
    let closed = false;
    let stderr = "";
    let resolveWake: (() => void) | null = null;
    const wake = () => {
      resolveWake?.();
      resolveWake = null;
    };
    const emit = (e: ChatEvent) => {
      queue.push(e);
      wake();
    };

    let buffer = "";
    child.stdout.on("data", (d: Buffer) => {
      buffer += d.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) if (line.trim()) onLine(line, emit);
    });
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
    const exit = new Promise<void>((resolve) => {
      const finish = (code: number) => {
        if (buffer.trim()) onLine(buffer, emit);
        onExit(code, stderr, emit);
        closed = true;
        wake();
        resolve();
      };
      child.on("close", (code) => finish(code ?? 1));
      child.on("error", () => finish(127));
    });

    while (!closed || queue.length > 0) {
      while (queue.length > 0) yield queue.shift()!;
      if (!closed) await new Promise<void>((r) => (resolveWake = r));
    }
    await exit;
  }
  return { events: events() };
}

// ── Claude Code ───────────────────────────────────────────────────────────
function runClaude(projectId: string, dir: string, message: string): Spawned {
  const args = [
    "-p", message,
    "--output-format", "stream-json",
    "--verbose",
    "--permission-mode", "acceptEdits",
    "--append-system-prompt", BRIEF,
  ];
  const prior = readSession(projectId, "claude");
  if (prior) args.push("--resume", prior);

  let result = "";
  let sid: string | null = null;
  return streamProcess(
    "claude",
    args,
    dir,
    (line, emit) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(line);
      } catch {
        return;
      }
      if (msg.type === "assistant") {
        const m = msg.message as { content?: Array<Record<string, unknown>> } | undefined;
        for (const block of m?.content ?? []) {
          if (block.type === "text" && typeof block.text === "string") emit({ type: "text", text: block.text });
          else if (block.type === "tool_use" && typeof block.name === "string") emit({ type: "tool", name: block.name });
        }
      } else if (msg.type === "result") {
        if (typeof msg.result === "string") result = msg.result;
        if (typeof msg.session_id === "string") sid = msg.session_id;
      } else if (msg.type === "system" && typeof msg.session_id === "string") {
        sid = msg.session_id;
      }
    },
    (code, stderr, emit) => {
      if (sid) try { fs.writeFileSync(sessionFile(projectId, "claude"), sid); } catch {}
      if (code !== 0 && !result) emit({ type: "error", message: `Claude Code failed (exit ${code}). ${stderr.slice(0, 500)}` });
      else emit({ type: "done", result: result || "(no reply)" });
    }
  );
}

// ── OpenAI Codex CLI ──────────────────────────────────────────────────────
function runCodex(projectId: string, dir: string, message: string): Spawned {
  const prompt = `[Platform instructions: ${BRIEF}]\n\n${message}`;
  const prior = readSession(projectId, "codex");
  const args = prior
    ? ["exec", "resume", prior, "--json", "--full-auto", prompt]
    : ["exec", "--json", "--full-auto", prompt];

  let result = "";
  let sid: string | null = null;
  return streamProcess(
    "codex",
    args,
    dir,
    (line, emit) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(line);
      } catch {
        return;
      }
      // Session id shows up as thread_id / session_id depending on CLI version.
      for (const key of ["thread_id", "session_id"]) {
        if (typeof msg[key] === "string") sid = msg[key] as string;
      }
      const item = msg.item as Record<string, unknown> | undefined;
      if (msg.type === "item.completed" && item) {
        if (item.type === "agent_message" && typeof item.text === "string") {
          result = item.text;
          emit({ type: "text", text: item.text });
        } else if (item.type === "command_execution") {
          emit({ type: "tool", name: "shell" });
        }
      }
      const legacy = msg.msg as Record<string, unknown> | undefined;
      if (legacy?.type === "agent_message" && typeof legacy.message === "string") {
        result = legacy.message;
        emit({ type: "text", text: legacy.message });
      }
    },
    (code, stderr, emit) => {
      if (sid) try { fs.writeFileSync(sessionFile(projectId, "codex"), sid); } catch {}
      if (code !== 0 && !result) emit({ type: "error", message: `Codex failed (exit ${code}). ${stderr.slice(0, 500)}` });
      else emit({ type: "done", result: result || "(no reply)" });
    }
  );
}

// ── Google Gemini CLI (basic: plain text, no cross-message memory) ───────
function runGemini(_projectId: string, dir: string, message: string): Spawned {
  const prompt = `[Platform instructions: ${BRIEF}]\n\n${message}`;
  let output = "";
  return streamProcess(
    "gemini",
    ["-p", prompt, "--yolo"],
    dir,
    (line, emit) => {
      output += line + "\n";
      emit({ type: "text", text: line });
    },
    (code, stderr, emit) => {
      if (code !== 0 && !output.trim()) emit({ type: "error", message: `Gemini failed (exit ${code}). ${stderr.slice(0, 500)}` });
      else emit({ type: "done", result: output.trim() || "(no reply)" });
    }
  );
}

const RUNNERS: Record<AgentId, (projectId: string, dir: string, message: string) => Spawned> = {
  claude: runClaude,
  codex: runCodex,
  gemini: runGemini,
};

export async function* chatTurn(projectId: string, userMessage: string): AsyncGenerator<ChatEvent> {
  const dir = workspaceDir(projectId);
  if (!fs.existsSync(dir)) {
    yield { type: "error", message: "Repository not synced yet. Link the repo first (Overview tab)." };
    return;
  }
  const agentId = await getSelectedAgent();
  if (!agentId) {
    yield {
      type: "error",
      message: "No coding agent connected yet. Open the welcome screen (/welcome) to pick one (Claude Code, Codex or Gemini).",
    };
    return;
  }
  const agent = AGENTS.find((a) => a.id === agentId)!;

  await db.chatMessage.create({ data: { projectId, role: "user", content: userMessage } });

  let final = "";
  let errored = false;
  for await (const event of RUNNERS[agentId](projectId, dir, userMessage).events) {
    if (event.type === "done") final = event.result;
    if (event.type === "error") {
      errored = true;
      await db.chatMessage.create({ data: { projectId, role: "system", content: `${agent.label}: ${event.message}` } });
    }
    yield event;
  }
  if (!errored) {
    await db.chatMessage.create({ data: { projectId, role: "assistant", content: final || "(no reply)" } });
  }
}
