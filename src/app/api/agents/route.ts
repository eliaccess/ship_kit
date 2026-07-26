import { NextRequest, NextResponse } from "next/server";
import { detectAgents, getSelectedAgent, setSelectedAgent, AGENTS } from "@/lib/agents";

export const dynamic = "force-dynamic";

export async function GET() {
  const [agents, selected] = await Promise.all([detectAgents(), getSelectedAgent()]);
  return NextResponse.json({ agents, selected });
}

export async function POST(req: NextRequest) {
  const { agent } = (await req.json()) as { agent: string };
  const def = AGENTS.find((a) => a.id === agent);
  if (!def) return NextResponse.json({ error: "Unknown agent" }, { status: 400 });
  const detected = (await detectAgents()).find((a) => a.id === agent)?.detected;
  if (!detected) {
    return NextResponse.json({ error: `${def.label} isn't installed on this machine yet — follow the install steps first.` }, { status: 400 });
  }
  await setSelectedAgent(def.id);
  return NextResponse.json({ ok: true });
}
