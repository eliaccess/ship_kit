import { db } from "./db";
import { cloneOrPull, detectKind } from "./git";
import { runBuild } from "./builds/eas";

const POLL_MS = 3000;
const MAX_CONCURRENT = 2;

let running = 0;

export async function enqueue(type: "clone" | "build", payload: object): Promise<string> {
  const job = await db.job.create({ data: { type, payload: JSON.stringify(payload) } });
  return job.id;
}

async function handle(type: string, payload: Record<string, string>): Promise<void> {
  if (type === "clone") {
    const project = await db.project.findUniqueOrThrow({ where: { id: payload.projectId } });
    await db.project.update({
      where: { id: project.id },
      data: { status: "cloning", statusMsg: "Downloading your code…" },
    });
    try {
      const dir = await cloneOrPull(project.id, project.repoUrl);
      await db.project.update({ where: { id: project.id }, data: { statusMsg: "Analyzing the project…" } });
      const kind = detectKind(dir);
      const messages: Record<string, string> = {
        expo: "Expo app detected — ready to build.",
        lovable: "Lovable project detected — it needs a rework into a native app before building (the AI agent can do it).",
        web: "Web app detected — it needs a rework into a native app before building (the AI agent can do it).",
        unknown: "Repository linked, but we couldn't recognize the project type (no package.json?).",
      };
      await db.project.update({
        where: { id: project.id },
        data: { status: "ready", isExpo: kind === "expo", kind, statusMsg: messages[kind] },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await db.project.update({
        where: { id: project.id },
        data: { status: "error", statusMsg: message.slice(0, 1000) },
      });
      throw err;
    }
  } else if (type === "build") {
    await runBuild(payload.buildId);
  } else {
    throw new Error(`Unknown job type ${type}`);
  }
}

async function tick() {
  while (running < MAX_CONCURRENT) {
    // Claim atomically so parallel ticks never double-run a job.
    const candidate = await db.job.findFirst({ where: { status: "queued" }, orderBy: { createdAt: "asc" } });
    if (!candidate) return;
    const claimed = await db.job.updateMany({
      where: { id: candidate.id, status: "queued" },
      data: { status: "running", startedAt: new Date() },
    });
    if (claimed.count === 0) continue;

    running++;
    (async () => {
      try {
        await handle(candidate.type, JSON.parse(candidate.payload));
        await db.job.update({ where: { id: candidate.id }, data: { status: "done", finishedAt: new Date() } });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await db.job.update({
          where: { id: candidate.id },
          data: { status: "failed", error: message.slice(0, 2000), finishedAt: new Date() },
        });
      } finally {
        running--;
      }
    })();
  }
}

export function startWorker() {
  const g = globalThis as unknown as { __shipkitWorker?: boolean };
  if (g.__shipkitWorker) return;
  g.__shipkitWorker = true;
  // Recover jobs orphaned by a previous process.
  db.job
    .updateMany({ where: { status: "running" }, data: { status: "queued", startedAt: null } })
    .catch(() => {});
  // Chat runs can't be resumed after a restart (the agent process died) — mark them honestly.
  db.chatRun
    .updateMany({
      where: { status: "running" },
      data: { status: "error", error: "Interrupted by a server restart — send your message again.", finishedAt: new Date() },
    })
    .catch(() => {});
  setInterval(() => tick().catch((e) => console.error("[worker]", e)), POLL_MS);
  console.log("[worker] job runner started");
}
