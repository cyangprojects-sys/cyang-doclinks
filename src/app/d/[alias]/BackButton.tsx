"use client";

import { useRouter } from "next/navigation";

export default function BackButton({
  fallbackHref = "/",
  label = "Back",
}: {
  fallbackHref?: string;
  label?: string;
}) {
  const router = useRouter();

  function onBack() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push(fallbackHref);
  }

  return (
    <button
      type="button"
      onClick={onBack}
      className="inline-flex items-center rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-sm text-white/85 hover:bg-white/15"
    >
      {label}
    </button>
  );
}
