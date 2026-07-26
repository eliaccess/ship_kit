import fs from "fs";
import os from "os";
import path from "path";
import { run } from "./git";
import { getSetting, SETTING_KEYS } from "./settings";

export type DoctorCheck = {
  id: string;
  label: string;
  group: "core" | "agent" | "expo" | "android-local" | "ios-local" | "backend";
  ok: boolean;
  detail: string;
  fixMarkdown: string | null;
};

async function cmdOutput(cmd: string, args: string[], timeoutMs = 15000): Promise<string | null> {
  try {
    const res = await Promise.race([
      run(cmd, args),
      new Promise<{ code: number; output: string }>((resolve) =>
        setTimeout(() => resolve({ code: 124, output: "timeout" }), timeoutMs)
      ),
    ]);
    return res.code === 0 ? res.output.trim() : null;
  } catch {
    return null;
  }
}

async function cmdVersion(cmd: string, args: string[], timeoutMs = 15000): Promise<string | null> {
  const out = await cmdOutput(cmd, args, timeoutMs);
  return out ? out.split("\n")[0] : null;
}

function findAndroidSdk(): string | null {
  const candidates = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    path.join(os.homedir(), "Library/Android/sdk"),
    path.join(os.homedir(), "Android/Sdk"),
  ].filter(Boolean) as string[];
  return candidates.find((c) => fs.existsSync(c)) ?? null;
}

export async function runDoctor(): Promise<DoctorCheck[]> {
  const checks: DoctorCheck[] = [];

  // Probe everything concurrently — sequential probes made the Settings page feel slow.
  const [git, claude, expoToken, javaA, javaB, xcode, pods, gcloud, gcloudAccount, gcloudProject] = await Promise.all([
    cmdVersion("git", ["--version"]),
    cmdVersion("claude", ["--version"]),
    getSetting(SETTING_KEYS.EXPO_TOKEN),
    cmdVersion("java", ["--version"]),
    cmdVersion("/opt/homebrew/opt/openjdk/bin/java", ["--version"]),
    process.platform === "darwin" ? cmdVersion("xcodebuild", ["-version"]) : Promise.resolve(null),
    process.platform === "darwin" ? cmdVersion("pod", ["--version"]) : Promise.resolve(null),
    cmdVersion("gcloud", ["--version"]),
    cmdOutput("gcloud", ["config", "get-value", "account"]),
    cmdOutput("gcloud", ["config", "get-value", "project"]),
  ]);
  const java = javaA ?? javaB;

  // ── Core ──────────────────────────────────────────────────────────────
  const node = process.versions.node;
  checks.push({
    id: "node",
    label: "Node.js",
    group: "core",
    ok: true,
    detail: `v${node}`,
    fixMarkdown: null,
  });

  checks.push({
    id: "git",
    label: "Git",
    group: "core",
    ok: !!git,
    detail: git ?? "not found",
    fixMarkdown: git ? null : "Install Git: on macOS run `xcode-select --install`, on Linux `sudo apt install git`, on Windows install from https://git-scm.com.",
  });

  // ── Coding agent (Claude Code) ────────────────────────────────────────
  checks.push({
    id: "claude",
    label: "Claude Code (the coding agent behind Chat)",
    group: "agent",
    ok: !!claude,
    detail: claude ?? "not found",
    fixMarkdown: claude
      ? null
      : [
          "The Chat tab uses **Claude Code**, Anthropic's coding agent, running on *your* account:",
          "1. Install it: `npm install -g @anthropic-ai/claude-code`",
          "2. Open a terminal and run `claude` once — it will ask you to log in (a Claude Pro/Max subscription or an Anthropic API key both work).",
          "3. Refresh this page.",
          "",
          "Nothing is billed to ShipKit — the agent runs locally under your own Anthropic account.",
        ].join("\n"),
  });

  // ── Expo (needed for BOTH cloud and local builds) ─────────────────────
  checks.push({
    id: "expo-token",
    label: "Expo account token",
    group: "expo",
    ok: !!expoToken,
    detail: expoToken ? "configured" : "missing",
    fixMarkdown: expoToken
      ? null
      : "Needed for **both** cloud and local builds: builds are driven by Expo's EAS tooling, and your app's **signing keys** (Android keystore, iOS certificates) are stored in your Expo account — that's what makes cloud and local builds interchangeable. Local builds are free and unlimited (the ~30/month quota only applies to cloud builds). Complete the **Expo account** step in any project's Setup tab, or paste the token in Settings.",
  });

  // ── Android local toolchain ───────────────────────────────────────────
  const sdk = findAndroidSdk();
  checks.push({
    id: "android-sdk",
    label: "Android SDK (local Android builds)",
    group: "android-local",
    ok: !!sdk,
    detail: sdk ?? "not found",
    fixMarkdown: sdk
      ? null
      : [
          "Only needed if you switch Android builds to **local** mode (unlimited, no cloud quota):",
          "1. Install [Android Studio](https://developer.android.com/studio) (easiest) — it installs the SDK to `~/Library/Android/sdk` (macOS) or `~/Android/Sdk` (Linux).",
          "2. Or set `ANDROID_HOME` to an existing SDK location.",
          "Cloud mode (default) needs none of this.",
        ].join("\n"),
  });

  // Android's build system (Gradle) is certified for JDK 17–21; a newer JDK
  // often breaks builds with "Unsupported class file major version".
  const javaMajor = java ? parseInt(java.match(/(?:openjdk|java)\D*(\d+)/i)?.[1] ?? "0", 10) : 0;
  const javaTooNew = javaMajor > 21;
  checks.push({
    id: "java",
    label: "Java JDK (local Android builds)",
    group: "android-local",
    ok: !!java,
    detail: java ? `${java}${javaTooNew ? " ⚠ newer than Android supports" : ""}` : "not found",
    fixMarkdown: !java
      ? "Install a JDK: on macOS `brew install openjdk@17`, on Linux `sudo apt install openjdk-17-jdk`. Only needed for local Android builds."
      : javaTooNew
        ? `You have JDK ${javaMajor}, but Android's build system works best with **JDK 17–21**. If a local Android build fails with a Java-version error ("Unsupported class file major version"), install a compatible one: \`brew install openjdk@17\`, then set \`JAVA_HOME\` to it (Homebrew prints the exact path after installing).`
        : null,
  });

  // ── iOS local toolchain (macOS only) ──────────────────────────────────
  if (process.platform === "darwin") {
    checks.push({
      id: "xcode",
      label: "Xcode (local iOS builds)",
      group: "ios-local",
      ok: !!xcode,
      detail: xcode ?? "not found",
      fixMarkdown: xcode
        ? null
        : "Install Xcode from the Mac App Store, open it once to accept the license, then run `sudo xcode-select -s /Applications/Xcode.app`. Only needed for local iOS builds — cloud mode builds iOS without Xcode.",
    });
    checks.push({
      id: "cocoapods",
      label: "CocoaPods (local iOS builds)",
      group: "ios-local",
      ok: !!pods,
      detail: pods ? `v${pods}` : "not found",
      fixMarkdown: pods ? null : "Install CocoaPods: `brew install cocoapods` (or `sudo gem install cocoapods`). Only needed for local iOS builds.",
    });
  } else {
    checks.push({
      id: "xcode",
      label: "Xcode (local iOS builds)",
      group: "ios-local",
      ok: false,
      detail: "iOS builds require macOS",
      fixMarkdown: "Local iOS builds need a Mac. On this machine, keep iOS builds in **cloud** mode (EAS builds iOS remotely — no Mac needed).",
    });
  }

  // ── Backend deployment (only for apps with a custom API server) ──────
  // "Installed" isn't enough — the deploy flow needs the CLI CONFIGURED:
  // a logged-in account, Application Default Credentials, and ideally a project.
  // `gcloud config get-value` prints "Your active configuration is: […]" on stderr —
  // keep only the actual value line.
  const cfgValue = (raw: string | null) => {
    const v = raw
      ?.split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !/active configuration/i.test(l))
      .pop();
    return v && !/unset/i.test(v) ? v : null;
  };
  const account = cfgValue(gcloudAccount);
  const gcloudProj = cfgValue(gcloudProject);
  const adcPath = path.join(os.homedir(), ".config", "gcloud", "application_default_credentials.json");
  const adc = fs.existsSync(adcPath);
  const gcloudConfigured = !!gcloud && !!account && adc;
  checks.push({
    id: "gcloud",
    label: "Google Cloud CLI (deploying custom backends)",
    group: "backend",
    ok: gcloudConfigured,
    detail: !gcloud
      ? "not found"
      : `${gcloud.replace("Google Cloud SDK", "SDK")} · account: ${account ?? "not logged in"} · app credentials: ${adc ? "✓" : "✗"}${gcloudProj ? ` · project: ${gcloudProj}` : ""}`,
    fixMarkdown: gcloudConfigured
      ? null
      : !gcloud
        ? [
            "Only needed if your app has its **own API server** to host (Lovable apps use Supabase — already hosted, nothing to deploy):",
            "1. Install the Google Cloud CLI: on macOS `brew install --cask google-cloud-sdk`, otherwise https://cloud.google.com/sdk/docs/install",
            "2. Run `gcloud auth login` and `gcloud auth application-default login` in a terminal (each opens a browser).",
            "3. The chat agent handles the deployment itself (Cloud Run, no downloaded keys).",
          ].join("\n")
        : [
            "The CLI is installed but **not fully configured** — the deploy agent would stall without this:",
            ...(!account ? ["- Run `gcloud auth login` in a terminal (opens a browser to sign in)."] : []),
            ...(!adc ? ["- Run `gcloud auth application-default login` (a second, separate login that programs use)."] : []),
            ...(!gcloudProj ? ["- Optional: set a default project with `gcloud config set project YOUR_PROJECT_ID`."] : []),
          ].join("\n"),
  });

  return checks;
}
