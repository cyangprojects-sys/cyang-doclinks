// src/app/admin/DeleteDocsForm.tsx
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
            style={{ display: "inline" }}
        >
            <input type="hidden" name="docId" value={docId} />
            <button
                type="submit"
                disabled={pending}
                style={{
                    padding: "6px 10px",
                    borderRadius: 10,
                    border: "1px solid rgba(255,255,255,0.18)",
                    background: "rgba(255,255,255,0.06)",
                    color: "white",
                    cursor: pending ? "not-allowed" : "pointer",
                }}
                title="Delete document"
            >
                {pending ? "Deleting…" : "Delete"}
            </button>
        </form>
    );
}
