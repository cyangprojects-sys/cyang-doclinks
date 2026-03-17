export interface Env {
  TARGET_SCAN_URL: string;
  TARGET_NIGHTLY_URL: string;
  TARGET_KEY_ROTATION_URL: string;
  TARGET_WEBHOOKS_URL: string;
  TARGET_RETENTION_URL: string;
  CRON_SECRET: string; // stored as a Cloudflare secret
}

const TEN_MINUTE_SCHEDULE = "*/10 * * * *";
const NIGHTLY_SCHEDULE = "5 6 * * *";
const RETENTION_SCHEDULE = "17 2 * * *";

const worker = {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runScheduled(event, env));
  },
};

export default worker;

async function runScheduled(event: ScheduledEvent, env: Env) {
  const cron = String(event.cron || "").trim();
  const now = new Date(event.scheduledTime);
  const minute = now.getUTCMinutes();
  const jobs: Array<{ name: string; url: string; method: "GET" | "POST" }> = [];

  // Keep Cloudflare invocations sparse enough that Neon can autosuspend between
  // idle periods. The 10-minute trigger fans out only the jobs that need it.
  if (cron === TEN_MINUTE_SCHEDULE) {
    jobs.push({ name: "scan", url: env.TARGET_SCAN_URL, method: "GET" });
    jobs.push({ name: "webhooks", url: env.TARGET_WEBHOOKS_URL, method: "GET" });
    if (minute % 30 === 0) jobs.push({ name: "key-rotation", url: env.TARGET_KEY_ROTATION_URL, method: "GET" });
  } else if (cron === NIGHTLY_SCHEDULE) {
    jobs.push({ name: "nightly", url: env.TARGET_NIGHTLY_URL, method: "GET" });
  } else if (cron === RETENTION_SCHEDULE) {
    jobs.push({ name: "retention", url: env.TARGET_RETENTION_URL, method: "GET" });
  }

  const failures: Array<{ name: string; status: number; body: string }> = [];
  for (const job of jobs) {
    const result = await trigger(job.name, job.url, job.method, env);
    if (!result.ok) failures.push({ name: job.name, status: result.status, body: result.body });
  }

  if (failures.length) {
    console.log(
      "Cron run completed with failures:",
      JSON.stringify(
        failures.map((f) => ({
          name: f.name,
          status: f.status,
          body: f.body.slice(0, 160),
        }))
      )
    );
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
    return { ok: false as const, status: res.status, body: text };
  }
  console.log(`Cron trigger ok (${name}):`, res.status, text.slice(0, 800));
  return { ok: true as const, status: res.status, body: text };
}
