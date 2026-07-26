import { NextResponse } from "next/server";
import fs from "fs";
import { db } from "@/lib/db";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const build = await db.build.findUnique({ where: { id } });
  if (!build?.artifactUrl) return NextResponse.json({ error: "No artifact" }, { status: 404 });
  if (build.artifactUrl.startsWith("http")) return NextResponse.redirect(build.artifactUrl);
  if (!fs.existsSync(build.artifactUrl)) return NextResponse.json({ error: "Artifact file missing" }, { status: 404 });
  const data = fs.readFileSync(build.artifactUrl);
  return new NextResponse(data, {
    headers: {
      "content-type": "application/octet-stream",
      "content-disposition": `attachment; filename="app-${build.platform}.${build.platform === "android" ? "apk" : "ipa"}"`,
    },
  });
}
