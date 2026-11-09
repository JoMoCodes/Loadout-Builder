// The Dashboard's layout controls: the Layout menu (switch between saved layouts, make, rename
// and delete them, save one to a file or bring one in), the Customize button, and the bar shown
// while customizing (add a section, this layout's own weeks, reset, done).

import {
  ChevronDown,
  Copy,
  Download,
  LayoutDashboard,
  PencilLine,
  Plus,
  RotateCcw,
  Trash2,
  Upload,
} from 'lucide-react';
import { useId, useRef, useState } from 'react';
import {
  LAYOUT_FILE_MAX,
  LAYOUT_PRESETS,
  MAX_CUSTOM,
  MAX_LAYOUTS,
  NAME_MAX,
  SECTION_NAMES,
  cleanName,
  customCount,
  layoutFileName,
  layoutToFile,
  missingKinds,
  type DashboardLayout,
  type SectionKind,
} from '../../../shared/dashboardLayout';
import { Button } from '../../ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../ui/dropdown-menu';
import { Input } from '../../ui/input';
import { Modal } from '../dataPages/Modal';

const selectClass =
  'h-8 max-w-full rounded-md border border-line-strong bg-sunken px-2 text-sm text-fg';

/** Hands the person a layout as a file to save (the app asks where to put it). */
export function saveLayoutFile(layout: DashboardLayout): void {
  const url = URL.createObjectURL(new Blob([layoutToFile(layout)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = layoutFileName(layout.name);
  document.body.append(link);
  link.click();
  link.remove();
  // Let the save start before the address is taken away.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export interface LayoutMenuProps {
  layouts: readonly DashboardLayout[];
  active: DashboardLayout;
  onSwitch(id: string): void;
  onNew(): void;
  onRename(): void;
  onDelete(): void;
  /** The text of a layout file the person picked. */
  onFile(text: string): void;
  /** Plain words for a file that could not be used. */
  onProblem(problem: string): void;
}

/** The "Layout" button and its menu. */
export function LayoutMenu({
  layouts,
  active,
  onSwitch,
  onNew,
  onRename,
  onDelete,
  onFile,
  onProblem,
}: LayoutMenuProps) {
  const picker = useRef<HTMLInputElement>(null);
  const full = layouts.length >= MAX_LAYOUTS;
  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            title="Switch to another layout, or make a new one"
            data-testid="dashboard-layout-menu"
          >
            <LayoutDashboard aria-hidden="true" />
            <span className="max-w-[14rem] truncate">Layout: {active.name}</span>
            <ChevronDown aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" data-testid="dashboard-layout-list">
          <DropdownMenuLabel>Your layouts</DropdownMenuLabel>
          {layouts.map((layout) => (
            <DropdownMenuCheckboxItem
              key={layout.id}
              checked={layout.id === active.id}
              onSelect={() => onSwitch(layout.id)}
              data-testid="dashboard-layout-item"
              data-layout={layout.id}
            >
              {layout.name}
            </DropdownMenuCheckboxItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={full} onSelect={onNew} data-testid="dashboard-layout-new">
            <Plus aria-hidden="true" />
            {full ? `New layout (${MAX_LAYOUTS} is the most)` : 'New layout...'}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onRename} data-testid="dashboard-layout-rename">
            <PencilLine aria-hidden="true" />
            Rename this layout...
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={layouts.length < 2}
            onSelect={onDelete}
            data-testid="dashboard-layout-delete"
          >
            <Trash2 aria-hidden="true" />
            Delete this layout...
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => saveLayoutFile(active)}
            data-testid="dashboard-layout-save-file"
          >
            <Download aria-hidden="true" />
            Save this layout to a file
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={full}
            onSelect={() => picker.current?.click()}
            data-testid="dashboard-layout-open-file"
          >
            <Upload aria-hidden="true" />
            Bring in a layout from a file...
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <input
        ref={picker}
        type="file"
        accept=".json,application/json"
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
        data-testid="dashboard-layout-file"
        onChange={(event) => {
          const file = event.target.files?.[0];
          // The same file can be picked again later.
          event.target.value = '';
          if (!file) return;
          if (file.size > LAYOUT_FILE_MAX) {
            return onProblem('That file is too big to be a Dashboard layout.');
          }
          file.text().then(onFile, () => onProblem('That file could not be read.'));
        }}
      />
    </>
  );
}

/** "New layout": a name, and what to start from. */
export function NewLayoutDialog({
  current,
  onCreate,
  onCancel,
}: {
  current: DashboardLayout;
  /** `from` is a ready-made layout's id, or "copy" for a copy of the one in use. */
  onCreate: (name: string, from: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [from, setFrom] = useState('copy');
  const nameId = useId();
  const fromId = useId();
  const preset = LAYOUT_PRESETS.find((one) => one.id === from);
  return (
    <Modal
      name="new-layout"
      title="New layout"
      lead="A layout is your own arrangement of the Dashboard. Make one for each way you use it."
      confirmLabel="Make the layout"
      confirmTestId="new-layout-create"
      confirmDisabled={cleanName(name) === ''}
      onConfirm={() => onCreate(cleanName(name), from)}
      onCancel={onCancel}
      noValidate
    >
      <div className="my-2">
        <label htmlFor={nameId} className="mb-1 block text-sm font-medium">
          Name
        </label>
        <Input
          id={nameId}
          autoFocus
          maxLength={NAME_MAX}
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="For example: Manager review"
          data-testid="new-layout-name"
        />
        <label htmlFor={fromId} className="mt-3 mb-1 block text-sm font-medium">
          Start from
        </label>
        <select
          id={fromId}
          className={selectClass}
          value={from}
          onChange={(event) => setFrom(event.target.value)}
          data-testid="new-layout-from"
        >
          <option value="copy">A copy of "{current.name}"</option>
          {LAYOUT_PRESETS.map((one) => (
            <option key={one.id} value={one.id}>
              {one.name}
            </option>
          ))}
        </select>
        <p className="m-0 mt-1 text-[0.857rem] text-muted" data-testid="new-layout-about">
          {preset ? preset.about : 'Everything as it is now. Change it without touching this one.'}
        </p>
      </div>
    </Modal>
  );
}

export function RenameLayoutDialog({
  layout,
  onRename,
  onCancel,
}: {
  layout: DashboardLayout;
  onRename: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(layout.name);
  const id = useId();
  return (
    <Modal
      name="rename-layout"
      title="Rename this layout"
      confirmLabel="Rename"
      confirmTestId="rename-layout-save"
      confirmDisabled={cleanName(name) === ''}
      onConfirm={() => onRename(cleanName(name))}
      onCancel={onCancel}
      noValidate
    >
      <div className="my-2">
        <label htmlFor={id} className="mb-1 block text-sm font-medium">
          Name
        </label>
        <Input
          id={id}
          autoFocus
          maxLength={NAME_MAX}
          value={name}
          onChange={(event) => setName(event.target.value)}
          data-testid="rename-layout-name"
        />
      </div>
    </Modal>
  );
}

/** The Customize button next to the Dashboard's title. */
export function CustomizeButton({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <Button
      variant={on ? 'primary' : 'default'}
      aria-pressed={on}
      onClick={onClick}
      title="Move, resize, hide and add sections"
      data-testid="dashboard-customize"
    >
      <PencilLine aria-hidden="true" />
      {on ? 'Done customizing' : 'Customize'}
    </Button>
  );
}

/** The bar across the top while customizing. */
export function CustomizeBar({
  layout,
  onAdd,
  onAddCustom,
  onOwnWeeks,
  onReset,
  onDuplicate,
  onDone,
}: {
  layout: DashboardLayout;
  onAdd: (kind: SectionKind) => void;
  onAddCustom: () => void;
  onOwnWeeks: (own: boolean) => void;
  onReset: () => void;
  onDuplicate: () => void;
  onDone: () => void;
}) {
  const missing = missingKinds(layout.sections);
  const customFull = customCount(layout.sections) >= MAX_CUSTOM;
  return (
    <div
      className="flex flex-col gap-2 rounded-lg border border-accent bg-accent-soft px-3 py-2"
      role="region"
      aria-label="Customize the Dashboard"
      data-testid="dashboard-customize-bar"
    >
      <p className="m-0 text-sm text-fg">
        <strong>You are changing the layout "{layout.name}".</strong> Drag a section by its name to
        move it, or use its arrow buttons. Drag its right edge, or pick a size, to make it wider or
        narrower. Changes are saved as you make them.
      </p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button data-testid="dashboard-add-section">
              <Plus aria-hidden="true" />
              Add a section
              <ChevronDown aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" data-testid="dashboard-add-list">
            <DropdownMenuItem
              disabled={customFull}
              onSelect={onAddCustom}
              data-testid="dashboard-add-custom"
            >
              <Plus aria-hidden="true" />
              {customFull ? `Your own tile (${MAX_CUSTOM} is the most)` : 'Your own tile...'}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>
              {missing.length > 0
                ? 'Sections not on this layout'
                : 'Every section is on this layout'}
            </DropdownMenuLabel>
            {missing.map((kind) => (
              <DropdownMenuItem
                key={kind}
                onSelect={() => onAdd(kind)}
                data-testid={`dashboard-add-${kind}`}
              >
                {SECTION_NAMES[kind]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <label
          className="flex items-center gap-2 text-sm"
          title="On: this layout remembers its own weeks. Off: it shows the same weeks as the Scorecards page."
        >
          <input
            type="checkbox"
            checked={layout.weeks.own}
            onChange={(event) => onOwnWeeks(event.target.checked)}
            data-testid="dashboard-own-weeks"
          />
          This layout keeps its own weeks
        </label>
        <span className="ml-auto flex flex-wrap items-center gap-2">
          <Button onClick={onDuplicate} data-testid="dashboard-duplicate">
            <Copy aria-hidden="true" />
            Save as a new layout
          </Button>
          <Button onClick={onReset} data-testid="dashboard-reset">
            <RotateCcw aria-hidden="true" />
            Reset to the usual layout
          </Button>
          <Button variant="primary" onClick={onDone} data-testid="dashboard-customize-done">
            Done
          </Button>
        </span>
      </div>
    </div>
  );
}
