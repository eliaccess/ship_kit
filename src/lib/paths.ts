import path from "path";
import fs from "fs";

export const STORAGE_ROOT = path.join(process.cwd(), "storage");

export function workspaceDir(projectId: string): string {
  return path.join(STORAGE_ROOT, "workspaces", projectId);
}

export function buildLogPath(buildId: string): string {
  return path.join(STORAGE_ROOT, "logs", `${buildId}.log`);
}

export function artifactDir(projectId: string): string {
  return path.join(STORAGE_ROOT, "artifacts", projectId);
}

export function ensureDir(dir: string): string {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
