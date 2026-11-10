// The windows that set up one section of the Dashboard: a section's own choices (which reasons
// flag a driver, how many lines show, a target for a tile's number), the build-your-own tile, and
// the watch list's drivers. Each works on a copy and saves only when Save is pressed.

import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import {
  CUSTOM_HOWS,
  CUSTOM_HOW_NAMES,
  CUSTOM_NUMBERS,
  FAILURE_SOURCES,
  MAX_WATCH,
  NAME_MAX,
  REASON_KINDS,
  REASON_NAMES,
  SHOW_FIRST_DEFAULT,
  SHOW_FIRST_MAX,
  SHOW_FIRST_MIN,
  TARGET_KINDS,
  cleanName,
  customNumber,
  type CustomHow,
  type DashboardSection,
  type Target,
} from '../../../shared/dashboardLayout';
import type { WeekRange } from '../../../shared/performance';
import { call, explain as explainFailure } from '../../lib/channels';
import { Input } from '../../ui/input';
import { Modal } from '../dataPages/Modal';
import { customTitle, plural, sectionTitle } from './words';

const selectClass =
  'h-8 max-w-full rounded-md border border-line-strong bg-sunken px-2 text-sm text-fg';

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div className="mb-3">
      <label htmlFor={id} className="mb-1 block text-sm font-medium">
        {label}
      </label>
      {children(id)}
      {hint ? <p className="m-0 mt-1 text-[0.857rem] text-muted">{hint}</p> : null}
    </div>
  );
}

function Tick({
  label,
  checked,
  onChange,
  testId,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  testId: string;
}) {
  return (
    <label className="flex items-center gap-2 py-0.5 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        data-testid={testId}
      />
      {label}
    </label>
  );
}

/** A number as typed, or null when the box does not hold one. */
function numberOf(text: string): number | null {
  const trimmed = text.trim().replace(/,/g, '');
  if (trimmed === '') return null;
  const n = Number(trimmed);
  return Number.isFinite(n) && Math.abs(n) <= 1e9 ? n : null;
}

/** The window's copy of a section, with the number boxes kept as the text typed. */
interface Draft {
  section: DashboardSection;
  showFirst: string;
  targetDir: 'none' | Target['dir'];
  targetValue: string;
  limit: string;
}

function draftOf(section: DashboardSection): Draft {
  return {
    section,
    showFirst: String(section.showFirst ?? SHOW_FIRST_DEFAULT),
    targetDir: section.target?.dir ?? 'none',
    targetValue: section.target ? String(section.target.value) : '',
    limit: String(section.limit ?? 0),
  };
}

/** The section the draft stands for, or what is wrong with it in plain words. */
function finish(draft: Draft): { section: DashboardSection } | { problem: string } {
  const section = { ...draft.section };
  if (section.showFirst !== undefined) {
    const n = numberOf(draft.showFirst);
    if (n === null || !Number.isInteger(n) || n < SHOW_FIRST_MIN || n > SHOW_FIRST_MAX) {
      return {
        problem: `For the number of lines, type a whole number from ${SHOW_FIRST_MIN} to ${SHOW_FIRST_MAX}.`,
      };
    }
    section.showFirst = n;
  }
  if (section.kind === 'custom') {
    section.title = cleanName(section.title);
    if (section.how === 'below' || section.how === 'above') {
      const n = numberOf(draft.limit);
      if (n === null) return { problem: 'Type the number to count drivers against.' };
      section.limit = n;
    }
  }
  if (TARGET_KINDS.includes(section.kind)) {
    if (draft.targetDir === 'none') section.target = null;
    else {
      const n = numberOf(draft.targetValue);
      if (n === null) return { problem: 'Type the target as a number, for example 90.' };
      section.target = { dir: draft.targetDir, value: n };
    }
  }
  return { section };
}

/**
 * A section's own choices. With `adding`, it is the build-your-own tile being made: Save puts it
 * on the layout.
 */
export function SectionOptionsDialog({
  section,
  adding = false,
  onSave,
  onCancel,
}: {
  section: DashboardSection;
  adding?: boolean;
  onSave: (section: DashboardSection) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(() => draftOf(section));
  const [problem, setProblem] = useState('');
  const now = draft.section;
  const change = (patch: Partial<DashboardSection>) =>
    setDraft((d) => ({ ...d, section: { ...d.section, ...patch } }));
  const toggle = <T extends string>(list: readonly T[] | undefined, item: T, on: boolean): T[] =>
    on ? [...new Set([...(list ?? []), item])] : (list ?? []).filter((one) => one !== item);
  const custom = now.kind === 'custom';
  const counting = now.how === 'below' || now.how === 'above';

  function save() {
    const done = finish(draft);
    if ('problem' in done) return setProblem(done.problem);
    onSave(done.section);
  }

  return (
    <Modal
      name="section-options"
      title={adding ? 'Your own tile' : `Choices for ${sectionTitle(section)}`}
      lead={
        custom
          ? 'Pick a number from the scorecards and what to do with it. The tile works it out for the newest week you are looking at.'
          : 'These choices belong to this layout. Other layouts keep their own.'
      }
      confirmLabel={adding ? 'Add the tile' : 'Save'}
      confirmTestId="section-options-save"
      onConfirm={save}
      onCancel={onCancel}
      noValidate
    >
      <div className="my-2">
        {custom ? (
          <>
            <Field label="Which number">
              {(id) => (
                <select
                  id={id}
                  className={selectClass}
                  value={customNumber(now.number).id}
                  onChange={(event) => change({ number: event.target.value })}
                  data-testid="custom-number"
                >
                  {CUSTOM_NUMBERS.map((one) => (
                    <option key={one.id} value={one.id}>
                      {one.label}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field label="What to show">
              {(id) => (
                <select
                  id={id}
                  className={selectClass}
                  value={now.how ?? 'average'}
                  onChange={(event) => change({ how: event.target.value as CustomHow })}
                  data-testid="custom-how"
                >
                  {CUSTOM_HOWS.map((one) => (
                    <option key={one} value={one}>
                      {CUSTOM_HOW_NAMES[one]}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            {counting ? (
              <Field
                label={now.how === 'below' ? 'Count drivers below' : 'Count drivers above'}
                hint="A driver right on this number is not counted."
              >
                {(id) => (
                  <Input
                    id={id}
                    inputMode="decimal"
                    className="w-28"
                    value={draft.limit}
                    onChange={(event) => setDraft((d) => ({ ...d, limit: event.target.value }))}
                    data-testid="custom-limit"
                  />
                )}
              </Field>
            ) : null}
            <Field label="Show it as">
              {(id) => (
                <select
                  id={id}
                  className={selectClass}
                  value={now.show ?? 'number'}
                  onChange={(event) => change({ show: event.target.value as 'number' | 'chart' })}
                  data-testid="custom-show"
                >
                  <option value="number">A big number with a small line</option>
                  <option value="chart">A chart, week by week</option>
                </select>
              )}
            </Field>
            <Field
              label="Name"
              hint={`Leave it empty to call it "${customTitle({ ...now, title: '' })}".`}
            >
              {(id) => (
                <Input
                  id={id}
                  maxLength={NAME_MAX}
                  value={now.title ?? ''}
                  onChange={(event) => change({ title: event.target.value })}
                  data-testid="custom-title"
                />
              )}
            </Field>
          </>
        ) : null}

        {now.kind === 'coaching' ? (
          <>
            <fieldset className="m-0 mb-3 border-0 p-0">
              <legend className="mb-1 p-0 text-sm font-medium">
                Put a driver on the list when
              </legend>
              {REASON_KINDS.map((kind) => (
                <Tick
                  key={kind}
                  label={REASON_NAMES[kind]}
                  checked={(now.reasons ?? REASON_KINDS).includes(kind)}
                  onChange={(on) =>
                    change({ reasons: toggle(now.reasons ?? [...REASON_KINDS], kind, on) })
                  }
                  testId={`reason-${kind}`}
                />
              ))}
            </fieldset>
            <div className="mb-3">
              <Tick
                label="Show only the High drivers"
                checked={now.highOnly === true}
                onChange={(on) => change({ highOnly: on })}
                testId="coaching-high-only"
              />
            </div>
          </>
        ) : null}

        {now.kind === 'ids' ? (
          <div className="mb-3">
            <Tick
              label="Show only IDs that have already expired"
              checked={now.expiredOnly === true}
              onChange={(on) => change({ expiredOnly: on })}
              testId="ids-expired-only"
            />
          </div>
        ) : null}

        {now.kind === 'reasons' ? (
          <fieldset className="m-0 mb-3 border-0 p-0">
            <legend className="mb-1 p-0 text-sm font-medium">Show failure reasons from</legend>
            {FAILURE_SOURCES.map((source) => (
              <Tick
                key={source}
                label={source}
                checked={(now.sources ?? FAILURE_SOURCES).includes(source)}
                onChange={(on) =>
                  change({ sources: toggle(now.sources ?? [...FAILURE_SOURCES], source, on) })
                }
                testId={`source-${source}`}
              />
            ))}
          </fieldset>
        ) : null}

        {now.showFirst !== undefined ? (
          <Field
            label="How many lines to show before Show all"
            hint={`From ${SHOW_FIRST_MIN} to ${SHOW_FIRST_MAX}.`}
          >
            {(id) => (
              <Input
                id={id}
                type="number"
                min={SHOW_FIRST_MIN}
                max={SHOW_FIRST_MAX}
                className="w-28"
                value={draft.showFirst}
                onChange={(event) => setDraft((d) => ({ ...d, showFirst: event.target.value }))}
                data-testid="section-show-first"
              />
            )}
          </Field>
        ) : null}

        {TARGET_KINDS.includes(now.kind) ? (
          <Field
            label="Target"
            hint="When the number misses the target, the tile gets a red edge and says so."
          >
            {(id) => (
              <span className="flex flex-wrap items-center gap-2">
                <select
                  id={id}
                  className={selectClass}
                  value={draft.targetDir}
                  onChange={(event) =>
                    setDraft((d) => ({ ...d, targetDir: event.target.value as Draft['targetDir'] }))
                  }
                  data-testid="target-dir"
                >
                  <option value="none">No target</option>
                  <option value="min">Should be at least</option>
                  <option value="max">Should be at most</option>
                </select>
                {draft.targetDir !== 'none' ? (
                  <Input
                    inputMode="decimal"
                    className="w-28"
                    aria-label="The target number"
                    value={draft.targetValue}
                    onChange={(event) =>
                      setDraft((d) => ({ ...d, targetValue: event.target.value }))
                    }
                    data-testid="target-value"
                  />
                ) : null}
              </span>
            )}
          </Field>
        ) : null}

        {problem ? (
          <p role="alert" className="problem text-sm" data-testid="section-options-problem">
            {problem}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}

/** The window that picks the watch list's drivers, from everyone with a scorecard on file. */
export function WatchPickerDialog({
  range,
  watch,
  onSave,
  onCancel,
}: {
  range: WeekRange | null;
  watch: readonly string[];
  onSave: (watch: string[]) => void;
  onCancel: () => void;
}) {
  const [drivers, setDrivers] = useState<Array<{ transporterId: string; name: string }> | null>(
    null,
  );
  const [problem, setProblem] = useState('');
  const [picked, setPicked] = useState<string[]>(() => [...watch]);
  const [find, setFind] = useState('');
  const findId = useId();

  useEffect(() => {
    let live = true;
    void call('performance:drivers', { range }).then((reply) => {
      if (!live) return;
      if (!reply.ok) return setProblem(explainFailure(reply));
      setDrivers(
        reply.value.rows
          .map((row) => ({ transporterId: row.transporterId, name: row.name }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
    });
    return () => {
      live = false;
    };
    // The drivers are read once, when the window opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shown = useMemo(() => {
    const words = find.trim().toLowerCase();
    return (drivers ?? []).filter((driver) => !words || driver.name.toLowerCase().includes(words));
  }, [drivers, find]);
  const full = picked.length >= MAX_WATCH;

  return (
    <Modal
      name="watch-picker"
      title="Choose drivers to watch"
      lead="Tick the drivers to keep an eye on. They stay on the watch list whatever their score is."
      confirmLabel="Save"
      confirmTestId="watch-picker-save"
      onConfirm={() => onSave(picked)}
      onCancel={onCancel}
      noValidate
    >
      <div className="my-2">
        <label htmlFor={findId} className="mb-1 block text-sm font-medium">
          Find a driver
        </label>
        <Input
          id={findId}
          value={find}
          onChange={(event) => setFind(event.target.value)}
          placeholder="Type part of a name"
          data-testid="watch-find"
        />
        <p className="m-0 my-2 text-sm text-muted" data-testid="watch-picked-count">
          {plural(picked.length, 'driver')} on the watch list
          {full ? `. That is the most it holds (${MAX_WATCH}).` : ''}
        </p>
        {problem ? (
          <p role="alert" className="problem text-sm">
            The drivers could not be listed. {problem}
          </p>
        ) : !drivers ? (
          <p role="status" className="text-sm text-muted">
            Getting the drivers...
          </p>
        ) : shown.length === 0 ? (
          <p className="text-sm text-muted">No driver matches that.</p>
        ) : (
          <ul className="m-0 max-h-[40vh] list-none overflow-y-auto rounded-md border border-line p-1">
            {shown.map((driver) => {
              const on = picked.includes(driver.transporterId);
              return (
                <li key={driver.transporterId}>
                  <label className="flex items-center gap-2 rounded-sm px-1.5 py-1 text-sm hover:bg-row-hover">
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={!on && full}
                      onChange={(event) =>
                        setPicked((now) =>
                          event.target.checked
                            ? [...now, driver.transporterId]
                            : now.filter((id) => id !== driver.transporterId),
                        )
                      }
                      data-testid="watch-pick"
                      data-driver={driver.transporterId}
                    />
                    {driver.name}
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Modal>
  );
}
