import { useSyncExternalStore } from 'react';

// The page's base text size in pixels. It changes when the A+ / A- buttons set --font-scale
// on <html>, so anything sized in pixels (row heights, measured column widths) follows it.

function read(): number {
  if (typeof document === 'undefined') return 14;
  const size = parseFloat(getComputedStyle(document.documentElement).fontSize);
  return Number.isFinite(size) && size > 0 ? size : 14;
}

function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['style', 'class', 'data-theme'],
  });
  return () => observer.disconnect();
}

export function useRootFontSize(): number {
  return useSyncExternalStore(subscribe, read, () => 14);
}
