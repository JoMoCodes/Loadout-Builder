// Text width in pixels, measured with the font the grid draws in.

let context: CanvasRenderingContext2D | null | undefined;

function canvas(): CanvasRenderingContext2D | null {
  if (context === undefined) {
    context =
      typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
  }
  return context;
}

/** Returns a measuring function for one font. Falls back to a rough guess with no canvas. */
export function textMeasurer(font: string, sizePx: number): (text: string) => number {
  const ctx = canvas();
  if (!ctx) return (text) => text.length * sizePx * 0.55;
  const cache = new Map<string, number>();
  return (text) => {
    let width = cache.get(text);
    if (width === undefined) {
      ctx.font = font;
      width = ctx.measureText(text).width;
      cache.set(text, width);
    }
    return width;
  };
}

/** The app's interface and monospace fonts, read from the tokens. */
export function gridFonts(): { ui: string; mono: string } {
  if (typeof document === 'undefined') return { ui: 'system-ui', mono: 'monospace' };
  const style = getComputedStyle(document.documentElement);
  return {
    ui: style.getPropertyValue('--font-ui').trim() || 'system-ui',
    mono: style.getPropertyValue('--font-mono').trim() || 'monospace',
  };
}
