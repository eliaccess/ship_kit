import { NextRequest, NextResponse } from "next/server";
import { setSetting, settingsPresence } from "@/lib/settings";

export async function GET() {
  return NextResponse.json(await settingsPresence());
}

const SECRET_KEYS = new Set(["github_pat", "expo_token"]);
const BUILD_MODE_KEYS = new Set(["build_mode_android", "build_mode_ios"]);

export async function POST(req: NextRequest) {
  const { key, value } = (await req.json()) as { key: string; value: string };
  if (!value?.trim()) return NextResponse.json({ error: "Empty value" }, { status: 400 });
  if (SECRET_KEYS.has(key)) {
    await setSetting(key, value.trim(), true);
  } else if (BUILD_MODE_KEYS.has(key)) {
    if (value !== "cloud" && value !== "local") {
      return NextResponse.json({ error: "Build mode must be cloud or local" }, { status: 400 });
    }
    await setSetting(key, value, false);
  } else {
    return NextResponse.json({ error: "Unknown setting" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
