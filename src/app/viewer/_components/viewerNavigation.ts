export type ViewerIconName = "overview" | "documents" | "links" | "activity" | "help" | "profile";

export type ViewerNavItem = {
  key: "overview" | "documents" | "links" | "activity";
  label: string;
  href: string;
  description: string;
  icon: ViewerIconName;
};

export const VIEWER_NAV_ITEMS: ViewerNavItem[] = [
  {
    key: "overview",
    label: "Overview",
    href: "/viewer",
    description: "Your member workspace, recent files, and secure sharing workflow.",
    icon: "overview",
  },
  {
    key: "documents",
    label: "Documents",
    href: "/viewer/documents",
    description: "Files you can upload, review, and prepare for protected sharing.",
    icon: "documents",
  },
  {
    key: "links",
    label: "Links",
    href: "/viewer/links",
    description: "Protected links you can manage without leaving the member workspace.",
    icon: "links",
  },
  {
    key: "activity",
    label: "Activity",
    href: "/viewer/activity",
    description: "Recipient opens and activity signals for your shared documents.",
    icon: "activity",
  },
];
