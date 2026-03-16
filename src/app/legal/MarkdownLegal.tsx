import type { ReactNode } from "react";
import { slugifyHeading } from "@/lib/legalDocs";

function splitTableCells(raw: string): string[] {
  return raw
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isTableSeparator(raw: string): boolean {
  const cells = splitTableCells(raw);
  if (!cells.length) return false;
  return cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function headingIdWithCounter(text: string, seen: Map<string, number>): string {
  const base = slugifyHeading(text);
  if (!base) return "section";
  const count = seen.get(base) || 0;
  seen.set(base, count + 1);
  return count === 0 ? base : `${base}-${count + 1}`;
}

export function MarkdownLegal({ markdown }: { markdown: string }) {
  const lines = String(markdown || "").replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  const seenHeadingIds = new Map<string, number>();

  let i = 0;
  let codeBlockOpen = false;
  let codeLang = "";
  let codeBuffer: string[] = [];

  const flushCode = () => {
    if (!codeBuffer.length) return;
    blocks.push(
      <pre
        key={`code-${blocks.length}`}
        className="overflow-x-auto rounded-2xl border border-white/12 bg-black/40 p-4 text-xs leading-relaxed text-white/82"
      >
        <code data-lang={codeLang || undefined}>{codeBuffer.join("\n")}</code>
      </pre>
    );
    codeBuffer = [];
    codeLang = "";
  };

  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.trim();

    if (line.startsWith("```")) {
      if (!codeBlockOpen) {
        codeBlockOpen = true;
        codeLang = line.slice(3).trim();
      } else {
        codeBlockOpen = false;
        flushCode();
      }
      i += 1;
      continue;
    }

    if (codeBlockOpen) {
      codeBuffer.push(raw);
      i += 1;
      continue;
    }

    if (!line) {
      i += 1;
      continue;
    }

    if (/^---+$/.test(line)) {
      blocks.push(<hr key={`hr-${blocks.length}`} className="my-8 border-white/12" />);
      i += 1;
      continue;
    }

    const h3 = line.match(/^###\s+(.+)$/);
    if (h3) {
      const id = headingIdWithCounter(h3[1], seenHeadingIds);
      blocks.push(
        <h3 id={id} key={`h3-${blocks.length}`} className="group scroll-mt-28 text-xl font-semibold tracking-tight text-white">
          <a href={`#${id}`} className="text-white hover:text-white">
            {h3[1]}
          </a>
        </h3>
      );
      i += 1;
      continue;
    }

    const h2 = line.match(/^##\s+(.+)$/);
    if (h2) {
      const id = headingIdWithCounter(h2[1], seenHeadingIds);
      blocks.push(
        <h2 id={id} key={`h2-${blocks.length}`} className="group scroll-mt-28 text-2xl font-semibold tracking-tight text-white">
          <a href={`#${id}`} className="text-white hover:text-white">
            {h2[1]}
          </a>
        </h2>
      );
      i += 1;
      continue;
    }

    const h1 = line.match(/^#\s+(.+)$/);
    if (h1) {
      const id = headingIdWithCounter(h1[1], seenHeadingIds);
      blocks.push(
        <h1 id={id} key={`h1-${blocks.length}`} className="group scroll-mt-28 text-3xl font-semibold tracking-tight text-white">
          <a href={`#${id}`} className="text-white hover:text-white">
            {h1[1]}
          </a>
        </h1>
      );
      i += 1;
      continue;
    }

    if (line.startsWith("|") && i + 1 < lines.length && isTableSeparator(lines[i + 1].trim())) {
      const headers = splitTableCells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        rows.push(splitTableCells(lines[i]));
        i += 1;
      }

      blocks.push(
        <div key={`table-${blocks.length}`} className="overflow-x-auto rounded-2xl border border-white/12">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-white/5 text-white/88">
              <tr>
                {headers.map((header, idx) => (
                  <th key={`${header}-${idx}`} className="px-4 py-3 font-semibold">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIdx) => (
                <tr key={rowIdx} className="border-t border-white/10">
                  {headers.map((_, colIdx) => (
                    <td key={`${rowIdx}-${colIdx}`} className="px-4 py-3 text-white/76">
                      {row[colIdx] || "-"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, "").trim());
        i += 1;
      }
      blocks.push(
        <ol key={`ol-${blocks.length}`} className="list-decimal space-y-1 pl-6 text-sm leading-7 text-white/78">
          {items.map((item, idx) => (
            <li key={idx}>{item}</li>
          ))}
        </ol>
      );
      continue;
    }

    if (line.startsWith("- ")) {
      const items: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("- ")) {
        items.push(lines[i].trim().slice(2).trim());
        i += 1;
      }
      blocks.push(
        <ul key={`ul-${blocks.length}`} className="list-disc space-y-1 pl-6 text-sm leading-7 text-white/78">
          {items.map((item, idx) => (
            <li key={idx}>{item}</li>
          ))}
        </ul>
      );
      continue;
    }

    if (line.startsWith("> ")) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("> ")) {
        quoteLines.push(lines[i].trim().slice(2));
        i += 1;
      }
      blocks.push(
        <blockquote
          key={`quote-${blocks.length}`}
          className="rounded-2xl border border-white/12 bg-black/25 px-4 py-3 text-sm leading-relaxed text-white/75"
        >
          {quoteLines.join(" ")}
        </blockquote>
      );
      continue;
    }

    const paraLines: string[] = [line];
    i += 1;
    while (i < lines.length) {
      const next = lines[i].trim();
      if (
        !next ||
        /^#{1,3}\s+/.test(next) ||
        /^---+$/.test(next) ||
        /^\d+\.\s+/.test(next) ||
        next.startsWith("- ") ||
        next.startsWith("```") ||
        next.startsWith("|") ||
        next.startsWith("> ")
      ) {
        break;
      }
      paraLines.push(next);
      i += 1;
    }

    blocks.push(
      <p key={`p-${blocks.length}`} className="text-sm leading-7 text-white/80">
        {paraLines.join(" ")}
      </p>
    );
  }

  if (codeBlockOpen) flushCode();

  return <div className="space-y-6">{blocks}</div>;
}
