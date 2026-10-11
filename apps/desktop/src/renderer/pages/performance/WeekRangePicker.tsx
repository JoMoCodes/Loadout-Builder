// The weeks the Drivers tab (and the reports) work on: a From and a To list over every week
// brought in, and quick picks. The choice is remembered between runs (settings.performance).

import type { WeekRange } from '../../../shared/performance';
import type { WeekRangeChoice } from '../../../shared/performanceSettings';
import { Button } from '../../ui/button';
import { QUICK_PICKS, quickPickOf, quickRange } from './perfText';

interface WeekRangePickerProps {
  weeks: readonly string[];
  range: WeekRange | null;
  onChange: (choice: WeekRangeChoice) => void;
  /** Plain words when a choice will not do (From after To). */
  onProblem: (words: string) => void;
}

const SELECT =
  'h-8 rounded-md border border-line-strong bg-sunken px-2 text-sm text-fg disabled:opacity-50';

export function WeekRangePicker({ weeks, range, onChange, onProblem }: WeekRangePickerProps) {
  const none = weeks.length === 0 || range === null;
  const picked = quickPickOf(weeks, range);

  function choose(end: 'from' | 'to', week: string) {
    if (!range) return;
    const next = { ...range, [end]: week };
    if (next.from > next.to) {
      onProblem('The first week must be the same as the last week or before it.');
      return;
    }
    onChange(next);
  }

  return (
    <div
      role="group"
      aria-label="Weeks"
      className="flex flex-wrap items-center gap-2"
      data-testid="perf-week-range"
    >
      <label className="flex items-center gap-1.5 text-sm text-muted">
        From
        <select
          className={SELECT}
          value={range?.from ?? ''}
          disabled={none}
          onChange={(event) => choose('from', event.target.value)}
          data-testid="perf-week-from"
        >
          {none ? <option value="">No weeks yet</option> : null}
          {weeks.map((week) => (
            <option key={week} value={week}>
              {week}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-1.5 text-sm text-muted">
        To
        <select
          className={SELECT}
          value={range?.to ?? ''}
          disabled={none}
          onChange={(event) => choose('to', event.target.value)}
          data-testid="perf-week-to"
        >
          {none ? <option value="">No weeks yet</option> : null}
          {weeks.map((week) => (
            <option key={week} value={week}>
              {week}
            </option>
          ))}
        </select>
      </label>
      <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Quick picks">
        {QUICK_PICKS.map((pick) => (
          <Button
            key={pick.id}
            size="sm"
            variant={picked === pick.id ? 'primary' : 'default'}
            aria-pressed={picked === pick.id}
            disabled={none}
            onClick={() => onChange(quickRange(weeks, pick.weeks))}
            data-testid={`perf-weeks-${pick.id}`}
          >
            {pick.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
