// The contrast check the look tests share: every bit of readable text against its real background.

import type { Page } from '@playwright/test';

/**
 * Text that fails WCAG AA (4.5:1) against what is actually behind it: "what it says: ratio".
 * Runs inside the page, over everything under `root` (a CSS selector; the whole page by default).
 */
export async function contrastProblems(page: Page, root = 'body'): Promise<string[]> {
  return page.evaluate((within) => {
    type Rgba = [number, number, number, number];
    const parse = (text: string): Rgba | null => {
      let m = /rgba?\(([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:[ ,/]+([\d.]+%?))?\)/.exec(text);
      if (m) {
        const alpha =
          m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : Number(m[4]);
        return [Number(m[1]), Number(m[2]), Number(m[3]), alpha];
      }
      m = /color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?\)/.exec(text);
      if (m)
        return [
          Number(m[1]) * 255,
          Number(m[2]) * 255,
          Number(m[3]) * 255,
          m[4] ? Number(m[4]) : 1,
        ];
      return null;
    };
    const over = (top: Rgba, under: Rgba): Rgba => {
      const a = top[3];
      return [
        top[0] * a + under[0] * (1 - a),
        top[1] * a + under[1] * (1 - a),
        top[2] * a + under[2] * (1 - a),
        1,
      ];
    };
    const lum = ([r, g, b]: Rgba) => {
      const c = (v: number) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b);
    };
    const ratio = (a: Rgba, b: Rgba) => {
      const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p) as [number, number];
      return (x + 0.05) / (y + 0.05);
    };
    const background = (el: Element): Rgba | null => {
      const layers: Rgba[] = [];
      for (let node: Element | null = el; node; node = node.parentElement) {
        const style = getComputedStyle(node);
        const bg = parse(style.backgroundColor);
        if (bg === null && style.backgroundColor !== 'transparent') return null; // unknown format
        if (bg && bg[3] > 0) {
          layers.push(bg);
          if (bg[3] >= 1) break;
        }
      }
      let result: Rgba = [255, 255, 255, 1];
      for (const layer of layers.reverse()) result = over(layer, result);
      return result;
    };

    const problems: string[] = [];
    const scope = document.querySelector(within) ?? document.body;
    const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
    const seen = new Set<Element>();
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const el = node.parentElement;
      if (!el || seen.has(el) || !(node.textContent ?? '').trim()) continue;
      seen.add(el);
      if (el.closest('[disabled], [aria-hidden="true"], .sr-only, option')) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0 || rect.bottom < 0 || rect.top > innerHeight)
        continue;
      const style = getComputedStyle(el);
      if (style.visibility === 'hidden' || Number(style.opacity) === 0) continue;
      const fg = parse(style.color);
      const bg = background(el);
      if (!fg || !bg) continue;
      const value = ratio(over(fg, bg), bg);
      if (value < 4.5)
        problems.push(`${(node.textContent ?? '').trim().slice(0, 30)}: ${value.toFixed(2)}`);
    }
    return problems;
  }, root);
}
