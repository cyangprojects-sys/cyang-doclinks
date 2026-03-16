"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

type Props = {
  token?: string | null;
  alias?: string | null;
};

type ReportCategory =
  | "malware"
  | "phishing_impersonation"
  | "illegal_content"
  | "policy_abuse"
  | "suspicious_share_behavior"
  | "other_safety_concern";

type EncounterSource = "email" | "chat" | "browser" | "download_folder" | "other";
type InteractionLevel = "not_sure" | "viewed_only" | "clicked_link" | "downloaded_file";

type ValidationErrors = {
  category?: string;
  target?: string;
  shareLink?: string;
  details?: string;
  email?: string;
};

const CATEGORY_OPTIONS: Array<{ id: ReportCategory; label: string; desc: string }> = [
  { id: "malware", label: "Malware", desc: "Files or behavior that look infected or unsafe." },
  { id: "phishing_impersonation", label: "Phishing / Impersonation", desc: "Deceptive requests, fake identities, or credential capture attempts." },
  { id: "illegal_content", label: "Illegal Content", desc: "Content that appears unlawful or prohibited." },
  { id: "policy_abuse", label: "Policy Abuse", desc: "Use that appears to violate platform rules or terms." },
  { id: "suspicious_share_behavior", label: "Suspicious Share Behavior", desc: "Unexpected access patterns, unusual link behavior, or suspicious delivery flow." },
  { id: "other_safety_concern", label: "Other Safety Concern", desc: "Anything else that may create risk or harm." },
];

const ENCOUNTER_OPTIONS: Array<{ id: EncounterSource; label: string }> = [
  { id: "email", label: "Email" },
  { id: "chat", label: "Chat or messaging" },
  { id: "browser", label: "Direct browser link" },
  { id: "download_folder", label: "Downloaded file" },
  { id: "other", label: "Other" },
];

const INTERACTION_OPTIONS: Array<{ id: InteractionLevel; label: string }> = [
  { id: "not_sure", label: "Not sure" },
  { id: "viewed_only", label: "Viewed only" },
  { id: "clicked_link", label: "Clicked link" },
  { id: "downloaded_file", label: "Downloaded file" },
];

const BASIC_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_TOKEN_LEN = 256;
const MAX_ALIAS_LEN = 160;
const MAX_EMAIL_LEN = 320;

function normalizeToken(value: string | null | undefined): string | null {
  const v = String(value || "").trim();
  if (!v || v.length > MAX_TOKEN_LEN || /[\r\n\0]/.test(v)) return null;
  return v;
}

function normalizeAlias(value: string | null | undefined): string | null {
  const raw = String(value || "").trim();
  if (!raw || raw.length > MAX_ALIAS_LEN || /[\r\n\0]/.test(raw)) return null;
  const decoded = (() => {
    try {
      return decodeURIComponent(raw);
    } catch {
      return "";
    }
  })();
  const v = decoded.trim().toLowerCase();
  return v || null;
}

function normalizeEmail(value: string | null | undefined): string | null {
  const v = String(value || "").trim().toLowerCase();
  if (!v) return null;
  if (v.length > MAX_EMAIL_LEN || /[\r\n\0]/.test(v)) return null;
  if (!BASIC_EMAIL_RE.test(v)) return null;
  return v;
}

function parseShareLink(value: string): { token: string | null; alias: string | null; invalid: boolean } {
  const raw = String(value || "").trim();
  if (!raw) return { token: null, alias: null, invalid: false };

  try {
    const url = new URL(raw, "https://www.cyang.io");
    const parts = url.pathname.split("/").filter(Boolean);

    let token: string | null = null;
    let alias: string | null = null;

    if (parts[0] === "s" && parts[1]) token = normalizeToken(parts[1]);
    if (parts[0] === "d" && parts[1]) alias = normalizeAlias(parts[1]);

    if (!token) token = normalizeToken(url.searchParams.get("token"));
    if (!alias) alias = normalizeAlias(url.searchParams.get("alias"));

    return { token, alias, invalid: false };
  } catch {
    return { token: null, alias: null, invalid: true };
  }
}

function categoryLabel(category: ReportCategory): string {
  return CATEGORY_OPTIONS.find((option) => option.id === category)?.label || category;
}

export default function ReportForm({ token, alias }: Props) {
  const [category, setCategory] = useState<ReportCategory | null>(null);
  const [tokenInput, setTokenInput] = useState(token || "");
  const [aliasInput, setAliasInput] = useState(alias || "");
  const [shareLink, setShareLink] = useState("");
  const [documentName, setDocumentName] = useState("");
  const [encounterSource, setEncounterSource] = useState<EncounterSource>("email");
  const [interactionLevel, setInteractionLevel] = useState<InteractionLevel>("not_sure");
  const [details, setDetails] = useState("");
  const [email, setEmail] = useState("");

  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [err, setErr] = useState<string | null>(null);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const parsedLink = useMemo(() => parseShareLink(shareLink), [shareLink]);

  const resolvedToken = useMemo(
    () => normalizeToken(tokenInput) || parsedLink.token || null,
    [tokenInput, parsedLink.token]
  );
  const resolvedAlias = useMemo(
    () => normalizeAlias(aliasInput) || parsedLink.alias || null,
    [aliasInput, parsedLink.alias]
  );

  const errors = useMemo<ValidationErrors>(() => {
    const next: ValidationErrors = {};

    if (!category) {
      next.category = "Choose the report type that best matches what you observed.";
    }

    if (shareLink.trim() && parsedLink.invalid) {
      next.shareLink = "We could not read that link. You can still provide token or alias manually.";
    }

    if (!resolvedToken && !resolvedAlias) {
      next.target = "Provide a token, alias, or share link so we can route this report correctly.";
    }

    const normalizedDetails = details.trim();
    if (!normalizedDetails) {
      next.details = "Please describe what happened.";
    } else if (normalizedDetails.length < 20) {
      next.details = "Please add a little more detail so we can review effectively.";
    }

    if (email.trim() && !normalizeEmail(email)) {
      next.email = "Enter a valid email or leave it blank.";
    }

    return next;
  }, [category, shareLink, parsedLink.invalid, resolvedToken, resolvedAlias, details, email]);

  const hasErrors = Object.keys(errors).length > 0;

  function markTouched(field: string) {
    setTouched((prev) => ({ ...prev, [field]: true }));
  }

  function markAllTouched() {
    setTouched({
      category: true,
      shareLink: true,
      token: true,
      alias: true,
      details: true,
      email: true,
    });
  }

  function inputClass(isInvalid: boolean) {
    return [
      "mt-1 w-full rounded-xl border bg-black/30 px-3 py-2.5 text-sm text-white placeholder:text-white/35 outline-none transition-colors",
      "hover:border-white/25 focus:border-sky-300/60 focus:ring-2 focus:ring-sky-300/20",
      isInvalid
        ? "border-red-400/45 bg-red-950/20 focus:border-red-300/70 focus:ring-red-400/20"
        : "border-white/12",
    ].join(" ");
  }

  function selectClass(isInvalid: boolean) {
    return [
      "mt-1 w-full rounded-xl border bg-black/30 px-3 py-2.5 text-sm text-white outline-none transition-colors",
      "hover:border-white/25 focus:border-sky-300/60 focus:ring-2 focus:ring-sky-300/20",
      isInvalid
        ? "border-red-400/45 bg-red-950/20 focus:border-red-300/70 focus:ring-red-400/20"
        : "border-white/12",
    ].join(" ");
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    markAllTouched();
    setErr(null);

    if (hasErrors || !category) {
      setStatus("error");
      setErr("Please fix the highlighted fields before submitting.");
      return;
    }

    setStatus("sending");

    const messageLines = [
      `Category: ${categoryLabel(category)}`,
      documentName.trim() ? `Document name: ${documentName.trim().slice(0, 180)}` : null,
      `Encountered via: ${ENCOUNTER_OPTIONS.find((option) => option.id === encounterSource)?.label || encounterSource}`,
      `Interaction: ${INTERACTION_OPTIONS.find((option) => option.id === interactionLevel)?.label || interactionLevel}`,
      shareLink.trim() ? `Provided link: ${shareLink.trim().slice(0, 500)}` : null,
      `Report details: ${details.trim().replace(/\s+/g, " ")}`,
    ].filter(Boolean);

    try {
      const res = await fetch("/api/v1/abuse/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: resolvedToken,
          alias: resolvedAlias,
          reporter_email: normalizeEmail(email),
          message: messageLines.join("\n"),
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setStatus("error");
        setErr(data?.message || data?.error || "Unable to submit report right now.");
        return;
      }

      setStatus("sent");
      setErr(null);
    } catch (submitError: unknown) {
      void submitError;
      setStatus("error");
      setErr("Network error. Please try again.");
    }
  }

  function resetForm() {
    setCategory(null);
    setShareLink("");
    setDocumentName("");
    setEncounterSource("email");
    setInteractionLevel("not_sure");
    setDetails("");
    setEmail("");
    setStatus("idle");
    setErr(null);
    setTouched({});
  }

  if (status === "sent") {
    return (
      <div className="glass-card-strong rounded-3xl p-6 sm:p-7">
        <div className="inline-flex rounded-full border border-emerald-200/30 bg-emerald-300/10 px-3 py-1 text-xs text-emerald-100">
          Report submitted
        </div>
        <h2 className="mt-4 text-2xl font-semibold tracking-tight text-white">Thank you for reporting this.</h2>
        <p className="mt-2 text-sm leading-relaxed text-white/72">
          Your report has been accepted and sent into moderation review. Risky content may be quarantined or blocked
          while verification continues.
        </p>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <SuccessCard title="Review" body="Admin moderation verifies report context and severity." />
          <SuccessCard title="Containment" body="Suspicious delivery paths can be revoked or quarantined." />
          <SuccessCard title="Logging" body="Security events are recorded for follow-up and audit." />
        </div>

        <div className="mt-7 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={resetForm}
            className="btn-base btn-secondary rounded-xl px-5 py-2.5 text-sm"
          >
            Submit another report
          </button>
          <Link href="/" className="btn-base btn-secondary rounded-xl px-5 py-2.5 text-sm">
            Return home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="glass-card-strong rounded-3xl p-6 sm:p-7" noValidate>
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-2xl font-semibold tracking-tight text-white">Submit abuse report</h2>
        <span className="text-xs text-white/55">Fields marked optional can be left blank</span>
      </div>

      <fieldset className="mt-6">
        <legend className="text-sm font-medium text-white/90">1. Report category</legend>
        <p className="mt-1 text-xs leading-relaxed text-white/62">Choose the closest category so the report can be triaged quickly.</p>

        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {CATEGORY_OPTIONS.map((option) => {
            const active = category === option.id;
            const invalid = Boolean(touched.category && errors.category);
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => {
                  setCategory(option.id);
                  markTouched("category");
                }}
                aria-pressed={active}
                className={[
                  "rounded-2xl border p-4 text-left transition-colors",
                  active
                    ? "border-sky-200/45 bg-sky-300/12"
                    : "border-white/12 bg-black/25 hover:border-white/25 hover:bg-white/10",
                  invalid && !active ? "border-red-400/45" : "",
                ].join(" ")}
              >
                <div className="text-sm font-medium text-white/92">{option.label}</div>
                <div className="mt-1 text-xs leading-relaxed text-white/64">{option.desc}</div>
              </button>
            );
          })}
        </div>

        {touched.category && errors.category ? <p className="mt-2 text-xs text-red-300">{errors.category}</p> : null}
      </fieldset>

      <fieldset className="mt-7 rounded-2xl border border-white/12 bg-black/20 p-4 sm:p-5">
        <legend className="px-1 text-sm font-medium text-white/90">2. Context and identification</legend>
        <p className="mt-1 text-xs leading-relaxed text-white/62">
          Token, alias, or share link details help route this report to the correct item and speed up review.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="report-token" className="text-xs font-medium text-white/75">Share token (if known)</label>
            <input
              id="report-token"
              value={tokenInput}
              onChange={(event) => setTokenInput(event.target.value)}
              onBlur={() => markTouched("token")}
              className={inputClass(Boolean((touched.token || touched.alias || touched.shareLink) && errors.target))}
              placeholder="e.g. 5925b6744c..."
              autoComplete="off"
            />
          </div>

          <div>
            <label htmlFor="report-alias" className="text-xs font-medium text-white/75">Alias (if known)</label>
            <input
              id="report-alias"
              value={aliasInput}
              onChange={(event) => setAliasInput(event.target.value)}
              onBlur={() => markTouched("alias")}
              className={inputClass(Boolean((touched.token || touched.alias || touched.shareLink) && errors.target))}
              placeholder="e.g. vendor-contract-q2"
              autoComplete="off"
            />
          </div>
        </div>

        <div className="mt-4">
          <label htmlFor="report-link" className="text-xs font-medium text-white/75">Share link (optional, helps extract token or alias)</label>
          <input
            id="report-link"
            value={shareLink}
            onChange={(event) => setShareLink(event.target.value)}
            onBlur={() => markTouched("shareLink")}
            className={inputClass(Boolean(touched.shareLink && errors.shareLink))}
            placeholder="https://www.cyang.io/s/... or /d/..."
            autoComplete="off"
          />
          {touched.shareLink && errors.shareLink ? <p className="mt-2 text-xs text-red-300">{errors.shareLink}</p> : null}
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="report-document" className="text-xs font-medium text-white/75">Document name (optional)</label>
            <input
              id="report-document"
              value={documentName}
              onChange={(event) => setDocumentName(event.target.value)}
              className={inputClass(false)}
              placeholder="e.g. 2026 Q1 Payroll Export"
              autoComplete="off"
            />
          </div>

          <div>
            <label htmlFor="report-encounter" className="text-xs font-medium text-white/75">Where did you encounter it?</label>
            <select
              id="report-encounter"
              value={encounterSource}
              onChange={(event) => setEncounterSource(event.target.value as EncounterSource)}
              className={selectClass(false)}
            >
              {ENCOUNTER_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {errors.target && (touched.token || touched.alias || touched.shareLink) ? (
          <p className="mt-3 text-xs text-red-300">{errors.target}</p>
        ) : null}
      </fieldset>

      <fieldset className="mt-7">
        <legend className="text-sm font-medium text-white/90">3. Report details</legend>
        <p className="mt-1 text-xs leading-relaxed text-white/62">
          What did you see? Why does it seem suspicious or harmful? When did it happen? Did you click or download anything?
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_220px]">
          <div>
            <label htmlFor="report-details" className="text-xs font-medium text-white/75">Describe what happened</label>
            <textarea
              id="report-details"
              value={details}
              onChange={(event) => setDetails(event.target.value)}
              onBlur={() => markTouched("details")}
              className={[
                inputClass(Boolean(touched.details && errors.details)),
                "min-h-[170px] resize-y",
              ].join(" ")}
              placeholder="Example: The document asked for urgent payment updates and linked to a suspicious domain."
            />
            {touched.details && errors.details ? <p className="mt-2 text-xs text-red-300">{errors.details}</p> : null}
          </div>

          <div>
            <label htmlFor="report-interaction" className="text-xs font-medium text-white/75">Your interaction</label>
            <select
              id="report-interaction"
              value={interactionLevel}
              onChange={(event) => setInteractionLevel(event.target.value as InteractionLevel)}
              className={selectClass(false)}
            >
              {INTERACTION_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </fieldset>

      <fieldset className="mt-7">
        <legend className="text-sm font-medium text-white/90">4. Contact for follow-up (optional)</legend>
        <p className="mt-1 text-xs leading-relaxed text-white/62">
          You can submit anonymously. Sharing an email may help if moderation needs clarification.
        </p>

        <div className="mt-3 max-w-md">
          <label htmlFor="report-email" className="text-xs font-medium text-white/75">Email address</label>
          <input
            id="report-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            onBlur={() => markTouched("email")}
            className={inputClass(Boolean(touched.email && errors.email))}
            placeholder="you@example.com"
          />
          {touched.email && errors.email ? <p className="mt-2 text-xs text-red-300">{errors.email}</p> : null}
        </div>
      </fieldset>

      <section className="mt-7 rounded-2xl border border-white/12 bg-black/20 p-4 sm:p-5" aria-label="What happens next">
        <h3 className="text-sm font-medium text-white/90">What happens next</h3>
        <ul className="mt-3 space-y-2 text-xs leading-relaxed text-white/67">
          <li className="flex gap-2"><span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-sky-200/70" />Report enters moderation review.</li>
          <li className="flex gap-2"><span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-sky-200/70" />Suspicious or risky items may be quarantined or blocked.</li>
          <li className="flex gap-2"><span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-sky-200/70" />Security events are logged for operational follow-up.</li>
        </ul>
      </section>

      <section className="mt-4 rounded-2xl border border-amber-200/25 bg-amber-300/8 p-4" aria-label="Safety and integrity note">
        <p className="text-xs leading-relaxed text-amber-100/85">
          Submit reports in good faith. Deliberately false reports may result in access restrictions.
          By submitting, you agree to the{" "}
          <Link href="/acceptable-use" className="underline underline-offset-4 hover:text-white">
            acceptable use policy
          </Link>
          .
        </p>
      </section>

      {status === "error" && err ? (
        <div className="mt-4 rounded-xl border border-red-900/40 bg-red-950/30 px-3 py-2 text-sm text-red-200">{err}</div>
      ) : null}

      <section className="mt-6 rounded-2xl border border-white/14 bg-white/6 p-4 sm:p-5" aria-label="Submit report">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-medium text-white/92">Submit report</h3>
            <p className="mt-1 text-xs leading-relaxed text-white/64">
              Report urgent abuse now. Include as much context as you can for faster review.
            </p>
          </div>

          <button
            type="submit"
            disabled={status === "sending"}
            className="btn-base btn-primary rounded-xl px-5 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
          >
            {status === "sending" ? "Submitting report..." : "Submit abuse report"}
          </button>
        </div>
      </section>
    </form>
  );
}

function SuccessCard(props: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-white/12 bg-black/25 p-4">
      <div className="text-sm font-medium text-white/92">{props.title}</div>
      <div className="mt-1 text-xs leading-relaxed text-white/64">{props.body}</div>
    </div>
  );
}
