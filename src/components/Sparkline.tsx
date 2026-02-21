// src/components/Sparkline.tsx
// Tiny zero-dependency sparkline (server-component friendly).
// Renders an SVG polyline scaled to the data range.

export default function Sparkline({
  values,
  width = 160,
  height = 40,
  strokeWidth = 2,
  ariaLabel,
}: {
  values: number[];
  width?: number;
  height?: number;
  strokeWidth?: number;
  ariaLabel?: string;
}) {
  const vals = Array.isArray(values) ? values.filter((v) => Number.isFinite(v)) : [];
  if (!vals.length) {
    return (
      <svg width={width} height={height} role="img" aria-label={ariaLabel ?? "sparkline"}>
        <rect x="0" y="0" width={width} height={height} rx="8" ry="8" fill="currentColor" opacity="0.06" />
      </svg>
    );
  }

  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;

  const pad = 2;
  const w = Math.max(1, width - pad * 2);
  const h = Math.max(1, height - pad * 2);

  const pts = vals
    .map((v, i) => {
      const x = pad + (i * w) / Math.max(1, vals.length - 1);
      const y = pad + (1 - (v - min) / span) * h;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  return (
    <svg width={width} height={height} role="img" aria-label={ariaLabel ?? "sparkline"}>
      <rect x="0" y="0" width={width} height={height} rx="8" ry="8" fill="currentColor" opacity="0.06" />
      <polyline
        points={pts}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity="0.85"
      />
    </svg>
  );
}
