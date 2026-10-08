// WCAG contrast between two colours, for checking the theme tokens.

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** '#1a2b3c' or '#abc' -> [r, g, b]. */
export function parseHex(hex: string): [number, number, number] {
  let text = hex.trim().replace(/^#/, '');
  if (text.length === 3) text = [...text].map((c) => c + c).join('');
  if (!/^[0-9a-f]{6}$/i.test(text)) throw new Error(`Not a colour: ${hex}`);
  return [0, 2, 4].map((at) => parseInt(text.slice(at, at + 2), 16)) as [number, number, number];
}

export function luminance(hex: string): number {
  const [r, g, b] = parseHex(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** The contrast ratio, from 1 (no contrast) to 21 (black on white). */
export function contrastRatio(a: string, b: string): number {
  const x = luminance(a);
  const y = luminance(b);
  const [light, dark] = x > y ? [x, y] : [y, x];
  return (light + 0.05) / (dark + 0.05);
}

/** Each theme block's `--name: #hex;` tokens, keyed by its data-theme value. */
export function readThemes(css: string): Record<string, Record<string, string>> {
  const themes: Record<string, Record<string, string>> = {};
  const block = /html\[data-theme='([a-z-]+)'\]\s*\{([^}]*)\}/g;
  for (const match of css.matchAll(block)) {
    const name = match[1] as string;
    const tokens: Record<string, string> = {};
    for (const token of (match[2] as string).matchAll(
      /--([a-z0-9-]+):\s*(#[0-9a-fA-F]{3,6})\s*;/g,
    )) {
      tokens[token[1] as string] = token[2] as string;
    }
    themes[name] = tokens;
  }
  return themes;
}
