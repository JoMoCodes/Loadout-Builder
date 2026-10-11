// The Dashboard's charts, drawn as inline SVG so they follow the theme (every colour is a token
// from tokens.css) and the A+ / A- text size (sizes are worked out from the root font size).
// Each chart has role="img" and a label that reads out its numbers.

import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from 'react';
import { cn } from '../../ui/cn';
import { TIER_COLOUR, TIERS, categoryTrend, score } from './words';

/** The size of an element, kept up to date as the window or the text size changes. */
function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => {
      const box = element.getBoundingClientRect();
      setSize((now) =>
        Math.round(now.width) === Math.round(box.width) &&
        Math.round(now.height) === Math.round(box.height)
          ? now
          : { width: box.width, height: box.height },
      );
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, size] as const;
}

/** One rem in pixels, so the drawings grow with A+. */
function useRem(): number {
  const [rem, setRem] = useState(14);
  useEffect(() => {
    const read = () =>
      setRem(parseFloat(getComputedStyle(document.documentElement).fontSize) || 14);
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
    return () => observer.disconnect();
  }, []);
  return rem;
}

// ------------------------------------------------------------------------------ sparkline

/** A tiny line of the fleet average, week by week. */
export function Sparkline({
  points,
  label,
  testId,
}: {
  points: ReadonlyArray<{ week: string; avg: number }>;
  label: string;
  testId?: string;
}) {
  const [ref, { width, height }] = useSize<HTMLDivElement>();
  const values = points.map((p) => p.avg);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = 3;
  const x = (i: number) =>
    points.length === 1 ? width / 2 : pad + (i * (width - 2 * pad)) / (points.length - 1);
  const y = (v: number) =>
    max === min ? height / 2 : pad + ((max - v) * (height - 2 * pad)) / (max - min);
  const line = points.map((p, i) => `${x(i).toFixed(1)},${y(p.avg).toFixed(1)}`).join(' ');
  const last = points[points.length - 1];
  return (
    <div ref={ref} className="h-8 w-full" role="img" aria-label={label} data-testid={testId}>
      {width > 0 && last ? (
        <svg width={width} height={height} aria-hidden="true" className="block overflow-visible">
          <polyline
            points={line}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <circle
            cx={x(points.length - 1)}
            cy={y(last.avg)}
            r={3}
            fill="var(--accent)"
            stroke="var(--surface)"
            strokeWidth={2}
          />
        </svg>
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------------------------ tier bar

/** The four tiers as one bar, each part as wide as its share of the drivers. */
export function TierBar({
  tiers,
  label,
}: {
  tiers: ReadonlyArray<{ tier: string; count: number }>;
  label: string;
}) {
  const [ref, { width, height }] = useSize<HTMLDivElement>();
  const parts = TIERS.map((tier) => ({
    tier,
    count: tiers.find((t) => t.tier === tier)?.count ?? 0,
  })).filter((part) => part.count > 0);
  const total = parts.reduce((sum, part) => sum + part.count, 0);
  const gap = 2;
  const room = Math.max(0, width - gap * Math.max(0, parts.length - 1));
  return (
    <div
      ref={ref}
      className="h-3 w-full"
      role="img"
      aria-label={label}
      data-testid="dashboard-tier-bar"
    >
      {width > 0 && total > 0 ? (
        <svg width={width} height={height} aria-hidden="true" className="block">
          {parts.map((part, index) => {
            const w = (part.count / total) * room;
            const at =
              parts.slice(0, index).reduce((sum, one) => sum + (one.count / total) * room, 0) +
              gap * index;
            return (
              <rect
                key={part.tier}
                x={at}
                y={0}
                width={Math.max(w, 1)}
                height={height}
                rx={Math.min(4, height / 2)}
                fill={TIER_COLOUR[part.tier]}
              >
                <title>{`${part.tier}: ${part.count}`}</title>
              </rect>
            );
          })}
        </svg>
      ) : (
        <div className="h-full w-full rounded-sm bg-neutral-soft" />
      )}
    </div>
  );
}

// ------------------------------------------------------------------------------ trend line

/** Tick marks for the score axis: about four round numbers covering the values. */
export function scoreTicks(
  min: number,
  max: number,
): { low: number; high: number; ticks: number[] } {
  if (!Number.isFinite(min) || !Number.isFinite(max))
    return { low: 0, high: 100, ticks: [0, 50, 100] };
  let span = max - min;
  if (span < 2) {
    const mid = (max + min) / 2;
    min = mid - 1;
    max = mid + 1;
    span = 2;
  }
  const step = [0.5, 1, 2, 5, 10, 20, 25, 50].find((s) => span / s <= 4) ?? 50;
  const low = Math.max(0, Math.floor(min / step) * step);
  const high = Math.min(100, Math.ceil(max / step) * step);
  const ticks: number[] = [];
  for (let t = low; t <= high + 1e-9; t += step) ticks.push(Number(t.toFixed(2)));
  return { low, high: high === low ? low + step : high, ticks };
}

/** Week labels that fit: every n-th, always the last. */
function shownLabels(count: number, room: number, labelWidth: number): Set<number> {
  const every = Math.max(1, Math.ceil((count * labelWidth) / Math.max(room, 1)));
  const shown = new Set<number>();
  for (let i = count - 1; i >= 0; i -= every) shown.add(i);
  return shown;
}

/** The fleet average Overall Score, week by week, with the axes labelled. */
export function TrendChart({
  points,
  label,
}: {
  points: ReadonlyArray<{ week: string; avg: number }>;
  label: string;
}) {
  const [ref, { width, height }] = useSize<HTMLDivElement>();
  const rem = useRem();
  const [hover, setHover] = useState<number | null>(null);
  const values = points.map((p) => p.avg);
  const { low, high, ticks } = scoreTicks(Math.min(...values), Math.max(...values));
  const left = 2.6 * rem;
  const right = 1.2 * rem;
  const top = 0.8 * rem;
  const bottom = 2 * rem;
  const plotW = Math.max(1, width - left - right);
  const plotH = Math.max(1, height - top - bottom);
  const x = (i: number) =>
    points.length === 1 ? left + plotW / 2 : left + (i * plotW) / (points.length - 1);
  const y = (v: number) => top + ((high - v) * plotH) / (high - low);
  const labels = shownLabels(points.length, plotW, 5.2 * rem);
  const line = points.map((p, i) => `${x(i).toFixed(1)},${y(p.avg).toFixed(1)}`).join(' ');
  const area =
    points.length > 1
      ? `${x(0).toFixed(1)},${(top + plotH).toFixed(1)} ${line} ${x(points.length - 1).toFixed(1)},${(top + plotH).toFixed(1)}`
      : '';

  function track(event: PointerEvent<SVGRectElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    const px = event.clientX - box.left;
    if (points.length === 1) return setHover(0);
    const i = Math.round((px / box.width) * (points.length - 1));
    setHover(Math.max(0, Math.min(points.length - 1, i)));
  }

  const hovered = hover !== null ? points[hover] : undefined;
  return (
    <div
      ref={ref}
      className="relative h-[14rem] w-full"
      role="img"
      aria-label={label}
      data-testid="dashboard-trend-chart"
    >
      {width > 0 && points.length > 0 ? (
        <svg width={width} height={height} aria-hidden="true" className="block text-[0.786rem]">
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={left}
                x2={left + plotW}
                y1={y(t)}
                y2={y(t)}
                stroke="var(--border)"
                strokeWidth={1}
                strokeDasharray={t === low ? undefined : '2 4'}
              />
              <text
                x={left - 0.5 * rem}
                y={y(t)}
                dy="0.35em"
                textAnchor="end"
                fill="var(--text-muted)"
                className="tabular-nums"
              >
                {Number.isInteger(t) ? t : t.toFixed(1)}
              </text>
            </g>
          ))}
          {points.map((p, i) =>
            labels.has(i) ? (
              <text
                key={p.week}
                x={x(i)}
                y={top + plotH + 1.3 * rem}
                textAnchor={
                  points.length > 1 && i === points.length - 1
                    ? 'end'
                    : points.length > 1 && i === 0
                      ? 'start'
                      : 'middle'
                }
                fill="var(--text-muted)"
              >
                {p.week}
              </text>
            ) : null,
          )}
          {area ? <polygon points={area} fill="var(--accent-soft)" opacity={0.6} /> : null}
          {points.length > 1 ? (
            <polyline
              points={line}
              fill="none"
              stroke="var(--accent)"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ) : null}
          {hovered && hover !== null ? (
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1={top}
              y2={top + plotH}
              stroke="var(--border-strong)"
              strokeWidth={1}
            />
          ) : null}
          {points.map((p, i) => (
            <circle
              key={p.week}
              cx={x(i)}
              cy={y(p.avg)}
              r={hover === i ? 5 : points.length > 16 ? 2.5 : 3.5}
              fill="var(--accent)"
              stroke="var(--surface)"
              strokeWidth={2}
            />
          ))}
          <rect
            x={left}
            y={top}
            width={plotW}
            height={plotH}
            fill="transparent"
            onPointerMove={track}
            onPointerLeave={() => setHover(null)}
          />
        </svg>
      ) : null}
      {hovered && hover !== null ? (
        <div
          className="pointer-events-none absolute rounded-md border border-line bg-raised px-2 py-1 text-[0.857rem] whitespace-nowrap shadow-popover"
          style={{
            left: Math.min(Math.max(x(hover), 4 * rem), width - 4 * rem),
            top: Math.max(0, y(hovered.avg) - 2.6 * rem),
            transform: 'translateX(-50%)',
          }}
          data-testid="dashboard-trend-tip"
        >
          <span className="text-muted">{hovered.week}</span>{' '}
          <span className="font-semibold tabular-nums">{score(hovered.avg)}</span>
        </div>
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------------------------ categories

export interface CategoryRow {
  source: string;
  category: string;
  count: number;
  firstHalf: number;
  secondHalf: number;
}

/** The failure reasons as bars, the longest first, each marked growing or shrinking. */
export function CategoryBars({
  rows,
  showTrend,
  label,
}: {
  rows: readonly CategoryRow[];
  showTrend: boolean;
  label: string;
}) {
  const top = Math.max(1, ...rows.map((row) => row.count));
  return (
    <div role="img" aria-label={label} data-testid="dashboard-categories">
      <ul className="m-0 grid list-none gap-2 p-0" aria-hidden="true">
        {rows.map((row) => {
          const trend = categoryTrend(row.firstHalf, row.secondHalf);
          return (
            <li
              key={`${row.source}:${row.category}`}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1"
              data-testid="category-row"
              data-trend={showTrend ? trend : 'none'}
            >
              <span className="min-w-0 truncate text-sm">
                <span className="font-semibold text-muted">{row.source}</span> {row.category}
              </span>
              <span className="flex items-center gap-2 text-sm tabular-nums">
                {showTrend && trend !== 'steady' ? (
                  <span
                    className={cn(
                      'text-[0.786rem] font-medium',
                      trend === 'growing' ? 'text-bad' : 'text-ok',
                    )}
                  >
                    {trend === 'growing' ? '↑ growing' : '↓ shrinking'}
                  </span>
                ) : showTrend ? (
                  <span className="text-[0.786rem] text-faint">steady</span>
                ) : null}
                <span className="min-w-[2.5rem] text-right font-semibold">{row.count}</span>
              </span>
              <svg className="col-span-2 block h-2 w-full" aria-hidden="true">
                <rect x="0" y="0" width="100%" height="100%" rx="4" fill="var(--neutral-soft)" />
                <rect
                  x="0"
                  y="0"
                  width={`${Math.max(1, (row.count / top) * 100)}%`}
                  height="100%"
                  rx="4"
                  fill={trend === 'growing' && showTrend ? 'var(--bad)' : 'var(--accent)'}
                />
              </svg>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
