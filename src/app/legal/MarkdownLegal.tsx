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
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
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

  let index = 0;
  let inCodeBlock = false;
  let codeLang = "";
  let codeBuffer: string[] = [];

  function flushCode() {
    if (!codeBuffer.length) return;
    blocks.push(
      <pre
        key={`code-${blocks.length}`}
        className="overflow-x-auto rounded-[1.5rem] border border-white/10 bg-black/35 p-4 text-xs leading-7 text-white/82"
      >
        <code data-lang={codeLang || undefined}>{codeBuffer.join("\n")}</code>
      </pre>
    );
    codeBuffer = [];
    codeLang = "";
  }

  while (index < lines.length) {
    const raw = lines[index];
    const line = raw.trim();

    if (line.startsWith("```")) {
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeLang = line.slice(3).trim();
      } else {
        inCodeBlock = false;
        flushCode();
      }
      index += 1;
      continue;
    }

    if (inCodeBlock) {
      codeBuffer.push(raw);
      index += 1;
      continue;
    }

    if (!line) {
      index += 1;
      continue;
    }

    if (/^---+$/.test(line)) {
      blocks.push(<hr key={`hr-${blocks.length}`} className="border-white/10" />);
      index += 1;
      continue;
    }

    const h3 = line.match(/^###\s+(.+)$/);
    if (h3) {
      const id = headingIdWithCounter(h3[1], seenHeadingIds);
      blocks.push(
        <h3 id={id} key={`h3-${blocks.length}`} className="scroll-mt-28 text-xl font-semibold tracking-tight text-white">
          <a href={`#${id}`}>{h3[1]}</a>
        </h3>
      );
      index += 1;
      continue;
    }

    const h2 = line.match(/^##\s+(.+)$/);
    if (h2) {
      const id = headingIdWithCounter(h2[1], seenHeadingIds);
      blocks.push(
        <h2 id={id} key={`h2-${blocks.length}`} className="scroll-mt-28 text-3xl font-semibold tracking-[-0.03em] text-white">
          <a href={`#${id}`}>{h2[1]}</a>
        </h2>
      );
      index += 1;
      continue;
    }

    const h1 = line.match(/^#\s+(.+)$/);
    if (h1) {
      const id = headingIdWithCounter(h1[1], seenHeadingIds);
      blocks.push(
        <h1 id={id} key={`h1-${blocks.length}`} className="scroll-mt-28 text-4xl font-semibold tracking-[-0.03em] text-white">
          <a href={`#${id}`}>{h1[1]}</a>
        </h1>
      );
      index += 1;
      continue;
    }

    if (line.startsWith("|") && index + 1 < lines.length && isTableSeparator(lines[index + 1].trim())) {
      const headers = splitTableCells(line);
      index += 2;
      const rows: string[][] = [];

      while (index < lines.length && lines[index].trim().startsWith("|")) {
        rows.push(splitTableCells(lines[index]));
        index += 1;
      }

      blocks.push(
        <div key={`table-${blocks.length}`} className="overflow-x-auto rounded-[1.5rem] border border-white/10">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-white/[0.04] text-white/88">
              <tr>
                {headers.map((header, cellIndex) => (
                  <th key={`${header}-${cellIndex}`} className="px-4 py-3 font-semibold">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={rowIndex} className="border-t border-white/8">
                  {headers.map((_, colIndex) => (
                    <td key={`${rowIndex}-${colIndex}`} className="px-4 py-3 text-white/72">
                      {row[colIndex] || "-"}
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
      while (index < lines.length && /^\d+\.\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^\d+\.\s+/, "").trim());
        index += 1;
      }
      blocks.push(
        <ol key={`ol-${blocks.length}`} className="list-decimal space-y-2 pl-6 text-sm leading-8 text-white/76">
          {items.map((item, itemIndex) => (
            <li key={itemIndex}>{item}</li>
          ))}
        </ol>
      );
      continue;
    }

    if (line.startsWith("- ")) {
      const items: string[] = [];
      while (index < lines.length && lines[index].trim().startsWith("- ")) {
        items.push(lines[index].trim().slice(2).trim());
        index += 1;
      }
      blocks.push(
        <ul key={`ul-${blocks.length}`} className="list-disc space-y-2 pl-6 text-sm leading-8 text-white/76">
          {items.map((item, itemIndex) => (
            <li key={itemIndex}>{item}</li>
          ))}
        </ul>
      );
      continue;
    }

    if (line.startsWith("> ")) {
      const quoteLines: string[] = [];
      while (index < lines.length && lines[index].trim().startsWith("> ")) {
        quoteLines.push(lines[index].trim().slice(2));
        index += 1;
      }
      blocks.push(
        <blockquote
          key={`quote-${blocks.length}`}
          className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] px-4 py-4 text-sm leading-7 text-white/70"
        >
          {quoteLines.join(" ")}
        </blockquote>
      );
      continue;
    }

    const paragraphLines = [line];
    index += 1;
    while (index < lines.length) {
      const next = lines[index].trim();
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
      paragraphLines.push(next);
      index += 1;
    }

    blocks.push(
      <p key={`p-${blocks.length}`} className="text-sm leading-8 text-white/78">
        {paragraphLines.join(" ")}
      </p>
    );
  }

  if (inCodeBlock) flushCode();

  return <div className="policy-prose space-y-7">{blocks}</div>;
}
