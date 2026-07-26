import { NextRequest, NextResponse } from "next/server";
import { runDoctor, DoctorCheck } from "@/lib/doctor";
import { getSetting } from "@/lib/settings";

export const dynamic = "force-dynamic";

type DoctorPayload = {
  checks: DoctorCheck[];
  buildModes: { android: string | null; ios: string | null };
};

// Tool probes take a couple of seconds — cache briefly so pages feel instant.
const CACHE_MS = 60_000;
const g = globalThis as unknown as { __doctorCache?: { at: number; data: DoctorPayload } };

export async function GET(req: NextRequest) {
  const fresh = req.nextUrl.searchParams.get("fresh") === "1";
  if (!fresh && g.__doctorCache && Date.now() - g.__doctorCache.at < CACHE_MS) {
    // Build modes can change from Settings — always read them live, they're instant.
    const buildModes = {
      android: await getSetting("build_mode_android"),
      ios: await getSetting("build_mode_ios"),
    };
    return NextResponse.json({ ...g.__doctorCache.data, buildModes });
  }
  const checks = await runDoctor();
  const data: DoctorPayload = {
    checks,
    buildModes: {
      android: await getSetting("build_mode_android"),
      ios: await getSetting("build_mode_ios"),
    },
  };
  g.__doctorCache = { at: Date.now(), data };
  return NextResponse.json(data);
}
