function renderInline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    const bold = part.match(/^\*\*([^*]+)\*\*$/);
    if (bold) {
      return (
        <strong key={i} className="font-semibold">
          {bold[1]}
        </strong>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

export function MarkdownAnswer({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: Array<{ type: "p" | "ol" | "ul"; items: string[] }> = [];
  for (const line of lines) {
    const numbered = line.match(/^\s*\d+\.\s+(.*)$/);
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    if (numbered) {
      const last = blocks[blocks.length - 1];
      if (last?.type === "ol") last.items.push(numbered[1]);
      else blocks.push({ type: "ol", items: [numbered[1]] });
      continue;
    }
    if (bullet) {
      const last = blocks[blocks.length - 1];
      if (last?.type === "ul") last.items.push(bullet[1]);
      else blocks.push({ type: "ul", items: [bullet[1]] });
      continue;
    }
    if (!line.trim()) {
      blocks.push({ type: "p", items: [""] });
      continue;
    }
    const last = blocks[blocks.length - 1];
    if (last?.type === "p" && last.items[last.items.length - 1] !== "") {
      last.items[last.items.length - 1] += ` ${line.trim()}`;
    } else {
      blocks.push({ type: "p", items: [line.trim()] });
    }
  }

  return (
    <div className="space-y-3 text-[15px] leading-relaxed text-[var(--ink)]">
      {blocks.map((block, i) => {
        if (block.type === "ol") {
          return (
            <ol key={i} className="list-decimal space-y-2 pl-5">
              {block.items.map((item, j) => (
                <li key={j}>{renderInline(item)}</li>
              ))}
            </ol>
          );
        }
        if (block.type === "ul") {
          return (
            <ul key={i} className="list-disc space-y-2 pl-5">
              {block.items.map((item, j) => (
                <li key={j}>{renderInline(item)}</li>
              ))}
            </ul>
          );
        }
        if (!block.items[0]) return <div key={i} className="h-1" />;
        return <p key={i}>{renderInline(block.items[0])}</p>;
      })}
    </div>
  );
}
