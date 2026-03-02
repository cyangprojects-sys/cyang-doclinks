// src/app/admin/(owner)/webhooks/page.tsx
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
  return <span className="ui-badge inline-flex items-center rounded-full px-2 py-0.5 text-[11px]">{children}</span>;
}

function FieldLabel({ children, htmlFor }: { children: React.ReactNode; htmlFor: string }) {
  return <label htmlFor={htmlFor} className="text-xs text-white/65">{children}</label>;
}

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`mt-1 w-full rounded-xl border border-white/20 bg-black/20 px-3 py-2 text-sm text-white placeholder:text-white/45 focus:border-cyan-300/55 focus:outline-none ${props.className || ""}`}
    />
  );
}

function EventCheckboxes({ defaultEvents, namePrefix }: { defaultEvents: string[]; namePrefix: string }) {
  return (
    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
      {ALL_EVENTS.map((e) => (
        <label key={`${namePrefix}-${e}`} className="flex items-center gap-2 text-xs text-white/75">
          <input aria-label={`Webhook event ${e}`} type="checkbox" name="events" value={e} defaultChecked={defaultEvents.includes(e)} className="h-4 w-4 rounded border-white/20 bg-black/30" />
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
    <div className="mx-auto max-w-6xl p-4 text-white md:p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Webhooks</h1>
      </div>

      <section className="glass-card-strong rounded-2xl p-4">
        <div className="text-sm text-white/70">
          Webhooks are outbound HTTP POSTs. If you set a secret, the JSON body is signed with HMAC-SHA256 and sent in
          <span className="ml-1 font-mono text-xs text-white/65">x-cyang-signature</span>.
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="glass-card rounded-xl p-4">
            <h2 className="text-base font-medium">Create webhook</h2>
            <form action={createWebhookAction} className="mt-3 space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <FieldLabel htmlFor="create-webhook-name">Name</FieldLabel>
                  <TextInput id="create-webhook-name" aria-label="Webhook name" name="name" placeholder="Production" />
                </div>
                <div className="flex items-end gap-2">
                  <label className="flex items-center gap-2 text-xs text-white/75">
                    <input aria-label="Webhook enabled" type="checkbox" name="enabled" defaultChecked className="h-4 w-4 rounded border-white/20 bg-black/30" />
                    Enabled
                  </label>
                </div>
              </div>

              <div>
                <FieldLabel htmlFor="create-webhook-url">URL</FieldLabel>
                <TextInput id="create-webhook-url" aria-label="Webhook URL" name="url" placeholder="https://example.com/webhook" />
              </div>

              <div>
                <FieldLabel htmlFor="create-webhook-secret">Secret (optional)</FieldLabel>
                <TextInput id="create-webhook-secret" aria-label="Webhook secret" name="secret" placeholder="shared secret" />
              </div>

              <div>
                <div className="text-xs text-white/65">Events</div>
                <EventCheckboxes defaultEvents={["share.created", "share.revoked"]} namePrefix="create" />
              </div>

              <button className="btn-base btn-primary rounded-xl px-3 py-2 text-sm font-medium">Create</button>
            </form>
          </div>

          <div className="glass-card rounded-xl p-4">
            <h3 className="text-sm font-medium">Delivery model</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-white/70">
              <li>
                Preferred: queued deliveries with retry and backoff via cron worker
                <span className="ml-2 font-mono text-xs text-white/60">/api/cron/webhooks</span>
              </li>
              <li>Fallback: synchronous best-effort if the queue table is not installed yet</li>
              <li>
                Dead-letter: deliveries become <Pill>dead</Pill> after max attempts (default 8)
              </li>
            </ul>
            <div className="mt-3 text-xs text-white/60">
              Tip: run <span className="font-mono">scripts/sql/webhooks.sql</span> to add the queue table.
            </div>
          </div>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-medium">Your webhooks</h2>

        <div className="mt-3 max-h-[920px] space-y-3 overflow-auto pr-1">
          {hooks.map((h) => (
            <div key={h.id} className="glass-card-strong rounded-2xl p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="text-base font-semibold">{h.name}</div>
                    {h.enabled ? <Pill>enabled</Pill> : <Pill>disabled</Pill>}
                  </div>
                  <div className="mt-1 text-xs text-white/60">{h.url}</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(h.events?.length ? h.events : ["(all events)"]).map((e) => (
                      <Pill key={`${h.id}-${e}`}>{e}</Pill>
                    ))}
                  </div>
                </div>

                <div className="text-right text-xs text-white/60">
                  <div>Last sent: {h.last_sent_at ?? "-"}</div>
                  <div>Last status: {h.last_status ?? "-"}</div>
                  <div className="max-w-[380px] truncate">Last error: {h.last_error ?? "-"}</div>
                </div>
              </div>

              <details className="mt-4">
                <summary className="cursor-pointer text-sm text-white/80 hover:text-white">Edit</summary>
                <form action={updateWebhookAction} className="mt-3 space-y-3">
                  <input type="hidden" name="id" value={h.id} />
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <FieldLabel htmlFor={`webhook-name-${h.id}`}>Name</FieldLabel>
                      <TextInput id={`webhook-name-${h.id}`} aria-label={`Webhook name ${h.name}`} name="name" defaultValue={h.name} />
                    </div>
                    <div className="flex items-end gap-2">
                      <label className="flex items-center gap-2 text-xs text-white/75">
                        <input aria-label={`Enabled ${h.name}`} type="checkbox" name="enabled" defaultChecked={h.enabled} className="h-4 w-4 rounded border-white/20 bg-black/30" />
                        Enabled
                      </label>
                    </div>
                  </div>
                  <div>
                    <FieldLabel htmlFor={`webhook-url-${h.id}`}>URL</FieldLabel>
                    <TextInput id={`webhook-url-${h.id}`} aria-label={`Webhook URL ${h.name}`} name="url" defaultValue={h.url} />
                  </div>
                  <div>
                    <FieldLabel htmlFor={`webhook-secret-${h.id}`}>Secret (optional)</FieldLabel>
                    <TextInput id={`webhook-secret-${h.id}`} aria-label={`Webhook secret ${h.name}`} name="secret" defaultValue={h.secret ?? ""} />
                  </div>
                  <div>
                    <div className="text-xs text-white/65">Events</div>
                    <EventCheckboxes defaultEvents={h.events || []} namePrefix={h.id} />
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button className="btn-base btn-primary rounded-xl px-3 py-2 text-sm font-medium">Save</button>
                    <button formAction={testWebhookAction} className="btn-base btn-secondary rounded-xl px-3 py-2 text-sm">
                      Test
                    </button>
                  </div>
                </form>

                <form action={deleteWebhookAction} className="mt-2">
                  <input type="hidden" name="id" value={h.id} />
                  <button className="btn-base btn-danger rounded-xl px-3 py-2 text-sm">Delete</button>
                </form>
              </details>
            </div>
          ))}

          {!hooks.length ? (
            <div className="glass-card-strong rounded-2xl p-6 text-white/60">No webhooks yet.</div>
          ) : null}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-medium">Recent deliveries</h2>
        <div className="glass-card-strong mt-3 overflow-hidden rounded-2xl border border-white/10">
          <div className="max-h-[560px] overflow-auto">
          <table className="min-w-[1100px] text-sm">
            <thead className="sticky top-0 bg-[#10192b]/95 text-white/75 backdrop-blur">
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
                <tr key={d.id} className="border-t border-white/10 hover:bg-white/[0.03]">
                  <td className="whitespace-nowrap px-4 py-3 text-white/70">{d.created_at}</td>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-white/75">{d.webhook_id}</td>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-white/90">{d.event}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {d.status === "succeeded" ? (
                      <span className="text-emerald-100">succeeded</span>
                    ) : d.status === "dead" ? (
                      <span className="text-rose-100">dead</span>
                    ) : (
                      <span className="text-white/80">{d.status}</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-white/75">{d.attempt_count}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-white/75">{d.next_attempt_at}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-white/75">{d.last_status ?? "-"}</td>
                  <td className="max-w-[420px] truncate px-4 py-3 text-white/60">{d.last_error ?? "-"}</td>
                </tr>
              ))}
              {!deliveries.length ? (
                <tr>
                  <td className="px-4 py-6 text-white/60" colSpan={8}>
                    No deliveries yet (or queue table not installed).
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
          </div>
        </div>
      </section>
    </div>
  );
}
