import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { enqueue } from "@/lib/jobs";

export async function GET() {
  const projects = await db.project.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json(projects);
}

const CreateSchema = z.object({
  name: z.string().min(1).max(100),
  repoUrl: z
    .string()
    .url()
    .refine((u) => u.startsWith("https://github.com/"), "Must be a https://github.com/... URL"),
});

export async function POST(req: NextRequest) {
  const parsed = CreateSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const project = await db.project.create({
    data: { name: parsed.data.name, repoUrl: parsed.data.repoUrl.replace(/\.git$/, "") },
  });
  await enqueue("clone", { projectId: project.id });
  return NextResponse.json(project, { status: 201 });
}
