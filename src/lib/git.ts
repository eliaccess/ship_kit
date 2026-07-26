import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { getSetting, SETTING_KEYS } from "./settings";
import { workspaceDir, ensureDir } from "./paths";

export function run(
  cmd: string,
  args: string[],
  opts: { cwd?: string; env?: Record<string, string>; onOutput?: (chunk: string) => void; timeoutMs?: number } = {}
): Promise<{ code: number; output: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      env: { ...process.env, ...opts.env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    let timedOut = false;
    const timer = opts.timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          child.kill("SIGKILL");
        }, opts.timeoutMs)
      : null;
    const collect = (data: Buffer) => {
      const s = data.toString();
      output += s;
      opts.onOutput?.(s);
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    child.on("error", (err) => {
      if (timer) clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      if (timedOut) output += `\n[timed out after ${Math.round((opts.timeoutMs ?? 0) / 1000)}s]`;
      resolve({ code: timedOut ? 124 : (code ?? 1), output });
    });
  });
}

/** Builds a clone URL, injecting the stored GitHub PAT for private repos. */
async function authedUrl(repoUrl: string): Promise<string> {
  const pat = await getSetting(SETTING_KEYS.GITHUB_PAT);
  if (!pat) return repoUrl;
  const url = new URL(repoUrl);
  url.username = "x-access-token";
  url.password = pat;
  return url.toString();
}

export async function cloneOrPull(projectId: string, repoUrl: string): Promise<string> {
  const dir = workspaceDir(projectId);
  const url = await authedUrl(repoUrl);
  // Never log `url` — it may embed the PAT.
  // LC_ALL=C → English messages for error classification.
  // GIT_TERMINAL_PROMPT=0 + empty askpass + disabled credential helper → git FAILS FAST
  // on missing/wrong credentials instead of hanging on a prompt it can never answer.
  const env = { LC_ALL: "C", LANG: "C", GIT_TERMINAL_PROMPT: "0", GIT_ASKPASS: "/bin/echo" };
  const gitBase = ["-c", "credential.helper="];
  const timeoutMs = 300_000;
  if (fs.existsSync(path.join(dir, ".git"))) {
    const res = await run("git", [...gitBase, "pull", "--ff-only"], { cwd: dir, env, timeoutMs });
    if (res.code !== 0) throw new Error(`git pull failed:\n${res.output}`);
  } else {
    ensureDir(path.dirname(dir));
    const res = await run("git", [...gitBase, "clone", "--depth", "50", url, dir], { env, timeoutMs });
    if (res.code !== 0) throw new Error(`git clone failed:\n${res.output.replaceAll(url, repoUrl)}`);
  }
  return dir;
}

export function detectExpo(dir: string): boolean {
  return detectKind(dir) === "expo";
}

/** Classifies the repo: native Expo app, Lovable export, generic web app, or unknown. */
export function detectKind(dir: string): "expo" | "lovable" | "web" | "unknown" {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    if (deps["expo"]) return "expo";
    if (deps["lovable-tagger"]) return "lovable";
    if (deps["react"] || deps["vite"] || deps["next"] || deps["vue"] || deps["svelte"]) return "web";
    return "unknown";
  } catch {
    return "unknown";
  }
}
