// The Dashboard's sections: the tiles, who needs a word, the ID-expiry list, the movers, the
// trend, the failure reasons, the watch list and a person's own tile. Each is one piece a layout
// can place, size and set up (shared/dashboardLayout.ts); `SectionBody` draws the right one.

import { UserRoundPlus } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import type { DashboardSection } from '../../../shared/dashboardLayout';
import { SHOW_FIRST_DEFAULT, customNumber } from '../../../shared/dashboardLayout';
import type { PerfDashboardView } from '../../../shared/performance';
import { Button } from '../../ui/button';
import { Chip } from '../../ui/chip';
import { CategoryBars, Sparkline, TierBar, TrendChart } from './charts';
import { Card, ChangeChip, DriverRow, ExplainButton, Tile, type DriverMenuActions } from './parts';
import {
  TIER_COLOUR,
  TIERS,
  coachingFor,
  count,
  customExplanation,
  customFormat,
  customTitle,
  dragWords,
  explanation,
  idAlerts,
  idWords,
  plural,
  rangeWords,
  reasonWords,
  score,
  signed,
  targetFormat,
  targetState,
  targetWords,
  tierTone,
  type Explanation,
} from './words';

export type Explain = (explanation: Explanation) => void;

interface SectionProps {
  section: DashboardSection;
  view: PerfDashboardView;
  explain: Explain;
}

const isFixed = (section: DashboardSection) => section.height !== 'fit';

/** The chip that says whether the tile's number met the person's target. */
function TargetChip({ section, value }: { section: DashboardSection; value: number | null }) {
  const state = targetState(section.target, value);
  if (!section.target || !state) return null;
  return (
    <div>
      <Chip tone={state === 'met' ? 'ok' : 'bad'} data-testid={`${section.id}-target`}>
        {targetWords(section.target, state, targetFormat(section))}
      </Chip>
    </div>
  );
}

// ------------------------------------------------------------------------------ tiles

export function FleetTile({ section, view, explain }: SectionProps) {
  const before = view.previousWeek;
  const trendLabel =
    'Fleet average score by week: ' +
    view.trend.map((point) => `${point.week} ${score(point.avg)}`).join(', ');
  return (
    <Tile
      title="Fleet average score"
      testId="tile-fleet"
      onExplain={() => explain(explanation('fleet', view, section))}
      what="the fleet average score"
      target={targetState(section.target, view.fleetAverage)}
      fixed={isFixed(section)}
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
      <TargetChip section={section} value={view.fleetAverage} />
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
  );
}

export function TiersTile({ section, view, explain }: SectionProps) {
  const tierCounts = TIERS.map((tier) => ({
    tier,
    count: view.tiers.find((t) => t.tier === tier)?.count ?? 0,
    move: view.tierMoves.find((m) => m.tier === tier),
  }));
  const tierLabel =
    `Drivers by tier in ${view.latestWeek ?? 'the newest week'}: ` +
    tierCounts.map((t) => `${t.tier} ${t.count}`).join(', ');
  return (
    <Tile
      title="Tiers"
      testId="tile-tiers"
      onExplain={() => explain(explanation('tiers', view, section))}
      what="the tiers"
      fixed={isFixed(section)}
    >
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
  );
}

export function PackagesTile({ section, view, explain }: SectionProps) {
  const before = view.previousWeek;
  return (
    <Tile
      title="Packages delivered"
      testId="tile-packages"
      onExplain={() => explain(explanation('packages', view, section))}
      what="packages delivered"
      target={targetState(section.target, view.packagesDelivered)}
      fixed={isFixed(section)}
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
      <TargetChip section={section} value={view.packagesDelivered} />
      <p className="m-0 text-[0.857rem] text-muted">
        {view.latestWeek ? `In ${view.latestWeek}` : ''}
      </p>
    </Tile>
  );
}

export function SafetyTile({ section, view, explain }: SectionProps) {
  return (
    <Tile
      title="Drivers with safety events"
      testId="tile-safety"
      onExplain={() => explain(explanation('safety', view, section))}
      what="drivers with safety events"
      target={targetState(section.target, view.driversWithSafetyEvents)}
      fixed={isFixed(section)}
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
      <TargetChip section={section} value={view.driversWithSafetyEvents} />
      <p className="m-0 text-[0.857rem] text-muted">
        Of {plural(view.activeDrivers, 'driver')}, in {rangeWords(view.range)}
      </p>
    </Tile>
  );
}

/** A person's own tile: a scorecard number averaged, added up or counted across the drivers. */
export function CustomTile({ section, view, explain }: SectionProps) {
  const result = view.custom?.find((one) => one.id === section.id);
  const title = customTitle(section);
  const format = customFormat(section);
  const number = customNumber(section.number);
  const how = section.how ?? 'average';
  const before = view.previousWeek;
  const value = result?.value ?? null;
  const points = (result?.series ?? []).map((point) => ({ week: point.week, avg: point.value }));
  const label =
    `${title} by week: ` + points.map((point) => `${point.week} ${format(point.avg)}`).join(', ');
  // Up is good for a score and for a count of drivers above a number; with a target, the target
  // says which way is good. Otherwise neither way is good or bad (packages, failures).
  const upIsGood = section.target
    ? section.target.dir === 'min'
    : number.isScore
      ? how !== 'below'
      : null;
  const decimals = how === 'average' ? number.decimals : 0;
  const testId = `tile-${section.id}`;
  return (
    <Tile
      title={title}
      testId={testId}
      onExplain={() => explain(customExplanation(section, result, view))}
      what={title}
      target={targetState(section.target, value)}
      fixed={isFixed(section) || section.show === 'chart'}
    >
      {!result ? (
        <p className="m-0 py-2 text-sm text-muted" role="status">
          Working it out...
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span
              className="text-[2rem] leading-none font-semibold tabular-nums"
              data-testid={`${testId}-value`}
            >
              {value === null ? '-' : format(value)}
            </span>
            {value !== null && result.before !== null ? (
              <ChangeChip
                change={value - result.before}
                upIsGood={upIsGood}
                decimals={decimals}
                format={(change) =>
                  (change > 0 ? '+' : change < 0 ? '−' : '') + format(Math.abs(change))
                }
                suffix={before ? `vs ${before}` : undefined}
                testId={`${testId}-change`}
              />
            ) : null}
          </div>
          <TargetChip section={section} value={value} />
          <p className="m-0 text-[0.857rem] text-muted">
            {value === null
              ? `No driver has this number${view.latestWeek ? ` in ${view.latestWeek}` : ''}.`
              : `${view.latestWeek ? `In ${view.latestWeek}, ` : ''}${plural(result.drivers, 'driver')}`}
          </p>
          {section.show === 'chart' ? (
            points.length >= 2 ? (
              <TrendChart
                points={points}
                label={label}
                free={!number.isScore || how !== 'average'}
                format={format}
                fill
                testId={`${testId}-chart`}
              />
            ) : (
              <p className="m-0 text-[0.857rem] text-faint">Pick more weeks to see the chart.</p>
            )
          ) : points.length >= 2 ? (
            <Sparkline points={points} label={label} testId={`${testId}-spark`} />
          ) : (
            <p className="m-0 text-[0.857rem] text-faint">Pick more weeks to see the line.</p>
          )}
        </>
      )}
    </Tile>
  );
}

// ------------------------------------------------------------------------------ people

interface PeopleProps extends SectionProps {
  actions: DriverMenuActions;
}

/** "Show all 12" under a list that is cut short. */
function MoreButton({
  all,
  total,
  onToggle,
  testId,
}: {
  all: boolean;
  total: number;
  onToggle: () => void;
  testId: string;
}) {
  return (
    <div className="mt-2">
      <Button size="sm" onClick={onToggle} data-testid={testId}>
        {all ? 'Show fewer' : `Show all ${total}`}
      </Button>
    </div>
  );
}

export function CoachingList({ section, view, explain, actions }: PeopleProps) {
  const [all, setAll] = useState(false);
  const first = section.showFirst ?? SHOW_FIRST_DEFAULT;
  const flags = coachingFor(view.coaching, section);
  const high = flags.filter((flag) => flag.severity === 'High').length;
  const shown = all ? flags : flags.slice(0, first);
  return (
    <Card
      title="Who needs a word"
      titleId="dashboard-coaching-title"
      testId="dashboard-coaching"
      fixed={isFixed(section)}
      aside={
        <>
          {flags.length > 0 ? (
            <span className="text-sm text-muted" data-testid="dashboard-coaching-counts">
              {section.highOnly ? `${high} High` : `${high} High, ${flags.length - high} Watch`}
            </span>
          ) : null}
          <ExplainButton
            onClick={() => explain(explanation('coaching', view, section))}
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
      {flags.length > first ? (
        <MoreButton
          all={all}
          total={flags.length}
          onToggle={() => setAll(!all)}
          testId="dashboard-coaching-more"
        />
      ) : null}
    </Card>
  );
}

export function IdExpiryList({ section, view, explain, actions }: PeopleProps) {
  const [all, setAll] = useState(false);
  const first = section.showFirst ?? SHOW_FIRST_DEFAULT;
  const alerts = idAlerts(view.compliance).filter(
    (row) => !section.expiredOnly || row.severity === 'Expired',
  );
  const shown = all ? alerts : alerts.slice(0, first);
  const expired = alerts.filter((row) => row.severity === 'Expired').length;
  const days = plural(view.rules.complianceWindowDays, 'day');
  return (
    <Card
      title="ID expiry"
      titleId="dashboard-ids-title"
      testId="dashboard-compliance"
      fixed={isFixed(section)}
      aside={
        <ExplainButton
          onClick={() => explain(explanation('ids', view, section))}
          testId="dashboard-ids-explain"
          what="ID expiry"
        />
      }
    >
      {alerts.length === 0 ? (
        <p className="m-0 py-4 text-sm text-muted" data-testid="dashboard-ids-none">
          {section.expiredOnly
            ? 'No IDs have expired.'
            : `No IDs expired or expiring in the next ${days}.`}
        </p>
      ) : (
        <>
          <p className="m-0 mb-1 text-sm text-muted" data-testid="dashboard-ids-counts">
            {section.expiredOnly
              ? `${expired} expired`
              : `${expired} expired, ${alerts.length - expired} expiring within ${days}`}
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
          {alerts.length > first ? (
            <MoreButton
              all={all}
              total={alerts.length}
              onToggle={() => setAll(!all)}
              testId="dashboard-ids-more"
            />
          ) : null}
        </>
      )}
    </Card>
  );
}

/** Most improved, or most declined. */
export function MoverList({
  section,
  view,
  explain,
  actions,
  way,
}: PeopleProps & { way: 'improved' | 'declined' }) {
  const rows = way === 'improved' ? view.topImproved : view.topDeclined;
  const testId = `dashboard-${way}`;
  const oneWeek = view.range !== null && view.range.from === view.range.to;
  return (
    <Card
      title={way === 'improved' ? 'Most improved' : 'Most declined'}
      titleId={`${testId}-title`}
      testId={testId}
      fixed={isFixed(section)}
      aside={
        <ExplainButton
          onClick={() => explain(explanation('movers', view, section))}
          testId={way === 'improved' ? 'dashboard-movers-explain' : 'dashboard-declined-explain'}
          what="the movers"
        />
      }
    >
      {rows.length === 0 ? (
        <p className="m-0 py-3 text-sm text-muted">
          {oneWeek
            ? 'With one week picked nobody can move. Pick Last 4 or more.'
            : 'Nobody moved this way.'}
        </p>
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

/** The drivers the person chose to keep an eye on. */
export function WatchList({
  section,
  view,
  explain,
  actions,
  watching,
  onAdd,
}: PeopleProps & {
  /** How many drivers are on the watch list (they may not all be answered for yet). */
  watching: number;
  /** Opens the window that picks the watch list's drivers. */
  onAdd: () => void;
}) {
  const [all, setAll] = useState(false);
  const first = section.showFirst ?? SHOW_FIRST_DEFAULT;
  const rows = view.watch ?? [];
  const shown = all ? rows : rows.slice(0, first);
  const waiting = watching > 0 && view.watch === undefined;
  return (
    <Card
      title="Watch list"
      titleId="dashboard-watch-title"
      testId="dashboard-watch"
      fixed={isFixed(section)}
      aside={
        <ExplainButton
          onClick={() => explain(explanation('watch', view, section))}
          testId="dashboard-watch-explain"
          what="the watch list"
        />
      }
    >
      {waiting ? (
        <p className="m-0 py-3 text-sm text-muted" role="status">
          Working it out...
        </p>
      ) : rows.length === 0 ? (
        <p className="m-0 py-3 text-sm text-muted" data-testid="dashboard-watch-none">
          Nobody is on the watch list yet. Click a driver anywhere on the Dashboard and pick Add to
          the watch list, or use the button below.
        </p>
      ) : (
        <ul className="m-0 -mx-2 list-none divide-y divide-line p-0">
          {shown.map((row) => (
            <li key={row.transporterId}>
              <DriverRow
                transporterId={row.transporterId}
                name={row.name}
                actions={actions}
                testId="watch-row"
              >
                <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="min-w-0 font-medium">{row.name}</span>
                  {row.latestTier ? (
                    <Chip tone={tierTone(row.latestTier)} icon={null}>
                      {row.latestTier}
                    </Chip>
                  ) : null}
                  <span className="ml-auto flex items-center gap-2">
                    {row.latestScore !== null && row.previousScore !== null ? (
                      <ChangeChip
                        change={row.latestScore - row.previousScore}
                        upIsGood
                        testId="watch-change"
                      />
                    ) : null}
                    <span
                      className="text-base font-semibold tabular-nums"
                      data-testid="watch-score"
                    >
                      {score(row.latestScore)}
                    </span>
                  </span>
                </span>
                <span className="block text-[0.786rem] text-faint tabular-nums">
                  {row.latestWeek ?? 'No scorecard in these weeks'}
                </span>
              </DriverRow>
            </li>
          ))}
        </ul>
      )}
      {rows.length > first ? (
        <MoreButton
          all={all}
          total={rows.length}
          onToggle={() => setAll(!all)}
          testId="dashboard-watch-more"
        />
      ) : null}
      <div className="mt-2">
        <Button size="sm" onClick={onAdd} data-testid="dashboard-watch-add">
          <UserRoundPlus aria-hidden="true" />
          Choose drivers
        </Button>
      </div>
    </Card>
  );
}

// ------------------------------------------------------------------------------ trend

export function TrendCard({
  section,
  view,
  explain,
  onWiden,
}: SectionProps & {
  /** Shows more weeks (Last 13), or null when there are no more weeks to show. */
  onWiden: (() => void) | null;
}) {
  const label =
    'Fleet average score by week: ' +
    view.trend.map((point) => `${point.week} ${score(point.avg)}`).join(', ');
  const first = view.trend[0];
  const last = view.trend[view.trend.length - 1];
  return (
    <Card
      title="Fleet average by week"
      titleId="dashboard-trend-title"
      testId="dashboard-trend"
      fixed={isFixed(section)}
      aside={
        <ExplainButton
          onClick={() => explain(explanation('trend', view, section))}
          testId="dashboard-trend-explain"
          what="the trend"
        />
      }
    >
      {view.trend.length === 0 ? (
        <p className="m-0 py-3 text-sm text-muted">No scores in these weeks.</p>
      ) : first && last && view.trend.length >= 2 ? (
        <>
          <p className="m-0 mb-1 text-sm text-muted">
            From {score(first.avg)} in {first.week} to {score(last.avg)} in {last.week} (
            {signed(last.avg - first.avg)})
          </p>
          <TrendChart points={view.trend} label={label} fill={isFixed(section)} />
        </>
      ) : (
        <div
          className="flex flex-wrap items-center gap-3 py-3"
          data-testid="dashboard-trend-one-week"
        >
          <p className="m-0 text-sm text-muted">
            {first ? `${score(first.avg)} in ${first.week}. ` : ''}A line needs more than one week.
          </p>
          {onWiden ? (
            <Button size="sm" onClick={onWiden} data-testid="dashboard-trend-widen">
              Show the last 13 weeks
            </Button>
          ) : null}
        </div>
      )}
    </Card>
  );
}

export function ReasonsCard({ section, view, explain }: SectionProps) {
  const [all, setAll] = useState(false);
  const first = section.showFirst ?? SHOW_FIRST_DEFAULT;
  const sources: readonly string[] | undefined = section.sources;
  const categories = view.categories
    .filter((row) => row.count > 0 && (!sources || sources.includes(row.source)))
    .slice()
    .sort((a, b) => b.count - a.count);
  const showTrend = view.trend.length >= 2;
  const shown = all ? categories : categories.slice(0, first);
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
  return (
    <Card
      title="Failure reasons"
      titleId="dashboard-categories-title"
      testId="dashboard-reasons"
      fixed={isFixed(section)}
      aside={
        <ExplainButton
          onClick={() => explain(explanation('reasons', view, section))}
          testId="dashboard-reasons-explain"
          what="the failure reasons"
        />
      }
    >
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
          {categories.length > first ? (
            <MoreButton
              all={all}
              total={categories.length}
              onToggle={() => setAll(!all)}
              testId="dashboard-reasons-more"
            />
          ) : null}
        </>
      )}
    </Card>
  );
}

// ------------------------------------------------------------------------------ any section

/** Draws one section of a layout. */
export function SectionBody({
  section,
  view,
  explain,
  actions,
  onWiden,
  watching,
  onChooseWatch,
}: PeopleProps & {
  onWiden: (() => void) | null;
  watching: number;
  onChooseWatch: () => void;
}): ReactNode {
  const props = { section, view, explain };
  switch (section.kind) {
    case 'tile-fleet':
      return <FleetTile {...props} />;
    case 'tile-tiers':
      return <TiersTile {...props} />;
    case 'tile-packages':
      return <PackagesTile {...props} />;
    case 'tile-safety':
      return <SafetyTile {...props} />;
    case 'custom':
      return <CustomTile {...props} />;
    case 'coaching':
      return <CoachingList {...props} actions={actions} />;
    case 'ids':
      return <IdExpiryList {...props} actions={actions} />;
    case 'improved':
    case 'declined':
      return <MoverList {...props} actions={actions} way={section.kind} />;
    case 'watch':
      return <WatchList {...props} actions={actions} watching={watching} onAdd={onChooseWatch} />;
    case 'trend':
      return <TrendCard {...props} onWiden={onWiden} />;
    case 'reasons':
      return <ReasonsCard {...props} />;
  }
}

/** The kinds drawn as a tile: they stretch to the height of their row. */
export function isTile(section: DashboardSection): boolean {
  return section.kind.startsWith('tile-') || section.kind === 'custom';
}
