// The Dashboard's parts, top to bottom: the four tiles, who needs a word next to the ID-expiry
// list, the movers, and the trend.

import { useState, type ReactNode } from 'react';
import type { PerfDashboardView } from '../../../shared/performance';
import { Button } from '../../ui/button';
import { Chip } from '../../ui/chip';
import { CategoryBars, Sparkline, TierBar, TrendChart } from './charts';
import { Card, ChangeChip, DriverRow, ExplainButton, Tile, type DriverMenuActions } from './parts';
import {
  TIER_COLOUR,
  TIERS,
  count,
  dragWords,
  idAlerts,
  idWords,
  plural,
  rangeWords,
  reasonWords,
  score,
  signed,
  tierTone,
  type ExplainId,
} from './words';

type Explain = (id: ExplainId) => void;

// ------------------------------------------------------------------------------ tiles

export function Tiles({ view, explain }: { view: PerfDashboardView; explain: Explain }) {
  const before = view.previousWeek;
  const trendLabel =
    'Fleet average score by week: ' +
    view.trend.map((point) => `${point.week} ${score(point.avg)}`).join(', ');
  const tierCounts = TIERS.map((tier) => ({
    tier,
    count: view.tiers.find((t) => t.tier === tier)?.count ?? 0,
    move: view.tierMoves.find((m) => m.tier === tier),
  }));
  const tierLabel =
    `Drivers by tier in ${view.latestWeek ?? 'the newest week'}: ` +
    tierCounts.map((t) => `${t.tier} ${t.count}`).join(', ');

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(15rem,1fr))] gap-3">
      <Tile
        title="Fleet average score"
        testId="tile-fleet"
        onExplain={() => explain('fleet')}
        what="the fleet average score"
      >
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span
            className="text-[2rem] leading-none font-semibold tabular-nums"
            data-testid="tile-fleet-value"
          >
            {score(view.fleetAverage)}
          </span>
          {view.fleetAverage !== null && view.fleetAverageBefore !== null ? (
            <ChangeChip
              change={view.fleetAverage - view.fleetAverageBefore}
              upIsGood
              suffix={before ? `vs ${before}` : undefined}
              testId="tile-fleet-change"
            />
          ) : null}
        </div>
        <p className="m-0 text-[0.857rem] text-muted">
          {view.latestWeek ? `In ${view.latestWeek}, ` : ''}
          {plural(view.activeDrivers, 'driver')}
        </p>
        {view.trend.length >= 2 ? (
          <Sparkline points={view.trend} label={trendLabel} testId="tile-fleet-spark" />
        ) : (
          <p className="m-0 text-[0.857rem] text-faint">Pick more weeks to see the line.</p>
        )}
      </Tile>

      <Tile title="Tiers" testId="tile-tiers" onExplain={() => explain('tiers')} what="the tiers">
        <TierBar tiers={view.tiers} label={tierLabel} />
        {/* Two by two in a narrow tile, four across when there is room, so the names never cut off. */}
        <ul className="m-0 mt-1 grid list-none grid-cols-[repeat(auto-fit,minmax(6rem,1fr))] gap-x-3 gap-y-1.5 p-0">
          {tierCounts.map((t) => (
            <li key={t.tier} className="flex min-w-0 flex-col" data-testid={`tier-${t.tier}`}>
              <span className="flex min-w-0 items-center gap-1 text-[0.786rem] text-muted">
                <span
                  aria-hidden="true"
                  className="inline-block size-1.5 shrink-0 rounded-full"
                  style={{ background: TIER_COLOUR[t.tier] }}
                />
                <span className="min-w-0 break-words">{t.tier}</span>
              </span>
              <span className="flex flex-wrap items-baseline gap-x-1.5">
                <span
                  className="text-[1.15rem] leading-tight font-semibold tabular-nums"
                  data-testid={`tier-${t.tier}-count`}
                >
                  {t.count}
                </span>
                {t.move && (t.move.into > 0 || t.move.outOf > 0) ? (
                  <span
                    className="text-[0.786rem] leading-snug text-muted tabular-nums"
                    data-testid={`tier-${t.tier}-moves`}
                  >
                    {t.move.into > 0 ? `${t.move.into} in` : ''}
                    {t.move.into > 0 && t.move.outOf > 0 ? ', ' : ''}
                    {t.move.outOf > 0 ? `${t.move.outOf} out` : ''}
                  </span>
                ) : (
                  <span className="text-[0.786rem] leading-snug text-faint">No moves</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      </Tile>

      <Tile
        title="Packages delivered"
        testId="tile-packages"
        onExplain={() => explain('packages')}
        what="packages delivered"
      >
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span
            className="text-[2rem] leading-none font-semibold tabular-nums"
            data-testid="tile-packages-value"
          >
            {count(view.packagesDelivered)}
          </span>
          {view.packagesDeliveredBefore !== null ? (
            <ChangeChip
              change={view.packagesDelivered - view.packagesDeliveredBefore}
              upIsGood={null}
              decimals={0}
              format={(value) => (value > 0 ? '+' : value < 0 ? '−' : '') + count(Math.abs(value))}
              suffix={before ? `vs ${before}` : undefined}
              testId="tile-packages-change"
            />
          ) : null}
        </div>
        <p className="m-0 text-[0.857rem] text-muted">
          {view.latestWeek ? `In ${view.latestWeek}` : ''}
        </p>
      </Tile>

      <Tile
        title="Drivers with safety events"
        testId="tile-safety"
        onExplain={() => explain('safety')}
        what="drivers with safety events"
      >
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span
            className="text-[2rem] leading-none font-semibold tabular-nums"
            data-testid="tile-safety-value"
          >
            {count(view.driversWithSafetyEvents)}
          </span>
          {view.driversWithSafetyEvents > 0 ? (
            <Chip tone="warn" data-testid="tile-safety-chip">
              Counts against the program
            </Chip>
          ) : (
            <Chip tone="ok">None</Chip>
          )}
        </div>
        <p className="m-0 text-[0.857rem] text-muted">
          Of {plural(view.activeDrivers, 'driver')}, in {rangeWords(view.range)}
        </p>
      </Tile>
    </div>
  );
}

// ------------------------------------------------------------------------------ people

const SHOW_FIRST = 8;

export function CoachingList({
  view,
  explain,
  actions,
}: {
  view: PerfDashboardView;
  explain: Explain;
  actions: DriverMenuActions;
}) {
  const [all, setAll] = useState(false);
  const flags = view.coaching
    .slice()
    .sort((a, b) => Number(b.severity === 'High') - Number(a.severity === 'High'));
  const high = flags.filter((flag) => flag.severity === 'High').length;
  const shown = all ? flags : flags.slice(0, SHOW_FIRST);
  return (
    <Card
      title="Who needs a word"
      titleId="dashboard-coaching-title"
      testId="dashboard-coaching"
      className="lg:col-span-2"
      aside={
        <>
          {flags.length > 0 ? (
            <span className="text-sm text-muted" data-testid="dashboard-coaching-counts">
              {high} High, {flags.length - high} Watch
            </span>
          ) : null}
          <ExplainButton
            onClick={() => explain('coaching')}
            testId="dashboard-coaching-explain"
            what="who needs a word"
          />
        </>
      }
    >
      {flags.length === 0 ? (
        <p className="m-0 py-4 text-sm text-muted" data-testid="dashboard-coaching-none">
          Nobody needs a word for {rangeWords(view.range)}.
        </p>
      ) : (
        <ul className="m-0 -mx-2 list-none divide-y divide-line p-0">
          {shown.map((flag) => {
            const drag = dragWords(flag);
            return (
              <li key={flag.transporterId}>
                <DriverRow
                  transporterId={flag.transporterId}
                  name={flag.name}
                  actions={actions}
                  testId="coaching-row"
                  extra={{ 'data-severity': flag.severity }}
                >
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <Chip
                      tone={flag.severity === 'High' ? 'bad' : 'warn'}
                      className="min-w-[4.5rem] justify-center"
                    >
                      {flag.severity}
                    </Chip>
                    <span className="font-semibold" data-testid="coaching-name">
                      {flag.name}
                    </span>
                    {flag.latestTier ? (
                      <Chip tone={tierTone(flag.latestTier)} icon={null}>
                        {flag.latestTier}
                      </Chip>
                    ) : null}
                    <span className="ml-auto text-base font-semibold tabular-nums">
                      {score(flag.latestScore)}
                    </span>
                  </span>
                  <span
                    className="mt-0.5 block pl-[5rem] text-sm text-fg"
                    data-testid="coaching-reasons"
                  >
                    {flag.reasons.map(reasonWords).join(' · ')}
                  </span>
                  {drag ? (
                    <span
                      className="block pl-[5rem] text-[0.857rem] text-muted"
                      data-testid="coaching-drag"
                    >
                      {drag}
                    </span>
                  ) : null}
                </DriverRow>
              </li>
            );
          })}
        </ul>
      )}
      {flags.length > SHOW_FIRST ? (
        <div className="mt-2">
          <Button size="sm" onClick={() => setAll(!all)} data-testid="dashboard-coaching-more">
            {all ? 'Show fewer' : `Show all ${flags.length}`}
          </Button>
        </div>
      ) : null}
    </Card>
  );
}

export function IdExpiryList({
  view,
  explain,
  actions,
}: {
  view: PerfDashboardView;
  explain: Explain;
  actions: DriverMenuActions;
}) {
  const [all, setAll] = useState(false);
  const alerts = idAlerts(view.compliance);
  const shown = all ? alerts : alerts.slice(0, SHOW_FIRST);
  const expired = alerts.filter((row) => row.severity === 'Expired').length;
  return (
    <Card
      title="ID expiry"
      titleId="dashboard-ids-title"
      testId="dashboard-compliance"
      aside={
        <ExplainButton
          onClick={() => explain('ids')}
          testId="dashboard-ids-explain"
          what="ID expiry"
        />
      }
    >
      {alerts.length === 0 ? (
        <p className="m-0 py-4 text-sm text-muted" data-testid="dashboard-ids-none">
          No IDs expired or expiring in the next {plural(view.rules.complianceWindowDays, 'day')}.
        </p>
      ) : (
        <>
          <p className="m-0 mb-1 text-sm text-muted" data-testid="dashboard-ids-counts">
            {expired} expired, {alerts.length - expired} expiring within{' '}
            {plural(view.rules.complianceWindowDays, 'day')}
          </p>
          <ul className="m-0 -mx-2 list-none divide-y divide-line p-0">
            {shown.map((row) => (
              <li key={row.transporterId}>
                <DriverRow
                  transporterId={row.transporterId}
                  name={row.name}
                  actions={actions}
                  testId="compliance-row"
                  extra={{ 'data-severity': row.severity }}
                >
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="min-w-0 font-medium">{row.name}</span>
                    <Chip
                      tone={row.severity === 'Expired' ? 'bad' : 'warn'}
                      className="ml-auto"
                      data-testid="compliance-words"
                    >
                      {idWords(row)}
                    </Chip>
                  </span>
                  {row.expiresOn ? (
                    <span className="block text-[0.857rem] text-muted tabular-nums">
                      {row.severity === 'Expired' ? 'Expired on' : 'Expires on'} {row.expiresOn}
                      {row.status && row.status !== 'ACTIVE'
                        ? ` · ${row.status.charAt(0)}${row.status.slice(1).toLowerCase()}`
                        : ''}
                    </span>
                  ) : null}
                </DriverRow>
              </li>
            ))}
          </ul>
          {alerts.length > SHOW_FIRST ? (
            <div className="mt-2">
              <Button size="sm" onClick={() => setAll(!all)} data-testid="dashboard-ids-more">
                {all ? 'Show fewer' : `Show all ${alerts.length}`}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </Card>
  );
}

function MoverList({
  title,
  rows,
  testId,
  actions,
  empty,
  aside,
}: {
  title: string;
  rows: PerfDashboardView['topImproved'];
  testId: string;
  actions: DriverMenuActions;
  empty: string;
  aside?: ReactNode;
}) {
  return (
    <Card title={title} titleId={`${testId}-title`} testId={testId} aside={aside}>
      {rows.length === 0 ? (
        <p className="m-0 py-3 text-sm text-muted">{empty}</p>
      ) : (
        <ol className="m-0 -mx-2 list-none divide-y divide-line p-0">
          {rows.map((row) => (
            <li key={row.transporterId}>
              <DriverRow
                transporterId={row.transporterId}
                name={row.name}
                actions={actions}
                testId="mover-row"
              >
                <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                  <span className="min-w-0 flex-1 font-medium">{row.name}</span>
                  <span className="text-sm text-muted tabular-nums" data-testid="mover-move">
                    {score(row.firstScore)} {'→'} {score(row.lastScore)}
                  </span>
                  <ChangeChip change={row.delta} upIsGood testId="mover-change" />
                </span>
                <span className="block text-[0.786rem] text-faint tabular-nums">
                  {row.firstWeek === row.lastWeek
                    ? row.firstWeek
                    : `${row.firstWeek} to ${row.lastWeek}`}
                </span>
              </DriverRow>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

export function Movers({
  view,
  explain,
  actions,
}: {
  view: PerfDashboardView;
  explain: Explain;
  actions: DriverMenuActions;
}) {
  const oneWeek = view.range !== null && view.range.from === view.range.to;
  const empty = oneWeek
    ? 'With one week picked nobody can move. Pick Last 4 or more.'
    : 'Nobody moved this way.';
  return (
    <>
      <MoverList
        title="Most improved"
        rows={view.topImproved}
        testId="dashboard-improved"
        actions={actions}
        empty={empty}
        aside={
          <ExplainButton
            onClick={() => explain('movers')}
            testId="dashboard-movers-explain"
            what="the movers"
          />
        }
      />
      <MoverList
        title="Most declined"
        rows={view.topDeclined}
        testId="dashboard-declined"
        actions={actions}
        empty={empty}
      />
    </>
  );
}

// ------------------------------------------------------------------------------ trend

export function Trend({
  view,
  explain,
  onWiden,
}: {
  view: PerfDashboardView;
  explain: Explain;
  /** Shows more weeks (Last 13), or null when there are no more weeks to show. */
  onWiden: (() => void) | null;
}) {
  const [all, setAll] = useState(false);
  const label =
    'Fleet average score by week: ' +
    view.trend.map((point) => `${point.week} ${score(point.avg)}`).join(', ');
  const categories = view.categories
    .filter((row) => row.count > 0)
    .slice()
    .sort((a, b) => b.count - a.count);
  const showTrend = view.trend.length >= 2;
  const shown = all ? categories : categories.slice(0, SHOW_FIRST);
  const categoryLabel =
    'Failure reasons over the weeks shown: ' +
    categories
      .map(
        (row) =>
          `${row.source} ${row.category} ${row.count}` +
          (showTrend
            ? row.secondHalf > row.firstHalf
              ? ' growing'
              : row.secondHalf < row.firstHalf
                ? ' shrinking'
                : ' steady'
            : ''),
      )
      .join(', ');
  const first = view.trend[0];
  const last = view.trend[view.trend.length - 1];
  return (
    <>
      <Card
        title="Fleet average by week"
        titleId="dashboard-trend-title"
        testId="dashboard-trend"
        className="lg:col-span-2"
        aside={
          <ExplainButton
            onClick={() => explain('trend')}
            testId="dashboard-trend-explain"
            what="the trend"
          />
        }
      >
        {view.trend.length === 0 ? (
          <p className="m-0 py-3 text-sm text-muted">No scores in these weeks.</p>
        ) : (
          <>
            {first && last && view.trend.length >= 2 ? (
              <>
                <p className="m-0 mb-1 text-sm text-muted">
                  From {score(first.avg)} in {first.week} to {score(last.avg)} in {last.week} (
                  {signed(last.avg - first.avg)})
                </p>
                <TrendChart points={view.trend} label={label} />
              </>
            ) : (
              <div
                className="flex flex-wrap items-center gap-3 py-3"
                data-testid="dashboard-trend-one-week"
              >
                <p className="m-0 text-sm text-muted">
                  {first ? `${score(first.avg)} in ${first.week}. ` : ''}A line needs more than one
                  week.
                </p>
                {onWiden ? (
                  <Button size="sm" onClick={onWiden} data-testid="dashboard-trend-widen">
                    Show the last 13 weeks
                  </Button>
                ) : null}
              </div>
            )}
          </>
        )}
      </Card>
      <Card title="Failure reasons" titleId="dashboard-categories-title" testId="dashboard-reasons">
        {categories.length === 0 ? (
          <p className="m-0 py-3 text-sm text-muted">No failures in these weeks.</p>
        ) : (
          <>
            {!showTrend ? (
              <p className="m-0 mb-2 text-[0.857rem] text-faint">
                Pick more than one week to see which are growing.
              </p>
            ) : null}
            <CategoryBars rows={shown} showTrend={showTrend} label={categoryLabel} />
            {categories.length > SHOW_FIRST ? (
              <div className="mt-2">
                <Button size="sm" onClick={() => setAll(!all)} data-testid="dashboard-reasons-more">
                  {all ? 'Show fewer' : `Show all ${categories.length}`}
                </Button>
              </div>
            ) : null}
          </>
        )}
      </Card>
    </>
  );
}
