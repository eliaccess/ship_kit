import { NextResponse } from "next/server";
import { runDoctor } from "@/lib/doctor";
import { getSetting } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const checks = await runDoctor();
  return NextResponse.json({
    checks,
    buildModes: {
      android: (await getSetting("build_mode_android")) ?? "cloud",
      ios: (await getSetting("build_mode_ios")) ?? "cloud",
    },
  });
}
