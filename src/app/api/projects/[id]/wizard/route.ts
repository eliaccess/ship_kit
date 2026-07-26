import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { db } from "@/lib/db";
import { workspaceDir } from "@/lib/paths";
import { encrypt } from "@/lib/crypto";
import { setSetting } from "@/lib/settings";
import { WIZARD_STEPS, getStep } from "@/lib/wizard/steps";

// Inputs on these steps are platform-wide settings, not per-project credentials.
const GLOBAL_SETTING_INPUTS = new Set(["github_pat", "expo_token"]);

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [states, project, credentials, settings] = await Promise.all([
    db.wizardState.findMany({ where: { projectId: id } }),
    db.project.findUnique({ where: { id } }),
    db.credential.findMany({ where: { projectId: id }, select: { key: true } }),
    db.setting.findMany({ select: { key: true } }),
  ]);
  const stateById = new Map(states.map((s) => [s.stepId, s]));
  const hasCred = (key: string) => credentials.some((c) => c.key === key);
  const hasSetting = (key: string) => settings.some((s) => s.key === key);

  // A step is done when its EVIDENCE exists, wherever the value was entered
  // (wizard, Settings page, import-error recovery…) — not only via this form.
  const assetsDir = path.join(workspaceDir(id), "store-assets");
  const rawShots = (() => {
    try {
      return fs.readdirSync(path.join(assetsDir, "raw")).filter((f) => /\.(png|jpe?g|webp)$/i.test(f)).length;
    } catch {
      return 0;
    }
  })();

  const evidence: Record<string, boolean> = {
    "github-pat": hasSetting("github_pat"),
    "expo-account-token": hasSetting("expo_token"),
    "asc-api-key": hasCred("asc_key_id") && hasCred("asc_issuer_id") && hasCred("asc_key_p8"),
    "play-service-account": hasCred("play_service_account_json"),
    "app-identity": Boolean(project?.appName && project?.bundleId),
    "google-signin-oauth": hasCred("google_web_client_id"),
    "store-screenshots": rawShots > 0,
    "store-visuals-generate": fs.existsSync(path.join(assetsDir, "feature-graphic.png")),
  };

  const steps = WIZARD_STEPS.map((s) => {
    const state = stateById.get(s.id);
    const status = state?.status === "skipped" ? "skipped" : state?.status === "done" || evidence[s.id] ? "done" : "pending";
    return {
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
      status,
      data: state?.data ? JSON.parse(state.data) : null,
    };
  });
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
