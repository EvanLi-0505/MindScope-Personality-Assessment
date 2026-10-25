/**
 * A small, safe Markdown subset for AI answers: headings, bullet and numbered
 * lists, paragraphs and **bold**. Every character of the input is escaped
 * first, and the only tags in the output are the ones produced here, so raw
 * HTML, links and images from the model are shown as plain text.
 */

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ESC[c]!);

/** Inline: escape, then **bold**. Nothing else is interpreted. */
function inline(text: string): string {
  return escapeHtml(text).replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>');
}

export function renderSafeMarkdown(src: string): string {
  const out: string[] = [];
  let para: string[] = [];
  let list: { type: 'ul' | 'ol'; items: string[] } | null = null;

  const flushPara = () => {
    if (para.length) out.push(`<p>${para.map(inline).join('<br>')}</p>`);
    para = [];
  };
  const flushList = () => {
    if (list) out.push(`<${list.type}>${list.items.map((i) => `<li>${inline(i)}</li>`).join('')}</${list.type}>`);
    list = null;
  };

  for (const raw of src.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)、]\s+(.*)$/.exec(line);
    if (!line.trim()) {
      flushPara();
      flushList();
    } else if (heading) {
      flushPara();
      flushList();
      // Model headings start at h3 so they sit below the page's own titles.
      const level = Math.min(6, Math.max(3, heading[1]!.length + 1));
      out.push(`<h${level}>${inline(heading[2]!.replace(/#+\s*$/, ''))}</h${level}>`);
    } else if (bullet || numbered) {
      flushPara();
      const type = bullet ? 'ul' : 'ol';
      if (list && list.type !== type) flushList();
      list ??= { type, items: [] };
      list.items.push((bullet ?? numbered)![1]!);
    } else if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      flushPara();
      flushList();
    } else {
      flushList();
      para.push(line.trim());
    }
  }
  flushPara();
  flushList();
  return out.join('\n');
}
