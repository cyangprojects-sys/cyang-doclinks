"use client";

import { useState } from "react";
import UploadPanel from "./UploadPanel";
import UnifiedDocsTableClient, { type UnifiedDocRow } from "./UnifiedDocsTableClient";
import SharesTableClient, { type ShareRow } from "./SharesTableClient";

type TabKey = "documents" | "links" | "uploads";

export default function DashboardItemsTabs(props: {
  docs: UnifiedDocRow[];
  shares: ShareRow[];
  nowTs: number;
  canManageBulk: boolean;
  canCheckEncryptionStatus: boolean;
  showDelete: boolean;
}) {
  const [active, setActive] = useState<TabKey>("documents");

  const tabClass = (tab: TabKey) =>
    [
      "rounded-lg px-3 py-1.5 text-sm transition",
      active === tab
        ? "border border-white/20 bg-white/15 text-white"
        : "border border-white/10 bg-white/5 text-white/75 hover:bg-white/10 hover:text-white",
    ].join(" ");

  return (
    <section id="docs" className="space-y-3">
      <span id="shares" className="sr-only" aria-hidden="true" />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setActive("documents")} className={tabClass("documents")}>
          Documents
        </button>
        <button type="button" onClick={() => setActive("links")} className={tabClass("links")}>
          Links
        </button>
        <button type="button" onClick={() => setActive("uploads")} className={tabClass("uploads")}>
          Uploads
        </button>
      </div>

      {active === "documents" ? (
        <UnifiedDocsTableClient rows={props.docs} defaultPageSize={10} showDelete={props.showDelete} />
      ) : null}

      {active === "links" ? (
        <div id="shares">
          <SharesTableClient shares={props.shares} nowTs={props.nowTs} canManageBulk={props.canManageBulk} />
        </div>
      ) : null}

      {active === "uploads" ? (
        <div className="space-y-3">
          <div className="text-sm text-white/75">Upload a document, then create a protected link in one flow.</div>
          <UploadPanel canCheckEncryptionStatus={props.canCheckEncryptionStatus} />
        </div>
      ) : null}
    </section>
  );
}
