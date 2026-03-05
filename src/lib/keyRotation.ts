import { rotateDocKeys } from "@/lib/masterKeys";

const MAX_FROM_IDS = 64;
const KEY_ID_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/i;

function parseIds(raw: string): string[] {
  const input = String(raw ?? "");
  if (/[\r\n\0]/.test(input)) return [];
  const ids = input
    .split(",")
    .map((v) => v.trim())
    .filter((v) => Boolean(v) && KEY_ID_RE.test(v))
    .slice(0, MAX_FROM_IDS);
  return Array.from(new Set(ids.map((v) => v.toLowerCase())));
}

function parseTruthy(raw: unknown): boolean {
  const input = String(raw ?? "");
  if (/[\r\n\0]/.test(input)) return false;
  const value = input.trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(value);
}

export function parseAutomatedKeyRotationConfig(env: NodeJS.ProcessEnv = process.env): {
  enabled: boolean;
  fromIds: string[];
  limit: number;
} {
  const enabled = parseTruthy(env.AUTO_KEY_ROTATION_ENABLED);

  const fromIds = parseIds(String(env.AUTO_KEY_ROTATE_FROM || ""));

  const rawInput = String(env.AUTO_KEY_ROTATE_BATCH || 250);
  const rawLimit = /[\r\n\0]/.test(rawInput) ? Number.NaN : Number(rawInput);
  const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(2000, Math.floor(rawLimit))) : 250;

  return { enabled, fromIds, limit };
}

export async function runAutomatedKeyRotation() {
  const { enabled, fromIds, limit } = parseAutomatedKeyRotationConfig();
  if (!enabled) return { enabled: false, processed: 0, results: [] as Array<{ from: string; rotated: number; error?: string }> };
  const results: Array<{ from: string; rotated: number; error?: string }> = [];
  let processed = 0;

  for (const from of fromIds) {
    try {
      const res = await rotateDocKeys({ fromKeyId: from, limit });
      results.push({ from, rotated: res.rotated });
      processed += 1;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      results.push({ from, rotated: 0, error: msg });
      processed += 1;
    }
  }

  return { enabled: true, processed, results };
}
