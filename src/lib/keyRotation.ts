import { rotateDocKeys } from "@/lib/masterKeys";

function parseIds(raw: string): string[] {
  return raw
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

export async function runAutomatedKeyRotation() {
  const enabled = ["1", "true", "yes", "on"].includes(
    String(process.env.AUTO_KEY_ROTATION_ENABLED || "").trim().toLowerCase()
  );
  if (!enabled) return { enabled: false, processed: 0, results: [] as Array<{ from: string; rotated: number; error?: string }> };

  const fromIds = parseIds(String(process.env.AUTO_KEY_ROTATE_FROM || ""));
  const limit = Math.max(1, Math.min(2000, Number(process.env.AUTO_KEY_ROTATE_BATCH || 250)));
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
