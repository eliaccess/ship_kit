import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { encrypt } from "@/lib/crypto";
import { setSetting } from "@/lib/settings";
import { WIZARD_STEPS, getStep } from "@/lib/wizard/steps";

// Inputs on these steps are platform-wide settings, not per-project credentials.
const GLOBAL_SETTING_INPUTS = new Set(["github_pat", "expo_token"]);

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const states = await db.wizardState.findMany({ where: { projectId: id } });
  const stateById = new Map(states.map((s) => [s.stepId, s]));
  const steps = WIZARD_STEPS.map((s) => ({
    id: s.id,
    phase: s.phase,
    optional: s.optional,
    requires: s.requires,
    title: s.title,
    summary: s.summary,
    clockNote: s.clockNote,
    instructionsMarkdown: s.instructionsMarkdown,
    verifyHints: s.verifyHints,
    inputs: s.inputs.map(({ name, label, type, secret, placeholder }) => ({ name, label, type, secret, placeholder })),
    status: stateById.get(s.id)?.status ?? "pending",
    data: stateById.get(s.id)?.data ? JSON.parse(stateById.get(s.id)!.data!) : null,
  }));
  return NextResponse.json(steps);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await db.project.findUnique({ where: { id } });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await req.json()) as { stepId: string; values?: Record<string, string>; action?: "complete" | "skip" | "reset" };
  const step = getStep(body.stepId);
  if (!step) return NextResponse.json({ error: "Unknown step" }, { status: 400 });

  if (body.action === "skip" || body.action === "reset") {
    const status = body.action === "skip" ? "skipped" : "pending";
    await db.wizardState.upsert({
      where: { projectId_stepId: { projectId: id, stepId: step.id } },
      create: { projectId: id, stepId: step.id, status },
      update: { status },
    });
    return NextResponse.json({ ok: true, status });
  }

  const values = Object.fromEntries(
    Object.entries(body.values ?? {}).map(([k, v]) => [k, typeof v === "string" ? v.trim() : v])
  ) as Record<string, string>;

  if (step.validate) {
    const error = step.validate(values);
    if (error) return NextResponse.json({ error }, { status: 400 });
  }

  const publicData: Record<string, string> = {};
  for (const input of step.inputs) {
    const value = values[input.name];
    if (value == null || value === "") continue;
    if (GLOBAL_SETTING_INPUTS.has(input.name)) {
      await setSetting(input.name === "github_pat" ? "github_pat" : "expo_token", value);
    } else if (input.secret) {
      await db.credential.upsert({
        where: { projectId_key: { projectId: id, key: input.name } },
        create: { projectId: id, key: input.name, value: encrypt(value) },
        update: { value: encrypt(value) },
      });
    } else {
      publicData[input.name] = value;
    }
  }

  if (step.id === "app-identity") {
    await db.project.update({
      where: { id },
      data: { appName: values.app_name, bundleId: values.bundle_id },
    });
  }

  await db.wizardState.upsert({
    where: { projectId_stepId: { projectId: id, stepId: step.id } },
    create: { projectId: id, stepId: step.id, status: "done", data: JSON.stringify(publicData) },
    update: { status: "done", data: JSON.stringify(publicData) },
  });

  return NextResponse.json({ ok: true, status: "done" });
}
