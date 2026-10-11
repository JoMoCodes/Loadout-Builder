// Test helper only: reads tables out of the report HTML without a browser.

/** HTML entities the report writes, back to text. */
export function decode(text: string): string {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

/** A cell's text: line breaks as "\n", tags dropped. */
export function cellText(html: string): string {
  return decode(html.replace(/<br>/g, '\n').replace(/<[^>]+>/g, ''));
}

/** One page's HTML (by its data-page name). */
export function pageHtml(html: string, name: string): string {
  const start = html.indexOf(`data-page="${name}"`);
  if (start < 0) throw new Error(`no page ${name}`);
  const end = html.indexOf('</section>', start);
  return html.slice(start, end);
}

/** Every table row as a list of cell texts (header and body cells alike). */
export function rows(html: string): string[][] {
  const out: string[][] = [];
  for (const match of html.matchAll(/<tr[^>]*>((?:(?!<tr)[\s\S])*?)<\/tr>/g)) {
    const cells = [...(match[1] ?? '').matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((c) =>
      cellText(c[1] ?? ''),
    );
    out.push(cells);
  }
  return out;
}

/**
 * The data cells of the first week-grid row whose label cell starts with `label` (the label cell may
 * also hold "Lower is Better").
 */
export function row(html: string, label: string): string[] {
  const grids = [...html.matchAll(/<table class="grid[\s\S]*?<\/table>/g)]
    .map((m) => m[0])
    .join('');
  const found = rows(grids).find((r) => {
    const first = r[0] ?? '';
    return (
      r.length > 1 &&
      (first === label || new RegExp(`^${escapeRe(label)}(Lower|Higher) is Better$`).test(first))
    );
  });
  if (!found) throw new Error(`no row ${label}`);
  return found.slice(1);
}

/** The first line of each cell (the metric value of a three-line cell). */
export function firstLines(cells: readonly string[]): string[] {
  return cells.map((c) => c.split('\n')[0] ?? '');
}

function escapeRe(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
