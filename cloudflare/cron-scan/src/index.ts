export interface Env {
  TARGET_SCAN_URL: string;
  TARGET_NIGHTLY_URL: string;
  TARGET_KEY_ROTATION_URL: string;
  TARGET_WEBHOOKS_URL: string;
  CRON_SECRET: string; // stored as a Cloudflare secret
}

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runScheduled(event, env));
  },
};

async function runScheduled(event: ScheduledEvent, env: Env) {
  const cron = String(event.cron || "").trim();
  const jobs: Array<{ name: string; url: string; method: "GET" | "POST" }> = [];

  // every 5 minutes
  if (cron === "*/5 * * * *") {
    jobs.push({ name: "webhooks", url: env.TARGET_WEBHOOKS_URL, method: "GET" });
  }
  // every 10 minutes
  if (cron === "*/10 * * * *") {
    jobs.push({ name: "scan", url: env.TARGET_SCAN_URL, method: "GET" });
  }
  // hourly at minute 5
  if (cron === "5 * * * *") {
    jobs.push({ name: "nightly", url: env.TARGET_NIGHTLY_URL, method: "GET" });
  }
  // every 15 minutes
  if (cron === "*/15 * * * *") {
    jobs.push({ name: "key-rotation", url: env.TARGET_KEY_ROTATION_URL, method: "GET" });
  }

  for (const job of jobs) {
    await trigger(job.name, job.url, job.method, env);
  }
}

async function trigger(name: string, url: string, method: "GET" | "POST", env: Env) {
  const res = await fetch(url, {
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
    console.log(`Cron trigger failed (${name}):`, res.status, text.slice(0, 800));
    throw new Error(`Cron trigger failed (${name}): ${res.status}`);
  }
  console.log(`Cron trigger ok (${name}):`, res.status, text.slice(0, 800));
}
