import { db } from "../db";
import { chatTurn } from "./agent";
import { detectKind, detectBackend } from "../git";
import { workspaceDir } from "../paths";

/** A short line starting with an emoji = one activity-feed step. */
function isStepLine(line: string): boolean {
  return /^\p{Extended_Pictographic}/u.test(line) && line.length <= 120;
}

/** A '🙋 ACTION NEEDED' line = something only the human can do (billing, ToS, accounts…). */
function isActionLine(line: string): boolean {
  return line.startsWith("🙋") || /^action needed\s*:/i.test(line);
}

/** Splits agent text into segments: step/action lines alone, consecutive prose lines together. */
function splitSegments(text: string): string[] {
  const segments: string[] = [];
  let prose: string[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (isStepLine(line) || isActionLine(line)) {
      if (prose.length) {
        segments.push(prose.join("\n"));
        prose = [];
      }
      segments.push(line);
    } else {
      prose.push(line);
    }
  }
  if (prose.length) segments.push(prose.join("\n"));
  return segments;
}

/**
 * Starts a chat run that executes DETACHED from the HTTP request: every step is
 * persisted, so the client can disconnect/reload and re-attach by polling.
 */
export async function startRun(projectId: string, message: string): Promise<{ runId: string } | { error: string; code: number }> {
  const active = await db.chatRun.findFirst({ where: { projectId, status: "running" } });
  if (active) return { error: "The agent is already working on this project — wait for it to finish.", code: 409 };

  const run = await db.chatRun.create({ data: { projectId } });
  void executeRun(run.id, projectId, message).catch(async (err) => {
    await db.chatRun
      .update({ where: { id: run.id }, data: { status: "error", error: String(err).slice(0, 500), finishedAt: new Date() } })
      .catch(() => {});
  });
  return { runId: run.id };
}

async function executeRun(runId: string, projectId: string, message: string): Promise<void> {
  // Buffer text blocks: each becomes a step line, except the final one when it
  // duplicates the agent's closing summary (which is saved as the assistant bubble).
  let pending: string | null = null;
  let result = "";
  let errored = false;

  const flush = async () => {
    if (!pending) return;
    const kind = isActionLine(pending) ? "action" : "step";
    await db.chatMessage.create({
      data: { projectId, runId, role: kind, kind, content: pending.slice(0, 800) },
    });
    pending = null;
  };

  for await (const event of chatTurn(projectId, message)) {
    if (event.type === "text") {
      for (const segment of splitSegments(event.text)) {
        await flush();
        pending = segment;
      }
    } else if (event.type === "tool") {
      await flush();
    } else if (event.type === "done") {
      result = event.result;
    } else if (event.type === "error") {
      errored = true;
      await flush();
      await db.chatRun.update({
        where: { id: runId },
        data: { status: "error", error: event.message.slice(0, 500), finishedAt: new Date() },
      });
    }
  }

  // Don't duplicate the closing summary: it's saved as the assistant bubble.
  // Compare whitespace-normalized — markdown re-wrapping must not defeat the check.
  const norm = (s: string) => s.replace(/\s+/g, " ").trim();
  if (pending && !norm(result).includes(norm(pending))) await flush();
  else pending = null;

  // The agent may have transformed the project (web → Expo): re-detect so the
  // Overview and Builds tabs reflect reality without waiting for a re-sync.
  try {
    const dir = workspaceDir(projectId);
    const kind = detectKind(dir);
    await db.project.update({
      where: { id: projectId },
      data: {
        kind,
        isExpo: kind === "expo",
        backend: detectBackend(dir),
        ...(kind === "expo" ? { statusMsg: "Expo app detected — ready to build." } : {}),
      },
    });
  } catch {
    /* project may have been deleted mid-run */
  }

  if (!errored) {
    await db.chatRun.update({ where: { id: runId }, data: { status: "done", finishedAt: new Date() } });
  }
}
