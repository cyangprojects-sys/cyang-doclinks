import { rotateDocKeys } from "@/lib/masterKeys";

function parseIds(raw: string): string[] {
  const ids = raw
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  return Array.from(new Set(ids));
}

export function parseAutomatedKeyRotationConfig(env: NodeJS.ProcessEnv = process.env): {
  enabled: boolean;
  fromIds: string[];
  limit: number;
} {
  const enabled = ["1", "true", "yes", "on"].includes(
    String(env.AUTO_KEY_ROTATION_ENABLED || "").trim().toLowerCase()
  );

  const fromIds = parseIds(String(env.AUTO_KEY_ROTATE_FROM || ""));

  const rawLimit = Number(env.AUTO_KEY_ROTATE_BATCH || 250);
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
