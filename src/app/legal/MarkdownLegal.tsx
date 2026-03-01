import type { ReactNode } from "react";

function paragraphBlock(text: string, key: string) {
  return (
    <p key={key} className="text-sm leading-7 text-white/80">
      {text}
    </p>
  );
}

export function MarkdownLegal({ markdown }: { markdown: string }) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let codeBlockOpen = false;
  let codeLang = "";
  let codeBuffer: string[] = [];

  const flushCode = () => {
    if (!codeBuffer.length) return;
    blocks.push(
      <pre key={`code-${blocks.length}`} className="overflow-x-auto rounded-xl border border-white/10 bg-black/40 p-3 text-xs text-white/80">
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
      blocks.push(<hr key={`hr-${blocks.length}`} className="border-white/10" />);
      i += 1;
      continue;
    }

    const h3 = line.match(/^###\s+(.+)$/);
    if (h3) {
      blocks.push(
        <h3 key={`h3-${blocks.length}`} className="text-base font-semibold text-white">
          {h3[1]}
        </h3>
      );
      i += 1;
      continue;
    }

    const h2 = line.match(/^##\s+(.+)$/);
    if (h2) {
      blocks.push(
        <h2 key={`h2-${blocks.length}`} className="text-lg font-semibold text-white">
          {h2[1]}
        </h2>
      );
      i += 1;
      continue;
    }

    const h1 = line.match(/^#\s+(.+)$/);
    if (h1) {
      blocks.push(
        <h1 key={`h1-${blocks.length}`} className="text-2xl font-semibold text-white">
          {h1[1]}
        </h1>
      );
      i += 1;
      continue;
    }

    if (line.startsWith("- ")) {
      const items: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("- ")) {
        items.push(lines[i].trim().slice(2).trim());
        i += 1;
      }
      blocks.push(
        <ul key={`ul-${blocks.length}`} className="list-disc space-y-1 pl-6 text-sm leading-7 text-white/80">
          {items.map((item, idx) => (
            <li key={idx}>{item}</li>
          ))}
        </ul>
      );
      continue;
    }

    const paraLines: string[] = [line];
    i += 1;
    while (i < lines.length) {
      const next = lines[i].trim();
      if (!next || /^#{1,3}\s+/.test(next) || /^---+$/.test(next) || next.startsWith("- ") || next.startsWith("```")) {
        break;
      }
      paraLines.push(next);
      i += 1;
    }
    blocks.push(paragraphBlock(paraLines.join(" "), `p-${blocks.length}`));
  }

  if (codeBlockOpen) flushCode();

  return <div className="space-y-5">{blocks}</div>;
}

