import { DEMO_DOC_URL } from "@/lib/demo";

type DemoDocButtonProps = {
  /** Button/link label shown to the user (avoid raw URLs in UI copy). */
  label?: string;
  /** Optional className so you can reuse existing Tailwind/button styles. */
  className?: string;
  /** Optional title tooltip. */
  title?: string;
};

/**
 * Clean UX demo CTA:
 * - opens in a new tab
 * - prevents opener attacks (noopener/noreferrer)
 * - avoids exposing the raw token URL in visible copy (unless you choose to)
 */
export function DemoDocButton({
  label = "View demo document",
  className = "",
  title = "Open demo document (new tab)",
}: DemoDocButtonProps) {
  return (
    <a
      href={DEMO_DOC_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      title={title}
      aria-label="Open demo document in a new tab"
    >
      {label}
    </a>
  );
}
