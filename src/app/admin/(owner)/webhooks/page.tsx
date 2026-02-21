// src/app/admin/webhooks/page.tsx
import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { sql } from "@/lib/db";
import { getAuthedUser } from "@/lib/authz";
import {
  createWebhookAction,
  updateWebhookAction,
  deleteWebhookAction,
  testWebhookAction,
} from "./actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const ALL_EVENTS = [
  "share.created",
  "share.revoked",
  "alias.created",
  "alias.disabled",
  "doc.deleted",
  "doc.viewed",
  "doc.accessed",
] as const;

type HookRow = {
  id: string;
  name: string;
  url: string;
  secret: string | null;
  events: string[];
  enabled: boolean;
  created_at: string;
  last_sent_at: string | null;
  last_status: number | null;
  last_error: string | null;
};

type DeliveryRow = {
  id: number;
  webhook_id: string;
  event: string;
  status: string;
  attempt_count: number;
  next_attempt_at: string;
  last_status: number | null;
  last_error: string | null;
  created_at: string;
};

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-neutral-800 bg-neutral-950 px-2 py-0.5 text-[11px] text-neutral-300">
      {children}
    </span>
  );
}

function EventCheckboxes({ defaultEvents, namePrefix }: { defaultEvents: string[]; namePrefix: string }) {
  return (
    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
      {ALL_EVENTS.map((e) => (
        <label key={`${namePrefix}-${e}`} className="flex items-center gap-2 text-xs text-neutral-300">
          <input
            type="checkbox"
            name="events"
            value={e}
            defaultChecked={defaultEvents.includes(e)}
            className="h-4 w-4 rounded border-neutral-700 bg-neutral-950"
          />
          <span className="font-mono text-[11px]">{e}</span>
        </label>
      ))}
    </div>
  );
}

export default async function WebhooksPage() {
  noStore();

  const u = await getAuthedUser();
  if (!u) redirect("/api/auth/signin");
  const canAdmin = u.role === "owner" || u.role === "admin";
  if (!canAdmin) redirect("/");

  const hooks = (await sql`
    select
      id::text as id,
      name,
      url,
      secret,
      events,
      enabled,
      created_at::text as created_at,
      last_sent_at::text as last_sent_at,
      last_status,
      last_error
    from public.webhooks
    where owner_id = ${u.id}::uuid
    order by created_at desc
    limit 200
  `) as unknown as HookRow[];

  let deliveries: DeliveryRow[] = [];
  try {
    deliveries = (await sql`
      select
        id,
        webhook_id::text as webhook_id,
        event,
        status,
        attempt_count,
        next_attempt_at::text as next_attempt_at,
        last_status,
        last_error,
        created_at::text as created_at
      from public.webhook_deliveries
      where owner_id = ${u.id}::uuid
      order by created_at desc
      limit 80
    `) as unknown as DeliveryRow[];
  } catch {
    // queue table may not exist yet
  }

  return (
    <div className="mx-auto max-w-6xl p-6 text-white">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Webhooks</h1>
      </div>

      <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
        <div className="text-sm text-neutral-300">
          Webhooks are outbound HTTP POSTs. If you set a secret, we sign the JSON body with HMAC-SHA256 and send it in
          <span className="ml-1 font-mono text-xs">x-cyang-signature</span>.
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <h2 className="text-base font-medium">Create webhook</h2>
            <form action={createWebhookAction} className="mt-3 space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs text-neutral-400">Name</label>
                  <input
                    name="name"
                    placeholder="Production"
                    className="mt-1 w-full rounded-lg border border-neutral-800 bg-black px-3 py-2 text-sm"
                  />
                </div>
                <div className="flex items-end gap-2">
                  <label className="flex items-center gap-2 text-xs text-neutral-300">
                    <input type="checkbox" name="enabled" defaultChecked className="h-4 w-4" />
                    Enabled
                  </label>
                </div>
              </div>

              <div>
                <label className="text-xs text-neutral-400">URL</label>
                <input
                  name="url"
                  placeholder="https://example.com/webhook"
                  className="mt-1 w-full rounded-lg border border-neutral-800 bg-black px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="text-xs text-neutral-400">Secret (optional)</label>
                <input
                  name="secret"
                  placeholder="shared secret"
                  className="mt-1 w-full rounded-lg border border-neutral-800 bg-black px-3 py-2 text-sm"
                />
              </div>

              <div>
                <div className="text-xs text-neutral-400">Events</div>
                <EventCheckboxes defaultEvents={["share.created", "share.revoked"]} namePrefix="create" />
              </div>

              <button className="rounded-lg bg-white px-3 py-2 text-sm font-medium text-black hover:bg-neutral-200">
                Create
              </button>
            </form>
          </div>

          <div className="rounded-xl border border-neutral-800 bg-black/40 p-4">
            <h3 className="text-sm font-medium">Delivery model</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-neutral-300">
              <li>
                Preferred: queued deliveries with retry/backoff via cron worker
                <span className="ml-2 font-mono text-xs text-neutral-400">/api/cron/webhooks</span>
              </li>
              <li>Fallback: synchronous best-effort if the queue table isn’t installed yet</li>
              <li>
                Dead-letter: deliveries become <Pill>dead</Pill> after max attempts (default 8)
              </li>
            </ul>
            <div className="mt-3 text-xs text-neutral-500">
              Tip: run <span className="font-mono">scripts/sql/webhooks.sql</span> to add the queue table.
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8">
        <h2 className="text-lg font-medium">Your webhooks</h2>

        <div className="mt-3 space-y-3">
          {hooks.map((h) => (
            <div key={h.id} className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="text-base font-semibold">{h.name}</div>
                    {h.enabled ? <Pill>enabled</Pill> : <Pill>disabled</Pill>}
                  </div>
                  <div className="mt-1 text-xs text-neutral-400">{h.url}</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(h.events?.length ? h.events : ["(all events)"]).map((e) => (
                      <Pill key={`${h.id}-${e}`}>{e}</Pill>
                    ))}
                  </div>
                </div>

                <div className="text-right text-xs text-neutral-400">
                  <div>Last sent: {h.last_sent_at ?? "—"}</div>
                  <div>Last status: {h.last_status ?? "—"}</div>
                  <div className="max-w-[380px] truncate">Last error: {h.last_error ?? "—"}</div>
                </div>
              </div>

              <details className="mt-4">
                <summary className="cursor-pointer text-sm text-neutral-300 hover:text-white">Edit</summary>
                <form action={updateWebhookAction} className="mt-3 space-y-3">
                  <input type="hidden" name="id" value={h.id} />
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="text-xs text-neutral-400">Name</label>
                      <input
                        name="name"
                        defaultValue={h.name}
                        className="mt-1 w-full rounded-lg border border-neutral-800 bg-black px-3 py-2 text-sm"
                      />
                    </div>
                    <div className="flex items-end gap-2">
                      <label className="flex items-center gap-2 text-xs text-neutral-300">
                        <input type="checkbox" name="enabled" defaultChecked={h.enabled} className="h-4 w-4" />
                        Enabled
                      </label>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-neutral-400">URL</label>
                    <input
                      name="url"
                      defaultValue={h.url}
                      className="mt-1 w-full rounded-lg border border-neutral-800 bg-black px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-neutral-400">Secret (optional)</label>
                    <input
                      name="secret"
                      defaultValue={h.secret ?? ""}
                      className="mt-1 w-full rounded-lg border border-neutral-800 bg-black px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <div className="text-xs text-neutral-400">Events</div>
                    <EventCheckboxes defaultEvents={h.events || []} namePrefix={h.id} />
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button className="rounded-lg bg-white px-3 py-2 text-sm font-medium text-black hover:bg-neutral-200">
                      Save
                    </button>
                    <button
                      formAction={testWebhookAction}
                      className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-900"
                    >
                      Test
                    </button>
                  </div>
                </form>

                <form action={deleteWebhookAction} className="mt-2">
                  <input type="hidden" name="id" value={h.id} />
                  <button className="rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-200 hover:bg-red-950">
                    Delete
                  </button>
                </form>
              </details>
            </div>
          ))}

          {!hooks.length && (
            <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-6 text-neutral-400">
              No webhooks yet.
            </div>
          )}
        </div>
      </div>

      <div className="mt-10">
        <h2 className="text-lg font-medium">Recent deliveries</h2>
        <div className="mt-3 overflow-x-auto rounded-xl border border-neutral-800">
          <table className="min-w-[1100px] text-sm">
            <thead className="bg-neutral-900 text-neutral-400">
              <tr>
                <th className="px-4 py-3 text-left">Created</th>
                <th className="px-4 py-3 text-left">Webhook</th>
                <th className="px-4 py-3 text-left">Event</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Attempts</th>
                <th className="px-4 py-3 text-left">Next attempt</th>
                <th className="px-4 py-3 text-left">Last status</th>
                <th className="px-4 py-3 text-left">Last error</th>
              </tr>
            </thead>
            <tbody>
              {deliveries.map((d) => (
                <tr key={d.id} className="border-t border-neutral-800 hover:bg-neutral-900">
                  <td className="px-4 py-3 whitespace-nowrap text-neutral-300">{d.created_at}</td>
                  <td className="px-4 py-3 whitespace-nowrap font-mono text-xs text-neutral-300">{d.webhook_id}</td>
                  <td className="px-4 py-3 whitespace-nowrap font-mono text-xs text-neutral-200">{d.event}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {d.status === "succeeded" ? (
                      <span className="text-emerald-300">succeeded</span>
                    ) : d.status === "dead" ? (
                      <span className="text-red-300">dead</span>
                    ) : (
                      <span className="text-neutral-300">{d.status}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-neutral-300">{d.attempt_count}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-neutral-300">{d.next_attempt_at}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-neutral-300">{d.last_status ?? "—"}</td>
                  <td className="px-4 py-3 max-w-[420px] truncate text-neutral-400">{d.last_error ?? "—"}</td>
                </tr>
              ))}
              {!deliveries.length && (
                <tr>
                  <td className="px-4 py-6 text-neutral-400" colSpan={8}>
                    No deliveries yet (or queue table not installed).
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
