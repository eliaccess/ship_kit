import { NextResponse } from "next/server";
import fs from "fs";
import { db } from "@/lib/db";
import { workspaceDir, artifactDir } from "@/lib/paths";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await db.project.findUnique({
    where: { id },
    include: {
      builds: { orderBy: { createdAt: "desc" } },
      wizardSteps: true,
      credentials: { select: { key: true, updatedAt: true } },
    },
  });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(project);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await db.project.findUnique({ where: { id } });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await db.project.delete({ where: { id } });
  for (const dir of [workspaceDir(id), artifactDir(id)]) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  }
  return NextResponse.json({ ok: true });
}
