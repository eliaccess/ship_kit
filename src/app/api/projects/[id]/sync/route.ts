import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { enqueue } from "@/lib/jobs";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await db.project.findUnique({ where: { id } });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await db.project.update({ where: { id }, data: { status: "cloning" } });
  await enqueue("clone", { projectId: id });
  return NextResponse.json({ ok: true });
}
