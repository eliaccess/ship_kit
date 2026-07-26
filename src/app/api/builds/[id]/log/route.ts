import { NextResponse } from "next/server";
import fs from "fs";
import { db } from "@/lib/db";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const build = await db.build.findUnique({ where: { id } });
  if (!build?.logPath || !fs.existsSync(build.logPath)) {
    return new NextResponse("No log yet.", { headers: { "content-type": "text/plain" } });
  }
  const stat = fs.statSync(build.logPath);
  // Serve at most the last 200KB so huge build logs stay snappy.
  const start = Math.max(0, stat.size - 200_000);
  const fd = fs.openSync(build.logPath, "r");
  const buf = Buffer.alloc(stat.size - start);
  fs.readSync(fd, buf, 0, buf.length, start);
  fs.closeSync(fd);
  return new NextResponse(buf.toString("utf8"), { headers: { "content-type": "text/plain; charset=utf-8" } });
}
