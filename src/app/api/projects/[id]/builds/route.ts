import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { enqueue } from "@/lib/jobs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const builds = await db.build.findMany({ where: { projectId: id }, orderBy: { createdAt: "desc" } });
  return NextResponse.json(builds);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await db.project.findUnique({ where: { id } });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { platform } = (await req.json()) as { platform: string };
  if (platform !== "android" && platform !== "ios") {
    return NextResponse.json({ error: "platform must be android or ios" }, { status: 400 });
  }

  const running = await db.build.findFirst({
    where: { projectId: id, platform, status: { in: ["queued", "running"] } },
  });
  if (running) return NextResponse.json({ error: `A ${platform} build is already in progress.` }, { status: 409 });

  const build = await db.build.create({ data: { projectId: id, platform, profile: "preview" } });
  await enqueue("build", { buildId: build.id });
  return NextResponse.json(build, { status: 201 });
}
