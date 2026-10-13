// The Distribute tab: who gets each route sheet. Counts along the top, the pad box for a wave the
// route data does not know, then (in the old app's order) Ready to send, Choose who gets these
// route sheets, No exact match, On the Routes file but missing from the PDF, People who won't get
// a route sheet, and All routes. Ported from the old app's Distribute page.

import {
  useCallback,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Decision, Issue, ListedCandidate, RouteResult } from '@loadout/route-sheets';
import type {
  RouteSheetsDistributionView,
  RouteSheetsStateView,
} from '../../../shared/routeSheets';
import type { AppSnapshot } from '../../../shared/snapshot';
import { DataGrid, type GridColumn, type RowAction } from '../../components/DataGrid';
import { databaseLayoutStore } from '../../lib/gridLayoutStore';
import { Button } from '../../ui/button';
import { Chip } from '../../ui/chip';
import { cn } from '../../ui/cn';
import { Input } from '../../ui/input';
import { command } from '../dataPages/bringIn';
import { plural } from '../dataPages/format';
import type { Messages } from '../dataPages/PageParts';
import { Cell, PlainTable, RouteLink, Section, StateChip, StatusChip } from './parts';
import {
  STATE_INFO,
  acceptedWords,
  candidateName,
  firstName,
  routeMeta,
  routeNotes,
  sentWords,
  waveId,
} from './words';

interface DistributeTabProps {
  state: RouteSheetsStateView;
  dist: RouteSheetsDistributionView;
  snapshot: AppSnapshot;
  messages: Messages;
  /** Opens the route's sheet on the Sheets tab. */
  openSheet: (routeCode: string) => void;
}

interface Driver {
  transporterId: string;
  name: string;
  email: string;
  status: string;
}

const ISSUE_TONE: Record<Issue['level'], string> = {
  error: 'text-bad',
  warn: 'text-warn',
  info: 'text-muted',
};

export function DistributeTab({ state, dist, snapshot, messages, openSheet }: DistributeTabProps) {
  // The newest status line and banner, for the choices made from the table (its columns stay put).
  const latest = useRef(messages);
  useLayoutEffect(() => {
    latest.current = messages;
  });

  const decide = useCallback(
    async (routeCode: string, decision: Decision | null, words: string) => {
      const done = await command(latest.current, 'routeSheets:set-decision', {
        routeCode,
        // Every field named, as the channel's check wants; the ones not chosen stay unset.
        decision: decision
          ? {
              recipients: decision.recipients,
              skipped: decision.skipped,
              manual: decision.manual,
              viaSuggestion: decision.viaSuggestion,
            }
          : null,
      });
      if (done.ok) latest.current.setStatus(words);
    },
    [],
  );

  const drivers = useMemo<Driver[]>(
    () =>
      snapshot.associates
        .map(({ associate }) => ({
          transporterId: associate.transporterId,
          name: associate.name,
          email: associate.email,
          status: associate.status,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [snapshot.associates],
  );

  const byState = (wanted: string) => dist.routes.filter((r) => r.state === wanted);
  const ready = byState('ready');
  const decisions = byState('needs-decision');
  const exceptions = byState('exception');
  const noSheet = byState('no-sheet');
  const withSuggestion = decisions.filter((r) => r.suggestion).length;
  const open = (routeCode: string) => {
    const route = dist.routes.find((r) => r.routeCode === routeCode);
    if (route?.hasSheet) openSheet(routeCode);
  };

  async function acceptAll() {
    const done = await command(messages, 'routeSheets:accept-suggestions');
    if (done.ok) messages.setStatus(acceptedWords(done.value));
  }

  if (dist.routes.length === 0) {
    return (
      <div className="px-6 py-6" data-testid="route-sheets-start">
        <h2 className="m-0 text-[1.15rem] font-semibold">Start a run</h2>
        <p className="m-0 mt-2 text-sm">
          Bring in today&apos;s route sheet PDF. The drivers come from the Associates page and the
          routes from the Route Data page.
        </p>
      </div>
    );
  }

  return (
    <div className="px-6 py-4">
      <Counts dist={dist} />
      <WavePads dist={dist} messages={messages} />

      <Section
        id="ready"
        title="Ready to send"
        sub="Each of these goes to the one driver the app is sure of, or to the driver you chose."
      >
        {ready.length ? (
          <PlainTable
            headings={['Route', 'Staging', 'Wave', 'Pad', 'Driver', 'Email', 'Sent']}
            testId="route-sheets-ready-table"
          >
            {ready.map((r) => {
              const sent = state.run.sent[r.routeCode];
              return (
                <tr key={r.routeCode} data-route={r.routeCode}>
                  <Cell>
                    <RouteLink
                      routeCode={r.routeCode}
                      onOpen={open}
                      testId={`route-sheets-ready-open-${r.routeCode}`}
                    />
                  </Cell>
                  <Cell>{r.sheet?.staging ?? '-'}</Cell>
                  <Cell>{r.sheet?.waveTime ?? '-'}</Cell>
                  <Cell>{r.sheet?.pad ?? '-'}</Cell>
                  <Cell>{r.recipients.map((p) => p.name).join(' & ')}</Cell>
                  <Cell>
                    {r.recipients.map((p) =>
                      p.email ? (
                        <div key={p.transporterId}>{p.email}</div>
                      ) : (
                        <div key={p.transporterId} className="text-warn">
                          No email on file
                        </div>
                      ),
                    )}
                  </Cell>
                  <Cell>
                    {sent ? (
                      <Chip
                        tone="info"
                        icon={null}
                        data-testid={`route-sheets-sent-${r.routeCode}`}
                      >
                        {sentWords(sent)}
                      </Chip>
                    ) : null}
                  </Cell>
                </tr>
              );
            })}
          </PlainTable>
        ) : (
          <p className="m-0 text-sm text-muted">No route sheets are ready yet.</p>
        )}
      </Section>

      {decisions.length ? (
        <Section
          id="decide"
          title="Choose who gets these route sheets"
          sub="These routes list more than one Transporter ID. Only the driver you pick gets the sheet."
          action={
            withSuggestion ? (
              <Button
                onClick={() => void acceptAll()}
                data-testid="route-sheets-accept-suggestions"
              >
                Accept all suggestions
              </Button>
            ) : null
          }
        >
          <div className="grid gap-3 xl:grid-cols-2">
            {decisions.map((r) => (
              <DecisionCard
                key={r.routeCode}
                route={r}
                drivers={drivers}
                decide={decide}
                onOpen={open}
              />
            ))}
          </div>
        </Section>
      ) : null}

      {exceptions.length ? (
        <Section
          id="exception"
          title="No exact match"
          sub="These route sheets have no driver the app can confirm. Choose who should get each one, or don't send it."
        >
          <div className="grid gap-3 xl:grid-cols-2">
            {exceptions.map((r) => (
              <ExceptionCard
                key={r.routeCode}
                route={r}
                drivers={drivers}
                decide={decide}
                onOpen={open}
                messages={messages}
              />
            ))}
          </div>
        </Section>
      ) : null}

      {noSheet.length ? (
        <Section
          id="no-sheet"
          title="On the Routes file but missing from the PDF"
          sub="There is no route sheet to send for these routes. Get the missing pages and bring the PDF in again."
        >
          <PlainTable headings={['Route', 'Listed driver(s)', 'Why']}>
            {noSheet.map((r) => (
              <tr key={r.routeCode} data-route={r.routeCode}>
                <Cell className="font-semibold">{r.routeCode}</Cell>
                <Cell>
                  {r.listed.map((c) => (
                    <div key={`${c.transporterId}-${c.routesName}`}>
                      {candidateName(c)}{' '}
                      <span className="font-mono text-muted">{c.transporterId}</span>
                    </div>
                  ))}
                </Cell>
                <Cell>{r.headline}</Cell>
              </tr>
            ))}
          </PlainTable>
        </Section>
      ) : null}

      <People dist={dist} onOpen={open} />

      <AllRoutes dist={dist} decide={decide} onOpen={open} />
    </div>
  );
}

// ------------------------------------------------------------------------------ the counts

function Counts({ dist }: { dist: RouteSheetsDistributionView }) {
  const c = dist.counts;
  const chip = (id: string, n: number, words: string, tone: 'ok' | 'warn' | 'bad' | 'neutral') => (
    <Chip key={id} tone={n ? tone : 'neutral'} data-testid={`route-sheets-count-${id}`}>
      {n} {words}
    </Chip>
  );
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Route sheet counts">
      {chip('total', c.total, c.total === 1 ? 'route' : 'routes', 'neutral')}
      {chip('ready', c.ready, 'ready to send', 'ok')}
      {chip('needs-decision', c['needs-decision'], 'need your decision', 'warn')}
      {chip('exception', c.exception, 'no exact match', 'bad')}
      {chip('no-sheet', c['no-sheet'], 'missing from the PDF', 'bad')}
      {chip('skipped', c.skipped, 'not sending', 'neutral')}
      {c.missingEmail > 0
        ? chip('missing-email', c.missingEmail, 'without an email address', 'warn')
        : null}
    </div>
  );
}

// ---------------------------------------------------------------------- the pad for a wave

function WavePads({ dist, messages }: { dist: RouteSheetsDistributionView; messages: Messages }) {
  if (dist.typedPadWaves.length === 0) {
    return (
      <p className="m-0 mt-3 text-sm text-muted" data-testid="route-sheets-pads-note">
        The pad for each wave comes from the Route Data page.
      </p>
    );
  }
  return (
    <Section
      id="pads"
      title="Pad for each wave"
      sub="These wave times are not in the route data. Type the pad number next to each one. It shows in a blue box on every route sheet for that wave."
    >
      <div className="flex flex-wrap gap-3">
        {dist.typedPadWaves.map((waveTime) => {
          const wave = dist.waves.find((w) => w.waveTime === waveTime);
          return (
            <PadBox
              key={`${waveTime}-${wave?.pad ?? ''}`}
              waveTime={waveTime}
              routes={wave?.routes ?? 0}
              pad={wave?.pad ?? ''}
              messages={messages}
            />
          );
        })}
      </div>
    </Section>
  );
}

function PadBox({
  waveTime,
  routes,
  pad,
  messages,
}: {
  waveTime: string;
  routes: number;
  pad: string;
  messages: Messages;
}) {
  const id = useId();
  const [text, setText] = useState(pad);

  async function save() {
    if (text.trim() === pad) return;
    const done = await command(messages, 'routeSheets:set-wave-pad', { waveTime, pad: text });
    if (!done.ok) return;
    messages.setStatus(
      done.value
        ? `Pad ${done.value} for the ${waveTime} wave.`
        : `No pad for the ${waveTime} wave.`,
    );
  }

  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-sm">
      <label htmlFor={id} className="block font-semibold">
        {waveTime}
      </label>
      <p className="m-0 text-muted">{plural(routes, 'route')}</p>
      <div className="mt-1 flex items-center gap-2">
        <span className="text-muted">Pad #</span>
        <Input
          id={id}
          value={text}
          maxLength={10}
          autoComplete="off"
          placeholder="?"
          aria-label={`Pad for the ${waveTime} wave`}
          className="w-20"
          onChange={(event) => setText(event.target.value)}
          onBlur={() => void save()}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void save();
          }}
          data-testid={`route-sheets-pad-${waveId(waveTime)}`}
        />
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------ the choice cards

type Decide = (routeCode: string, decision: Decision | null, words: string) => Promise<void>;

function Issues({ issues, testId }: { issues: readonly Issue[]; testId?: string }) {
  if (issues.length === 0) return null;
  return (
    <ul className="m-0 mt-2 list-disc pl-5 text-sm" data-testid={testId}>
      {issues.map((issue, index) => (
        <li
          key={`${index}-${issue.text}`}
          className={ISSUE_TONE[issue.level]}
          data-level={issue.level}
        >
          {issue.text}
        </li>
      ))}
    </ul>
  );
}

function Candidate({
  route,
  candidate: c,
  allowPick,
  decide,
}: {
  route: RouteResult;
  candidate: ListedCandidate;
  allowPick: boolean;
  decide: Decide;
}) {
  const name = candidateName(c);
  const suggested = route.suggestion !== null && route.suggestion === c.transporterId;
  const testId = `route-sheets-choose-${route.routeCode}-${c.transporterId}`;
  let action = null;
  if (allowPick) {
    if (c.valid) {
      action = (
        <Button
          size="sm"
          variant={suggested ? 'primary' : 'default'}
          onClick={() =>
            void decide(
              route.routeCode,
              { recipients: [c.transporterId] },
              `${route.routeCode} goes to ${name}.`,
            )
          }
          data-testid={testId}
        >
          Send to {firstName(name)}
        </Button>
      );
    } else if (c.found) {
      action = (
        <Button
          size="sm"
          variant="danger"
          title="This driver is not ACTIVE"
          onClick={() =>
            void decide(
              route.routeCode,
              { recipients: [c.transporterId] },
              `${route.routeCode} goes to ${name}.`,
            )
          }
          data-testid={testId}
        >
          Send anyway
        </Button>
      );
    } else {
      action = <span className="text-sm text-muted">Can&apos;t send - not on the driver list</span>;
    }
  }
  return (
    <li
      className={cn(
        'flex flex-wrap items-start gap-3 rounded-md border px-3 py-2',
        suggested ? 'border-ok' : 'border-line',
      )}
      data-testid={`route-sheets-candidate-${route.routeCode}-${c.transporterId}`}
    >
      <div className="min-w-0 flex-1 text-sm">
        <p className="m-0 font-semibold">{name}</p>
        <p className="m-0 mt-0.5 flex flex-wrap items-center gap-2 text-muted">
          <span className="font-mono">{c.transporterId || 'no Transporter ID'}</span>
          <StatusChip found={c.found} status={c.status} />
          {c.found ? (
            c.email ? (
              <span>{c.email}</span>
            ) : (
              <span className="text-warn">no email on file</span>
            )
          ) : null}
          {c.routesName && c.rosterName && c.routesName !== c.rosterName ? (
            <span>routes file: &quot;{c.routesName}&quot;</span>
          ) : null}
        </p>
        {suggested ? (
          <p className="m-0 mt-1 flex flex-wrap items-center gap-2">
            <Chip
              tone="ok"
              title={route.suggestionReason ?? undefined}
              data-testid={`route-sheets-suggested-${route.routeCode}`}
            >
              Suggested
            </Chip>
            <span className="text-muted">{route.suggestionReason}</span>
          </p>
        ) : null}
        {c.otherRoutes.length ? (
          <p className="m-0 mt-1 text-warn">Also listed on {c.otherRoutes.join(', ')}</p>
        ) : null}
        {c.problem ? <p className="m-0 mt-1 text-bad">{c.problem}</p> : null}
        {c.nameMismatch ? (
          <p className="m-0 mt-1 text-warn">
            Routes file name &quot;{c.routesName}&quot; doesn&apos;t match this ID&apos;s driver
            &quot;{c.rosterName}&quot;
          </p>
        ) : null}
      </div>
      {action}
    </li>
  );
}

function AssignControl({
  routeCode,
  drivers,
  decide,
  messages,
}: {
  routeCode: string;
  drivers: readonly Driver[];
  decide: Decide;
  messages?: Messages;
}) {
  const id = useId();
  const [chosen, setChosen] = useState('');
  const active = drivers.filter((d) => d.status === 'ACTIVE');
  const inactive = drivers.filter((d) => d.status !== 'ACTIVE');

  function assign() {
    if (!chosen) {
      messages?.setStatus('Pick someone from the list first.');
      return;
    }
    const who = drivers.find((d) => d.transporterId === chosen);
    void decide(
      routeCode,
      { recipients: [chosen], manual: true },
      `${routeCode} goes to ${who?.name ?? chosen}.`,
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor={id} className="sr-only">
        Who should get {routeCode}
      </label>
      <select
        id={id}
        value={chosen}
        onChange={(event) => setChosen(event.target.value)}
        className="h-8 max-w-full min-w-0 flex-1 rounded-md border border-line-strong bg-sunken px-2 text-sm text-fg"
        data-testid={`route-sheets-assign-select-${routeCode}`}
      >
        <option value="">Choose who should get it...</option>
        <optgroup label="Active drivers">
          {active.map((d) => (
            <option key={d.transporterId} value={d.transporterId}>
              {d.name} - {d.transporterId}
              {d.email ? '' : ' (no email)'}
            </option>
          ))}
        </optgroup>
        {inactive.length ? (
          <optgroup label="Not active">
            {inactive.map((d) => (
              <option key={d.transporterId} value={d.transporterId}>
                {d.name} - {d.transporterId} ({d.status || 'no status'})
              </option>
            ))}
          </optgroup>
        ) : null}
      </select>
      <Button size="sm" onClick={assign} data-testid={`route-sheets-assign-${routeCode}`}>
        Assign
      </Button>
    </div>
  );
}

function CardHead({ route, chip }: { route: RouteResult; chip: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start gap-2">
      <div className="min-w-0 flex-1">
        <h3 className="m-0 text-base font-semibold">{route.routeCode}</h3>
        <p className="m-0 text-sm text-muted">{routeMeta(route)}</p>
      </div>
      {chip}
    </div>
  );
}

function DecisionCard({
  route,
  drivers,
  decide,
  onOpen,
}: {
  route: RouteResult;
  drivers: readonly Driver[];
  decide: Decide;
  onOpen: (routeCode: string) => void;
}) {
  const valid = route.listed.filter((c) => c.valid);
  return (
    <div
      className="rounded-lg border border-line bg-surface px-4 py-3"
      data-testid={`route-sheets-decide-${route.routeCode}`}
    >
      <CardHead
        route={route}
        chip={<Chip tone="warn">{plural(route.listed.length, 'Transporter ID')}</Chip>}
      />
      <p className="m-0 mt-2 text-sm font-semibold">Who should get this route sheet?</p>
      <ul className="m-0 mt-1 flex list-none flex-col gap-2 p-0">
        {route.listed.map((c) => (
          <Candidate
            key={`${c.transporterId}-${c.routesName}`}
            route={route}
            candidate={c}
            allowPick
            decide={decide}
          />
        ))}
      </ul>
      <Issues issues={route.issues.filter((i) => i.level === 'info')} />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {valid.length > 1 ? (
          <Button
            size="sm"
            onClick={() =>
              void decide(
                route.routeCode,
                { recipients: valid.map((c) => c.transporterId) },
                `${route.routeCode} goes to all ${valid.length}.`,
              )
            }
            data-testid={`route-sheets-send-all-${route.routeCode}`}
          >
            Send to all {valid.length}
          </Button>
        ) : null}
        <Button
          size="sm"
          onClick={() =>
            void decide(route.routeCode, { skipped: true }, `${route.routeCode} will not be sent.`)
          }
          data-testid={`route-sheets-skip-${route.routeCode}`}
        >
          Don&apos;t send
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto"
          onClick={() => onOpen(route.routeCode)}
          data-testid={`route-sheets-preview-${route.routeCode}`}
        >
          Preview sheet
        </Button>
      </div>
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer text-muted">Send to someone else</summary>
        <div className="mt-2">
          <AssignControl routeCode={route.routeCode} drivers={drivers} decide={decide} />
        </div>
      </details>
    </div>
  );
}

function ExceptionCard({
  route,
  drivers,
  decide,
  onOpen,
  messages,
}: {
  route: RouteResult;
  drivers: readonly Driver[];
  decide: Decide;
  onOpen: (routeCode: string) => void;
  messages: Messages;
}) {
  return (
    <div
      className="rounded-lg border border-bad/60 bg-surface px-4 py-3"
      data-testid={`route-sheets-exception-${route.routeCode}`}
    >
      <CardHead route={route} chip={<StateChip state="exception" />} />
      <p className="m-0 mt-2 text-sm font-semibold text-bad" data-testid="route-sheets-headline">
        {route.headline}
      </p>
      <Issues issues={route.issues} testId={`route-sheets-issues-${route.routeCode}`} />
      {route.listed.length ? (
        <>
          <p className="m-0 mt-2 text-sm font-semibold">Listed on the routes file</p>
          <ul className="m-0 mt-1 flex list-none flex-col gap-2 p-0">
            {route.listed.map((c) => (
              <Candidate
                key={`${c.transporterId}-${c.routesName}`}
                route={route}
                candidate={c}
                allowPick={route.sheet?.checkOk ?? false}
                decide={decide}
              />
            ))}
          </ul>
        </>
      ) : null}
      <p className="m-0 mt-3 mb-1 text-sm font-semibold">Who should get it?</p>
      <AssignControl
        routeCode={route.routeCode}
        drivers={drivers}
        decide={decide}
        messages={messages}
      />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          onClick={() =>
            void decide(route.routeCode, { skipped: true }, `${route.routeCode} will not be sent.`)
          }
          data-testid={`route-sheets-skip-${route.routeCode}`}
        >
          Don&apos;t send
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto"
          onClick={() => onOpen(route.routeCode)}
          data-testid={`route-sheets-preview-${route.routeCode}`}
        >
          Preview sheet
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------- who gets nothing

function People({
  dist,
  onOpen,
}: {
  dist: RouteSheetsDistributionView;
  onOpen: (routeCode: string) => void;
}) {
  const { notReceiving, multiple } = dist.people;
  const hasSheet = (code: string) => dist.routes.some((r) => r.routeCode === code && r.hasSheet);
  return (
    <Section
      id="people"
      title="People who won't get a route sheet"
      sub="Everyone named on the routes file who is not getting any route sheet right now, and why."
    >
      {notReceiving.length ? (
        <PlainTable
          headings={['Name', 'Transporter ID', 'Driver list', 'Route', 'Why']}
          testId="route-sheets-not-receiving"
        >
          {notReceiving.flatMap((p) =>
            p.routes.map((x, i) => (
              <tr key={`${p.transporterId || p.name}-${x.routeCode}`}>
                <Cell className="font-semibold">{i === 0 ? p.name : ''}</Cell>
                <Cell className="font-mono">{i === 0 ? p.transporterId || '-' : ''}</Cell>
                <Cell>{i === 0 ? <StatusChip found={p.inRoster} status={p.status} /> : null}</Cell>
                <Cell>
                  <RouteLink
                    routeCode={x.routeCode}
                    onOpen={hasSheet(x.routeCode) ? onOpen : undefined}
                  />
                </Cell>
                <Cell>{x.reason}</Cell>
              </tr>
            )),
          )}
        </PlainTable>
      ) : (
        <p className="m-0 text-sm text-ok" data-testid="route-sheets-everyone">
          Everyone listed on the routes file is getting a route sheet.
        </p>
      )}
      {multiple.length ? (
        <>
          <h3 className="m-0 mt-4 text-base font-semibold">Getting more than one route sheet</h3>
          <p className="m-0 text-sm text-muted">Check these are intended.</p>
          <ul className="m-0 mt-1 list-disc pl-5 text-sm" data-testid="route-sheets-multiple">
            {multiple.map((p) => (
              <li key={p.transporterId}>
                {p.name} gets {p.routes.length} route sheets: {p.routes.join(', ')}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </Section>
  );
}

// ------------------------------------------------------------------------------ All routes

const rowId = (r: RouteResult) => r.routeCode;

function AllRoutes({
  dist,
  decide,
  onOpen,
}: {
  dist: RouteSheetsDistributionView;
  decide: Decide;
  onOpen: (routeCode: string) => void;
}) {
  const act = useRef({ decide, onOpen });
  useLayoutEffect(() => {
    act.current = { decide, onOpen };
  });

  const change = useCallback((r: RouteResult) => {
    void act.current.decide(r.routeCode, null, `${r.routeCode} is back to the app's own match.`);
  }, []);

  const columns = useMemo<GridColumn<RouteResult>[]>(
    () => [
      { id: 'route', header: 'Route', value: (r) => r.routeCode },
      { id: 'staging', header: 'Staging', value: (r) => r.sheet?.staging ?? '' },
      { id: 'wave', header: 'Wave', value: (r) => r.sheet?.waveTime ?? '' },
      { id: 'pad', header: 'Pad', value: (r) => r.sheet?.pad ?? '' },
      {
        id: 'pkgs',
        header: 'Pkgs',
        align: 'right',
        value: (r) => (r.sheet?.totalPackages != null ? String(r.sheet.totalPackages) : ''),
      },
      {
        id: 'listed',
        header: 'Listed on routes file',
        value: (r) =>
          r.listed.length
            ? r.listed.map((c) => `${candidateName(c)} ${c.transporterId}`.trim()).join(', ')
            : 'Not on routes file',
      },
      {
        id: 'sending-to',
        header: 'Sending to',
        value: (r) => r.recipients.map((p) => p.name).join(' & '),
      },
      {
        id: 'status',
        header: 'Status',
        value: (r) => STATE_INFO[r.state].label,
        cell: (r) => <StateChip state={r.state} />,
        fitExtra: 28,
      },
      { id: 'notes', header: 'Notes', value: routeNotes },
      {
        id: 'change',
        header: 'Change',
        sortable: false,
        value: (r) => (r.source === 'decision' ? 'Change' : ''),
        cell: (r) =>
          r.source === 'decision' ? (
            <Button
              size="sm"
              tabIndex={-1}
              onClick={(event) => {
                event.stopPropagation();
                change(r);
              }}
              onDoubleClick={(event) => event.stopPropagation()}
              data-testid={`route-sheets-change-${r.routeCode}`}
            >
              Change
            </Button>
          ) : (
            <span />
          ),
        fitExtra: 24,
      },
    ],
    [change],
  );

  const rowActions = useMemo<RowAction<RouteResult>[]>(
    () => [
      {
        id: 'open-sheet',
        label: 'Open its route sheet',
        appliesTo: (r) => r.hasSheet,
        onSelect: (r) => act.current.onOpen(r.routeCode),
      },
      {
        id: 'change',
        label: 'Change: undo this choice',
        appliesTo: (r) => r.source === 'decision',
        onSelect: (r) => change(r),
      },
    ],
    [change],
  );

  const activate = useCallback(
    (r: RouteResult, columnId: string) => {
      if (columnId === 'change' && r.source === 'decision') change(r);
      else if (r.hasSheet) act.current.onOpen(r.routeCode);
    },
    [change],
  );

  const rowTone = useCallback((r: RouteResult) => {
    const tone = STATE_INFO[r.state].tone;
    return tone === 'ok' ? undefined : tone;
  }, []);

  return (
    <Section
      id="all"
      title="All routes"
      sub="Press Enter or double-click a route to open its route sheet. Change undoes a choice."
    >
      <div className="flex h-[28rem] flex-col overflow-hidden rounded-lg border border-line">
        <DataGrid
          view="route-sheets-all"
          label="All routes"
          columns={columns}
          rows={dist.routes}
          getRowId={rowId}
          layoutStore={databaseLayoutStore}
          rowActions={rowActions}
          onRowActivate={activate}
          rowTone={rowTone}
          empty={{ title: 'No routes yet.' }}
        />
      </div>
    </Section>
  );
}
