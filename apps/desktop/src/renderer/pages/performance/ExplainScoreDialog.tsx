// "Explain this score": one driver's scored weeks in the chosen weeks, metric by metric (the
// newest first; a week picker shows any other), with a small chart of the points lost each week.
// Each metric's score counts for its weight, so it earns score x weight / 100 points and loses
// the rest of its weight. The metric losing the most comes first; it is the same one the
// Dashboard's "Who needs a word" list names. Opened from the Performance tab and the Dashboard.

import { useEffect, useMemo, useState } from 'react';
import type { PerfScoreExplanation, WeekRange } from '../../../shared/performance';
import { call, explain } from '../../lib/channels';
import { Chip } from '../../ui/chip';
import { Modal } from '../dataPages/Modal';
import {
  explainWords,
  lostByWeek,
  lostChartLabel,
  numberText,
  pointsText,
  rangeWords,
  tierTone,
} from './perfText';

interface ExplainScoreDialogProps {
  driver: { transporterId: string; name: string };
  range: WeekRange;
  onDone: () => void;
}

type Load =
  | { state: 'loading' }
  | { state: 'ready'; explanation: PerfScoreExplanation | null }
  | { state: 'problem'; words: string };

const CELL = 'py-1 pr-3';
const NUMBER = 'py-1 pr-3 text-right tabular-nums';

const SERIES_COLOURS = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)'];
const colourOf = (name: string, index: number) =>
  name === 'Other' ? 'var(--series-other)' : (SERIES_COLOURS[index] ?? 'var(--series-other)');

/**
 * Stacked bars of the points lost each week: the four metrics that lost the most over the weeks,
 * then "Other". Drawn in inline SVG with the theme's chart colours; the chosen week is outlined
 * and a click on a bar picks that week. The label reads every number out.
 */
function LostChart({
  weeks,
  chosen,
  onPick,
}: {
  weeks: readonly PerfScoreExplanation[];
  chosen: string;
  onPick: (week: string) => void;
}) {
  const chart = useMemo(() => lostByWeek(weeks, 4), [weeks]);
  const label = lostChartLabel(chart);
  const max = Math.max(1, ...chart.rows.map((row) => row.parts.reduce((a, b) => a + b, 0)));
  const height = 120;
  const barWidth = 22;
  const gap = 12;
  const top = 16;
  const width = chart.rows.length * (barWidth + gap) + gap;
  const scale = (points: number) => (points / max) * (height - top);
  return (
    <figure className="m-0 mt-3" data-testid="perf-explain-chart">
      <figcaption className="mb-1 text-sm font-semibold">Points lost each week</figcaption>
      <div className="overflow-x-auto">
        <svg
          role="img"
          aria-label={label}
          width={width}
          height={height + 22}
          viewBox={`0 0 ${width} ${height + 22}`}
          className="block"
          data-testid="perf-explain-chart-svg"
        >
          <line
            x1={0}
            x2={width}
            y1={height}
            y2={height}
            stroke="var(--border-strong)"
            strokeWidth={1}
          />
          {chart.rows.map((row, i) => {
            const x = gap + i * (barWidth + gap);
            let y = height;
            const isChosen = row.week === chosen;
            return (
              <g
                key={row.week}
                onClick={() => onPick(row.week)}
                className="cursor-pointer"
                data-testid="perf-explain-bar"
                data-week={row.week}
              >
                <title>{`${row.week}: ${pointsText(row.total)} points lost`}</title>
                <rect
                  x={x - gap / 2}
                  y={0}
                  width={barWidth + gap}
                  height={height}
                  fill="transparent"
                />
                {row.parts.map((part, index) => {
                  if (part <= 0) return null;
                  const h = Math.max(1, scale(part));
                  y -= h;
                  return (
                    <rect
                      key={chart.series[index]}
                      x={x}
                      y={y}
                      width={barWidth}
                      height={h}
                      rx={2}
                      fill={colourOf(chart.series[index]!, index)}
                      stroke="var(--surface)"
                      strokeWidth={1.5}
                    />
                  );
                })}
                {isChosen ? (
                  <rect
                    x={x - 3}
                    y={Math.min(y, height) - 3}
                    width={barWidth + 6}
                    height={height - Math.min(y, height) + 3}
                    fill="none"
                    stroke="var(--text)"
                    strokeWidth={1.5}
                    rx={3}
                  />
                ) : null}
                <text
                  x={x + barWidth / 2}
                  y={height + 15}
                  textAnchor="middle"
                  fontSize={11}
                  fill={isChosen ? 'var(--text)' : 'var(--text-muted)'}
                  fontWeight={isChosen ? 600 : 400}
                >
                  {row.week.slice(-3)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      {chart.series.length > 0 ? (
        <ul className="m-0 mt-1 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-sm text-muted">
          {chart.series.map((name, index) => (
            <li key={name} className="flex items-center gap-1.5" data-testid="perf-explain-legend">
              <span
                aria-hidden="true"
                className="inline-block size-3 rounded-sm"
                style={{ background: colourOf(name, index) }}
              />
              {name}
            </li>
          ))}
        </ul>
      ) : (
        <p className="m-0 mt-1 text-sm text-muted">No points were lost in these weeks.</p>
      )}
    </figure>
  );
}

export function ExplainScoreDialog({ driver, range, onDone }: ExplainScoreDialogProps) {
  const [load, setLoad] = useState<Load>({ state: 'loading' });

  useEffect(() => {
    let off = false;
    void call('performance:explain-score', { transporterId: driver.transporterId, range }).then(
      (reply) => {
        if (off) return;
        if (reply.ok) setLoad({ state: 'ready', explanation: reply.value ?? null });
        else setLoad({ state: 'problem', words: explain(reply) });
      },
    );
    return () => {
      off = true;
    };
  }, [driver.transporterId, range]);

  const newest = load.state === 'ready' ? load.explanation : null;
  const weeks = useMemo(() => newest?.weeks ?? (newest ? [newest] : []), [newest]);
  const [picked, setPicked] = useState<string | null>(null);
  const found = weeks.find((one) => one.week === picked) ?? newest;
  const lead = found
    ? `Week ${found.week}. Overall Score ${numberText(found.overallScore, 2) || '-'}${found.overallTier ? ` (${found.overallTier})` : ''}.`
    : `Weeks ${rangeWords(range)}.`;

  return (
    <Modal
      name="perf-explain-score"
      title={`Explain this score: ${driver.name}`}
      lead={lead}
      confirmLabel="Close"
      onConfirm={onDone}
      wide
    >
      {load.state === 'loading' ? (
        <p className="text-sm text-muted">Working out the score...</p>
      ) : null}
      {load.state === 'problem' ? (
        <p role="alert" className="problem text-sm">
          {load.words}
        </p>
      ) : null}
      {load.state === 'ready' && !found ? (
        <p className="my-1 text-sm" data-testid="perf-explain-summary">
          {driver.name} has no scorecard in {rangeWords(range)}, so there is no score to explain.
        </p>
      ) : null}
      {found ? (
        <>
          {weeks.length > 1 ? (
            <label className="mb-1 flex items-center gap-2 text-sm">
              Week
              <select
                value={found.week}
                onChange={(event) => setPicked(event.target.value)}
                className="h-8 rounded-md border border-line-strong bg-sunken px-2 text-sm text-fg"
                data-testid="perf-explain-week"
              >
                {[...weeks].reverse().map((one) => (
                  <option key={one.week} value={one.week}>
                    {one.week}
                    {one.week === newest?.week ? ' (newest)' : ''}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <p className="my-1 text-sm" data-testid="perf-explain-summary">
            {explainWords(found)}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm" data-testid="perf-explain-table">
              <thead>
                <tr className="border-b border-line text-left text-muted">
                  <th className={`${CELL} font-semibold`}>Metric</th>
                  <th className={`${CELL} font-semibold`}>Tier</th>
                  <th className={`${NUMBER} font-semibold`}>Score</th>
                  <th className={`${NUMBER} font-semibold`}>Weight</th>
                  <th className={`${NUMBER} font-semibold`}>Points earned</th>
                  <th className={`${NUMBER} font-semibold`}>Points lost</th>
                </tr>
              </thead>
              <tbody>
                {found.items.map((item, index) => (
                  <tr
                    key={`${item.metric}-${index}`}
                    className="border-b border-line align-top"
                    data-testid="perf-explain-row"
                    data-metric={item.metric}
                  >
                    <td className={CELL}>{item.metric}</td>
                    <td className={CELL}>
                      {item.tier ? (
                        <Chip tone={tierTone(item.tier)}>{item.tier}</Chip>
                      ) : (
                        <span className="text-faint">-</span>
                      )}
                    </td>
                    <td className={NUMBER}>
                      {item.score === null ? '-' : numberText(item.score, 2)}
                    </td>
                    <td className={NUMBER}>
                      {item.weight === null ? '-' : numberText(item.weight, 1)}
                    </td>
                    {item.counted ? (
                      <>
                        <td className={NUMBER}>{pointsText(item.earned ?? 0)}</td>
                        <td
                          className={`${NUMBER} ${(item.lost ?? 0) > 0 ? 'font-semibold text-bad' : ''}`}
                          data-testid="perf-explain-lost"
                        >
                          {pointsText(item.lost ?? 0)}
                        </td>
                      </>
                    ) : (
                      <td className={`${CELL} text-right text-muted`} colSpan={2}>
                        {item.score === null ? 'No score, not counted' : 'No weight, not counted'}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-semibold">
                  <td className={CELL} colSpan={3}>
                    Together
                  </td>
                  <td className={NUMBER}>{pointsText(found.totalWeight)}</td>
                  <td className={NUMBER} data-testid="perf-explain-earned-total">
                    {pointsText(found.totalEarned)}
                  </td>
                  <td className={NUMBER}>{pointsText(found.totalLost)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="mt-2 text-sm text-muted">
            Points earned are the score times the weight, divided by 100. Points lost are the rest
            of the weight. The metric at the top is the one to work on first.
          </p>
          {weeks.length > 0 ? (
            <LostChart weeks={weeks} chosen={found.week} onPick={setPicked} />
          ) : null}
        </>
      ) : null}
    </Modal>
  );
}
