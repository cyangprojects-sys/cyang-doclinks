export type AdminIconName =
  | "overview"
  | "documents"
  | "links"
  | "activity"
  | "security"
  | "team"
  | "governance"
  | "branding"
  | "settings"
  | "billing"
  | "integrations"
  | "review"
  | "help"
  | "profile"
  | "search";

type AdminNavAudience = "both" | "owner";

export type AdminNavItem = {
  key: string;
  label: string;
  href: string;
  description: string;
  icon: AdminIconName;
  audience: AdminNavAudience;
  group: "workspace" | "security" | "workspace_controls" | "platform";
};

const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  {
    key: "overview",
    label: "Overview",
    href: "/admin",
    description: "Daily command center for upload, sharing, and security posture.",
    icon: "overview",
    audience: "both",
    group: "workspace",
  },
  {
    key: "documents",
    label: "Documents",
    href: "/admin/documents",
    description: "Secure file library, scan readiness, and file lifecycle.",
    icon: "documents",
    audience: "both",
    group: "workspace",
  },
  {
    key: "links",
    label: "Links",
    href: "/admin/links",
    description: "Protected link control, expiry, recipient access, and revocation.",
    icon: "links",
    audience: "both",
    group: "workspace",
  },
  {
    key: "activity",
    label: "Activity",
    href: "/admin/activity",
    description: "Views, engagement, unopened shares, and follow-up signals.",
    icon: "activity",
    audience: "both",
    group: "workspace",
  },
  {
    key: "security",
    label: "Security Center",
    href: "/admin/security",
    description: "Alerts, suspicious activity, response controls, and live posture.",
    icon: "security",
    audience: "both",
    group: "security",
  },
  {
    key: "team",
    label: "Team Access",
    href: "/admin/team",
    description: "Members, invites, roles, MFA posture, and workspace access.",
    icon: "team",
    audience: "both",
    group: "security",
  },
  {
    key: "governance",
    label: "Audit & Policies",
    href: "/admin/governance",
    description: "Immutable audit history, policy defaults, retention, and export.",
    icon: "governance",
    audience: "owner",
    group: "security",
  },
  {
    key: "branding",
    label: "Branding",
    href: "/admin/branding",
    description: "Workspace identity, watermark posture, and share presentation.",
    icon: "branding",
    audience: "owner",
    group: "workspace_controls",
  },
  {
    key: "settings",
    label: "Workspace Settings",
    href: "/admin/settings",
    description: "Default share behavior, notifications, and workspace preferences.",
    icon: "settings",
    audience: "owner",
    group: "workspace_controls",
  },
  {
    key: "billing",
    label: "Billing & Plan",
    href: "/admin/billing",
    description: "Plan state, usage, invoices, checkout, and billing health.",
    icon: "billing",
    audience: "owner",
    group: "workspace_controls",
  },
  {
    key: "integrations",
    label: "Integrations",
    href: "/admin/integrations",
    description: "API keys, webhooks, delivery health, and automation controls.",
    icon: "integrations",
    audience: "owner",
    group: "platform",
  },
  {
    key: "review",
    label: "Review Queue",
    href: "/admin/review",
    description: "Viewer uploads, abuse reports, takedowns, and moderation work.",
    icon: "review",
    audience: "owner",
    group: "platform",
  },
];

export const ADMIN_NAV_GROUPS: Array<{
  key: AdminNavItem["group"];
  label: string;
  collapsible: boolean;
}> = [
  { key: "workspace", label: "Workspace", collapsible: false },
  { key: "security", label: "Security & Access", collapsible: true },
  { key: "workspace_controls", label: "Workspace Controls", collapsible: true },
  { key: "platform", label: "Platform", collapsible: true },
];

export function getAdminNavItems(isOwner: boolean) {
  return ADMIN_NAV_ITEMS.filter((item) => item.audience === "both" || isOwner);
}

export function matchAdminNavItem(pathname: string, isOwner: boolean) {
  const items = getAdminNavItems(isOwner);
  return (
    items.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`)) ??
    items[0] ??
    null
  );
}
