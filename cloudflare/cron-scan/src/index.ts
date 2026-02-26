export interface Env {
  TARGET_URL: string;
  HTTP_METHOD: string;
  CRON_SECRET: string; // stored as a Cloudflare secret
}

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(triggerScan(env));
  },
};

async function triggerScan(env: Env) {
  const method = (env.HTTP_METHOD || "POST").toUpperCase();
  const res = await fetch(env.TARGET_URL, {
    method,
    headers: {
      "User-Agent": "cloudflare-cron/cyang-doclinks",
      "Authorization": `Bearer ${env.CRON_SECRET}`,
      "Content-Type": "application/json",
    },
    body: method === "GET" ? undefined : JSON.stringify({
      source: "cloudflare-cron",
      ts: new Date().toISOString(),
    }),
  });

  const text = await res.text().catch(() => "");
  if (!res.ok) {
    console.log("Cron trigger failed:", res.status, text.slice(0, 800));
    throw new Error(`Cron trigger failed: ${res.status}`);
  }
  console.log("Cron trigger ok:", res.status, text.slice(0, 800));
}
