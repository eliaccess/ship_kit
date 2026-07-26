import fs from "fs";
import path from "path";
import os from "os";
import { db } from "../db";
import { decrypt } from "../crypto";
import { getSetting, SETTING_KEYS } from "../settings";
import { cloneOrPull, run, detectExpo } from "../git";
import { buildLogPath, ensureDir } from "../paths";

const DEFAULT_EAS_JSON = {
  cli: { appVersionSource: "remote" },
  build: {
    preview: { distribution: "internal", android: { buildType: "apk" } },
    production: { autoIncrement: true },
  },
  submit: { production: {} },
};

function appendLog(logPath: string, chunk: string) {
  fs.appendFileSync(logPath, chunk);
}

/** Ensures eas.json exists and app.json carries the chosen bundle id / package. */
function prepareWorkspace(dir: string, bundleId: string | null, appName: string | null, log: (s: string) => void) {
  const easPath = path.join(dir, "eas.json");
  if (!fs.existsSync(easPath)) {
    fs.writeFileSync(easPath, JSON.stringify(DEFAULT_EAS_JSON, null, 2));
    log("Created default eas.json (preview profile → APK)\n");
  }
  const appJsonPath = path.join(dir, "app.json");
  if (fs.existsSync(appJsonPath) && (bundleId || appName)) {
    const appJson = JSON.parse(fs.readFileSync(appJsonPath, "utf8"));
    appJson.expo = appJson.expo ?? {};
    if (appName && !appJson.expo.name) appJson.expo.name = appName;
    if (bundleId) {
      appJson.expo.ios = { ...appJson.expo.ios, bundleIdentifier: appJson.expo.ios?.bundleIdentifier ?? bundleId };
      appJson.expo.android = { ...appJson.expo.android, package: appJson.expo.android?.package ?? bundleId };
    }
    fs.writeFileSync(appJsonPath, JSON.stringify(appJson, null, 2));
    log(`Applied app identity to app.json (${bundleId ?? ""})\n`);
  }
}

async function getCredential(projectId: string, key: string): Promise<string | null> {
  const row = await db.credential.findUnique({ where: { projectId_key: { projectId, key } } });
  return row ? decrypt(row.value) : null;
}

export async function runBuild(buildId: string): Promise<void> {
  const build = await db.build.findUniqueOrThrow({ where: { id: buildId }, include: { project: true } });
  const logPath = buildLogPath(buildId);
  ensureDir(path.dirname(logPath));
  fs.writeFileSync(logPath, `=== Build ${buildId} (${build.platform}/${build.profile}) ===\n`);
  const log = (s: string) => appendLog(logPath, s);
  await db.build.update({ where: { id: buildId }, data: { status: "running", logPath } });

  try {
    const expoToken = await getSetting(SETTING_KEYS.EXPO_TOKEN);
    if (!expoToken) throw new Error("No Expo token configured. Complete the 'Expo account' step in Setup first.");

    log("Syncing repository...\n");
    const dir = await cloneOrPull(build.projectId, build.project.repoUrl);
    if (!detectExpo(dir)) {
      throw new Error(
        "This repository is not an Expo app yet. Use the Chat tab to convert it (e.g. \"Convert this Lovable web app into an Expo mobile app\")."
      );
    }
    prepareWorkspace(dir, build.project.bundleId, build.project.appName, log);

    log("Installing dependencies (npm install)...\n");
    const install = await run("npm", ["install", "--no-audit", "--no-fund"], { cwd: dir, onOutput: log });
    if (install.code !== 0) throw new Error("npm install failed — see log");

    const env: Record<string, string> = { EXPO_TOKEN: expoToken, CI: "1" };

    // iOS: EAS needs the user's ASC API key to manage signing non-interactively.
    if (build.platform === "ios") {
      const p8 = await getCredential(build.projectId, "asc_key_p8");
      const keyId = await getCredential(build.projectId, "asc_key_id");
      const issuerId = await getCredential(build.projectId, "asc_issuer_id");
      if (!p8 || !keyId || !issuerId) {
        throw new Error("iOS builds need your App Store Connect API key. Complete that step in Setup first.");
      }
      const keyDir = fs.mkdtempSync(path.join(os.tmpdir(), "asc-"));
      const p8Path = path.join(keyDir, `AuthKey_${keyId}.p8`);
      fs.writeFileSync(p8Path, p8, { mode: 0o600 });
      env.EXPO_ASC_API_KEY_PATH = p8Path;
      env.EXPO_ASC_KEY_ID = keyId;
      env.EXPO_ASC_ISSUER_ID = issuerId;
      log("App Store Connect API key staged for signing.\n");
    }

    const args = [
      "--yes", "eas-cli",
      "build",
      "--platform", build.platform,
      "--profile", build.profile,
      "--non-interactive",
      "--json",
      "--wait",
    ];
    log(`\n$ npx eas-cli build --platform ${build.platform} --profile ${build.profile}\n\n`);
    const res = await run("npx", args, { cwd: dir, env, onOutput: log });
    if (res.code !== 0) throw new Error(`EAS build failed (exit ${res.code}) — see log`);

    // --json prints an array of build results on stdout; find the artifact URL.
    const jsonMatch = res.output.match(/\[\s*{[\s\S]*}\s*\]/);
    let artifactUrl: string | null = null;
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        artifactUrl = parsed[0]?.artifacts?.buildUrl ?? parsed[0]?.artifacts?.applicationArchiveUrl ?? null;
      } catch {
        /* fall through */
      }
    }
    if (!artifactUrl) {
      const urlMatch = res.output.match(/https:\/\/expo\.dev\/artifacts\/\S+/);
      artifactUrl = urlMatch ? urlMatch[0] : null;
    }

    await db.build.update({
      where: { id: buildId },
      data: { status: "success", artifactUrl, finishedAt: new Date() },
    });
    log(`\n=== SUCCESS ===\nArtifact: ${artifactUrl ?? "(no direct URL — check expo.dev dashboard)"}\n`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    appendLog(logPath, `\n=== FAILED ===\n${message}\n`);
    await db.build.update({
      where: { id: buildId },
      data: { status: "failed", error: message.slice(0, 2000), finishedAt: new Date() },
    });
  }
}
