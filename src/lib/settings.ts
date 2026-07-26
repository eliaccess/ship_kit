import { db } from "./db";
import { encrypt, decrypt } from "./crypto";

export const SETTING_KEYS = {
  GITHUB_PAT: "github_pat",
  EXPO_TOKEN: "expo_token",
} as const;

export async function setSetting(key: string, value: string, secret = true) {
  const stored = secret ? encrypt(value) : value;
  await db.setting.upsert({
    where: { key },
    create: { key, value: stored, secret },
    update: { value: stored, secret },
  });
}

export async function getSetting(key: string): Promise<string | null> {
  const row = await db.setting.findUnique({ where: { key } });
  if (!row) return null;
  return row.secret ? decrypt(row.value) : row.value;
}

/** Returns which settings exist without exposing values. */
export async function settingsPresence(): Promise<Record<string, boolean>> {
  const rows = await db.setting.findMany({ select: { key: true } });
  return Object.fromEntries(rows.map((r) => [r.key, true]));
}
