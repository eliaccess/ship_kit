import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { db } from "@/lib/db";
import { workspaceDir, ensureDir } from "@/lib/paths";

const RAW_SUBDIR = ["store-assets", "raw"];
const ALLOWED = /\.(png|jpe?g|webp)$/i;
const MAX_BYTES = 25 * 1024 * 1024;

function rawDir(projectId: string): string {
  return path.join(workspaceDir(projectId), ...RAW_SUBDIR);
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const dir = rawDir(id);
  const files = fs.existsSync(dir)
    ? fs
        .readdirSync(dir)
        .filter((f) => ALLOWED.test(f))
        .map((f) => ({ name: f, size: fs.statSync(path.join(dir, f)).size }))
    : [];
  return NextResponse.json({ files });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await db.project.findUnique({ where: { id } });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!fs.existsSync(workspaceDir(id))) {
    return NextResponse.json({ error: "Repository not synced yet." }, { status: 400 });
  }

  const form = await req.formData();
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) return NextResponse.json({ error: "No files received" }, { status: 400 });

  const dir = ensureDir(rawDir(id));
  const saved: string[] = [];
  for (const file of files) {
    const name = path.basename(file.name).replace(/[^\w.\-]/g, "_");
    if (!ALLOWED.test(name)) {
      return NextResponse.json({ error: `"${file.name}" isn't an image (PNG/JPG/WebP only).` }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: `"${file.name}" is over 25 MB.` }, { status: 400 });
    }
    fs.writeFileSync(path.join(dir, name), Buffer.from(await file.arrayBuffer()));
    saved.push(name);
  }
  return NextResponse.json({ saved });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const name = path.basename(new URL(req.url).searchParams.get("name") ?? "");
  if (!name || !ALLOWED.test(name)) return NextResponse.json({ error: "Bad file name" }, { status: 400 });
  const target = path.join(rawDir(id), name);
  if (fs.existsSync(target)) fs.unlinkSync(target);
  return NextResponse.json({ ok: true });
}
