import { DEMO_DOC_URL } from "@/lib/demo";

type DemoDocButtonProps = {
  label?: string;
  className?: string;
  title?: string;
};

/**
 * Clean UX Demo Button
 * - Opens in new tab
 * - Uses noopener/noreferrer for security
 * - Keeps raw token out of visible UI copy
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
