import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { startRun } from "@/lib/chat/runs";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [messages, run] = await Promise.all([
    db.chatMessage.findMany({ where: { projectId: id }, orderBy: { createdAt: "asc" } }),
    db.chatRun.findFirst({ where: { projectId: id }, orderBy: { createdAt: "desc" } }),
  ]);
  return NextResponse.json({ messages, run });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { message } = (await req.json()) as { message: string };
  if (!message?.trim()) return NextResponse.json({ error: "Empty message" }, { status: 400 });
  const project = await db.project.findUnique({ where: { id } });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const res = await startRun(id, message.trim());
  if ("error" in res) return NextResponse.json({ error: res.error }, { status: res.code });
  return NextResponse.json(res, { status: 202 });
}
