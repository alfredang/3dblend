/** Tiny, dependency-free Markdown renderer for chat replies (bold, italics, code, lists, links, paragraphs). */
import React from "react";

function inline(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    if (t.startsWith("**")) out.push(<strong key={k++}>{t.slice(2, -2)}</strong>);
    else if (t.startsWith("`")) out.push(<code key={k++}>{t.slice(1, -1)}</code>);
    else if (t.startsWith("[")) {
      const mm = t.match(/\[([^\]]+)\]\(([^)]+)\)/)!;
      out.push(<a key={k++} href={mm[2]} className="text-accent underline" target="_blank" rel="noreferrer">{mm[1]}</a>);
    } else out.push(<em key={k++}>{t.slice(1, -1)}</em>);
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ text }: { text: string }) {
  const blocks = text.replace(/\r/g, "").split(/\n{2,}/);
  return (
    <>
      {blocks.map((b, i) => {
        const lines = b.split("\n").filter((l) => l.trim());
        if (!lines.length) return null;
        if (lines.every((l) => /^\s*([-*•]|\d+[.)])\s+/.test(l))) {
          const ordered = /^\s*\d+[.)]/.test(lines[0]);
          const items = lines.map((l, j) => <li key={j}>{inline(l.replace(/^\s*([-*•]|\d+[.)])\s+/, ""))}</li>);
          return ordered ? <ol key={i} className="list-decimal pl-5">{items}</ol> : <ul key={i}>{items}</ul>;
        }
        if (/^>\s?/.test(lines[0])) return <blockquote key={i} className="border-l-2 border-accent-3 pl-3 text-accent-3">{inline(lines.map((l) => l.replace(/^>\s?/, "")).join(" "))}</blockquote>;
        if (/^#{1,3}\s/.test(lines[0])) return <h4 key={i} className="font-semibold">{inline(lines[0].replace(/^#{1,3}\s/, ""))}</h4>;
        return <p key={i}>{lines.map((l, j) => <React.Fragment key={j}>{inline(l)}{j < lines.length - 1 && <br />}</React.Fragment>)}</p>;
      })}
    </>
  );
}
