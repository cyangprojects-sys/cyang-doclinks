// src/app/admin/DeleteDocForm.tsx
"use client";

import { useTransition } from "react";

export default function DeleteDocForm({
  docId,
  title,
  action,
}: {
  docId: string;
  title: string;
  action: (formData: FormData) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <form
      action={(fd) => {
        const ok = window.confirm(
          `Delete this document?\n\n${title}\n\nThis removes the file from R2 and deletes database records.`
        );
        if (!ok) return;
        startTransition(() => action(fd));
      }}
      className="inline-flex"
    >
      <input type="hidden" name="docId" value={docId} />
      <button
        type="submit"
        disabled={pending}
        className="btn-base btn-danger rounded-lg px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-60"
        title="Delete document"
      >
        {pending ? "Deleting..." : "Delete"}
      </button>
    </form>
  );
}

