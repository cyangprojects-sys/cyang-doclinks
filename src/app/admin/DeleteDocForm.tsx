// src/app/admin/DeleteDocForm.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DeleteDocForm({
  docId,
  title,
  action,
  onDeleted,
  label = "Delete",
  variant = "danger",
}: {
  docId: string;
  title: string;
  action: (formData: FormData) => Promise<void>;
  onDeleted?: (docId: string) => void;
  label?: string;
  variant?: "danger" | "subtle";
}) {
  const [pending, setPending] = useState(false);
  const router = useRouter();
  const buttonClass =
    variant === "subtle"
      ? "rounded-lg border border-white/10 bg-transparent px-3 py-1.5 text-xs text-white/55 hover:border-white/20 hover:bg-white/5 hover:text-white"
      : "btn-base btn-danger rounded-lg px-3 py-1.5 text-xs";

  return (
    <form
      action={async (fd) => {
        const ok = window.confirm(
          `Delete this document?\n\n${title}\n\nThis removes the file from R2 and deletes database records.`
        );
        if (!ok) return;
        setPending(true);
        try {
          await action(fd);
          if (onDeleted) onDeleted(docId);
          else router.refresh();
        } finally {
          setPending(false);
        }
      }}
      className="inline-flex"
    >
      <input type="hidden" name="docId" value={docId} />
      <button
        type="submit"
        aria-label={`Delete document ${title}`}
        disabled={pending}
        className={`${buttonClass} disabled:cursor-not-allowed disabled:opacity-60`}
        title="Delete document"
      >
        {pending ? "Deleting..." : label}
      </button>
    </form>
  );
}
