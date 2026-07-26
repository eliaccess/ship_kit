import { NextRequest, NextResponse } from "next/server";
import { setSetting, settingsPresence } from "@/lib/settings";

export async function GET() {
  return NextResponse.json(await settingsPresence());
}

export async function POST(req: NextRequest) {
  const { key, value } = (await req.json()) as { key: string; value: string };
  const allowed = new Set(["github_pat", "expo_token"]);
  if (!allowed.has(key)) return NextResponse.json({ error: "Unknown setting" }, { status: 400 });
  if (!value?.trim()) return NextResponse.json({ error: "Empty value" }, { status: 400 });
  await setSetting(key, value.trim());
  return NextResponse.json({ ok: true });
}
