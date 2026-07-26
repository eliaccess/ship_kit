import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { getSetting, SETTING_KEYS } from "./settings";
import { workspaceDir, ensureDir } from "./paths";

export function run(
  cmd: string,
  args: string[],
  opts: { cwd?: string; env?: Record<string, string>; onOutput?: (chunk: string) => void } = {}
): Promise<{ code: number; output: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      env: { ...process.env, ...opts.env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    const collect = (data: Buffer) => {
      const s = data.toString();
      output += s;
      opts.onOutput?.(s);
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    child.on("error", reject);
    child.on("close", (code) => resolve({ code: code ?? 1, output }));
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
  if (fs.existsSync(path.join(dir, ".git"))) {
    const res = await run("git", ["pull", "--ff-only"], { cwd: dir });
    if (res.code !== 0) throw new Error(`git pull failed:\n${res.output}`);
  } else {
    ensureDir(path.dirname(dir));
    const res = await run("git", ["clone", "--depth", "50", url, dir]);
    if (res.code !== 0) throw new Error(`git clone failed:\n${res.output.replaceAll(url, repoUrl)}`);
  }
  return dir;
}

export function detectExpo(dir: string): boolean {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    return Boolean(deps["expo"]);
  } catch {
    return false;
  }
}
