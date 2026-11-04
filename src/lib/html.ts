// Tiny HTML helpers shared by the site build, the admin preview and the admin API.
// No framework imports here: this file runs in Astro, the browser and Cloudflare Workers.

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s: unknown): string => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]!);

/** Allow only links that are safe to put in an href. Anything else becomes an empty string. */
export function safeUrl(u: unknown): string {
  const s = String(u ?? '').trim();
  if (!s) return '';
  if (/^(https?:\/\/|mailto:|tel:|\/|#)/i.test(s)) return s;
  if (/^[\w-]+(\.[\w-]+)+(\/|$|\?)/i.test(s)) return `https://${s}`;
  return '';
}

/** Inline Markdown: **bold**, *italic*, [text](url). Everything else is escaped. */
export function inlineMd(src: string): string {
  let t = esc(src);
  t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, text, url) => {
    const href = safeUrl(url.replace(/&amp;/g, '&'));
    if (!href) return text;
    const external = /^https?:/i.test(href);
    return `<a href="${esc(href)}"${external ? ' rel="noopener"' : ''}>${text}</a>`;
  });
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/(^|[^*\w])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
  t = t.replace(/(^|[^\w])_([^_\n]+)_(?!\w)/g, '$1<em>$2</em>');
  return t;
}

/**
 * Small Markdown subset for editors: paragraphs (blank line), line breaks (single newline),
 * "## " and "### " headings, "- " bullet lists, "1. " numbered lists, **bold**, *italic*, links.
 * Raw HTML is never passed through.
 */
export function md(src: unknown, opts: { inline?: boolean } = {}): string {
  const text = String(src ?? '').replace(/\r\n?/g, '\n').trim();
  if (!text) return '';
  if (opts.inline) return inlineMd(text).replace(/\n/g, '<br>');
  const blocks = text.split(/\n{2,}/);
  const out: string[] = [];
  for (const block of blocks) {
    const lines = block.split('\n');
    if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
      out.push(`<ul>${lines.map((l) => `<li>${inlineMd(l.replace(/^\s*[-*]\s+/, ''))}</li>`).join('')}</ul>`);
    } else if (lines.every((l) => /^\s*\d+[.)]\s+/.test(l))) {
      out.push(`<ol>${lines.map((l) => `<li>${inlineMd(l.replace(/^\s*\d+[.)]\s+/, ''))}</li>`).join('')}</ol>`);
    } else if (/^#{1,3}\s+/.test(lines[0]!)) {
      const level = lines[0]!.match(/^#+/)![0].length;
      const tag = level === 1 ? 'h2' : 'h3';
      out.push(`<${tag}>${inlineMd(lines[0]!.replace(/^#+\s+/, ''))}</${tag}>`);
      if (lines.length > 1) out.push(`<p>${inlineMd(lines.slice(1).join('\n')).replace(/\n/g, '<br>')}</p>`);
    } else {
      out.push(`<p>${inlineMd(block).replace(/\n/g, '<br>')}</p>`);
    }
  }
  return out.join('');
}

export const slugify = (s: string): string =>
  s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

export const uid = (): string => 's_' + Math.random().toString(36).slice(2, 8);
