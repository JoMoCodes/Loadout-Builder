// The Dashboard's grid: the sections of a layout, in order, on twelve columns. A section takes
// its width (Small to Full) on a wide page; on a narrower one it takes half or all of the page,
// and on a narrow one every section is as wide as the page.
//
// While customizing, each section gets a strip of controls: a handle to drag it somewhere else,
// buttons to move it earlier or later (so no mouse is needed), its width and height, its own
// choices, and a button to hide it. Its right edge can be dragged to make it wider or narrower.
// The section itself is switched off meanwhile, so a drag never opens a driver's menu.

import {
  ChevronLeft,
  ChevronRight,
  EyeOff,
  GripVertical,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import {
  HEIGHTS,
  HEIGHT_NAMES,
  HEIGHT_REM,
  WIDTHS,
  WIDTH_NAMES,
  narrowWidth,
  nearestWidth,
  type DashboardSection,
  type SectionHeight,
  type SectionWidth,
} from '../../../shared/dashboardLayout';
import { Button } from '../../ui/button';
import { cn } from '../../ui/cn';
import { isTile } from './sections';
import { sectionTitle } from './words';

/** The sections that have choices of their own (the Options button). */
export function hasOptions(section: DashboardSection): boolean {
  return !['tile-tiers', 'improved', 'declined', 'trend'].includes(section.kind);
}

export interface GridEdits {
  /** Puts a section just before (or after) another. */
  move(id: string, targetId: string, after: boolean): void;
  /** Moves a section one place earlier (-1) or later (1). */
  step(id: string, direction: 1 | -1): void;
  resize(id: string, change: { width?: SectionWidth; height?: SectionHeight }): void;
  /** Opens the section's own choices. */
  options(id: string): void;
  /** Takes the section off the layout. */
  remove(id: string): void;
}

const selectClass =
  'h-7 max-w-full rounded-md border border-line-strong bg-sunken px-1.5 text-[0.857rem] text-fg';

export function DashboardGrid({
  sections,
  customizing,
  edits,
  render,
  busy,
}: {
  sections: readonly DashboardSection[];
  customizing: boolean;
  edits: GridEdits;
  render: (section: DashboardSection) => ReactNode;
  /** New numbers are on the way: the old ones are shown faded. */
  busy: boolean;
}) {
  const grid = useRef<HTMLDivElement>(null);
  /** The section being dragged. Kept in a ref for the drag itself; the state only fades it. */
  const dragged = useRef<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<{ id: string; after: boolean } | null>(null);
  /** A width being dragged, shown before it is saved. */
  const [sizing, setSizing] = useState<{ id: string; width: SectionWidth } | null>(null);
  /** Read out by a screen reader after a move. */
  const [said, setSaid] = useState('');
  /** The control to put the keyboard back on once the sections have been drawn again. */
  const refocus = useRef<string | null>(null);

  useEffect(() => {
    if (!refocus.current) return;
    const control = grid.current?.querySelector<HTMLElement>(
      `[data-testid="${refocus.current}"]:not(:disabled)`,
    );
    refocus.current = null;
    control?.focus();
  });

  function step(section: DashboardSection, direction: 1 | -1) {
    const at = sections.findIndex((one) => one.id === section.id);
    const to = at + direction;
    if (to < 0 || to >= sections.length) return;
    // The button that was pressed is switched off at the first or last place: the keyboard then
    // goes to the button beside it, so it is never lost.
    const stuck = direction === -1 ? to === 0 : to === sections.length - 1;
    const way = direction === -1 ? 'earlier' : 'later';
    const other = direction === -1 ? 'later' : 'earlier';
    refocus.current = `section-${section.id}-${stuck ? other : way}`;
    edits.step(section.id, direction);
    setSaid(`${sectionTitle(section)} moved to place ${to + 1} of ${sections.length}.`);
  }

  /** Which side of a section the pointer is on: true for after it. */
  function afterOf(event: DragEvent<HTMLDivElement>): boolean {
    const box = event.currentTarget.getBoundingClientRect();
    // A section as wide as the page is passed above or below; the others left or right.
    const full = box.width > (grid.current?.getBoundingClientRect().width ?? 0) * 0.9;
    return full
      ? event.clientY > box.top + box.height / 2
      : event.clientX > box.left + box.width / 2;
  }

  function dragOver(event: DragEvent<HTMLDivElement>, section: DashboardSection) {
    if (!dragged.current) return;
    event.preventDefault();
    // Kept from the window's own rule (useNoStrayDrops), which would call the drop off.
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'move';
    if (dragged.current === section.id) return setOver(null);
    const after = afterOf(event);
    setOver((now) =>
      now && now.id === section.id && now.after === after ? now : { id: section.id, after },
    );
  }

  function drop(event: DragEvent<HTMLDivElement>, section: DashboardSection) {
    event.preventDefault();
    // Worked out from where it was let go, not from the marker (which may be a moment behind).
    const moved = sections.find((one) => one.id === dragged.current);
    if (moved && moved.id !== section.id) {
      edits.move(moved.id, section.id, afterOf(event));
      setSaid(`${sectionTitle(moved)} moved.`);
    }
    dragged.current = null;
    setDragging(null);
    setOver(null);
  }

  /** Dragging a section's right edge: its width follows the pointer, a named width at a time. */
  function resizeFrom(event: PointerEvent<HTMLDivElement>, section: DashboardSection) {
    const frame = event.currentTarget.parentElement;
    const whole = grid.current;
    if (!frame || !whole) return;
    event.preventDefault();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const left = frame.getBoundingClientRect().left;
    const gap = parseFloat(getComputedStyle(whole).columnGap) || 0;
    const column = (whole.getBoundingClientRect().width + gap) / 12;
    let width = section.width;
    const follow = (move: globalThis.PointerEvent) => {
      width = nearestWidth((move.clientX - left + gap) / column);
      setSizing({ id: section.id, width });
    };
    const done = () => {
      handle.removeEventListener('pointermove', follow);
      handle.removeEventListener('pointerup', done);
      handle.removeEventListener('pointercancel', done);
      setSizing(null);
      if (width !== section.width) edits.resize(section.id, { width });
    };
    handle.addEventListener('pointermove', follow);
    handle.addEventListener('pointerup', done);
    handle.addEventListener('pointercancel', done);
  }

  return (
    <div className="@container/dash" data-testid="dashboard-body">
      <div
        ref={grid}
        className={cn(
          'grid grid-cols-12 gap-4',
          busy && !customizing && 'opacity-70 transition-opacity',
        )}
        data-customizing={customizing ? 'true' : undefined}
      >
        {sections.map((section, index) => {
          const width = customizing && sizing?.id === section.id ? sizing.width : section.width;
          const name = sectionTitle(section);
          const fixed = section.height !== 'fit';
          const style = {
            '--w': width,
            '--w-narrow': narrowWidth(width),
            height: fixed
              ? `${HEIGHT_REM[section.height as Exclude<SectionHeight, 'fit'>]}rem`
              : undefined,
          } as CSSProperties;
          const dropSide =
            customizing && over?.id === section.id ? (over.after ? 'after' : 'before') : null;
          return (
            <div
              key={section.id}
              style={style}
              data-section={section.id}
              data-width={width}
              data-height={section.height}
              data-drop={dropSide ?? undefined}
              onDragOver={customizing ? (event) => dragOver(event, section) : undefined}
              onDrop={customizing ? (event) => drop(event, section) : undefined}
              className={cn(
                'relative col-span-full flex min-w-0 flex-col',
                '@2xl/dash:[grid-column:span_var(--w-narrow)] @5xl/dash:[grid-column:span_var(--w)]',
                // A tile is as tall as its row; a list or a chart is as tall as what is in it.
                !fixed && !customizing && !isTile(section) && 'self-start',
                customizing &&
                  'rounded-lg outline-2 outline-offset-2 outline-line-strong outline-dashed',
                customizing && dragging === section.id && 'opacity-40',
                dropSide === 'before' && 'shadow-[-4px_0_0_0_var(--accent)]',
                dropSide === 'after' && 'shadow-[4px_0_0_0_var(--accent)]',
              )}
            >
              {customizing ? (
                <div
                  className="mb-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 rounded-md bg-raised px-1.5 py-1"
                  role="group"
                  aria-label={`${name}: place and size`}
                  data-testid={`section-${section.id}-bar`}
                >
                  <span
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = 'move';
                      event.dataTransfer.setData('text/plain', section.id);
                      const frame = event.currentTarget.closest<HTMLElement>('[data-section]');
                      if (frame) event.dataTransfer.setDragImage(frame, 16, 16);
                      dragged.current = section.id;
                      // Fading it is left for a moment: a browser can call the drag off when the
                      // thing being dragged changes while the drag is starting.
                      requestAnimationFrame(() => setDragging(dragged.current));
                    }}
                    onDragEnd={() => {
                      dragged.current = null;
                      setDragging(null);
                      setOver(null);
                    }}
                    title="Drag to move this section"
                    className="flex w-full min-w-0 cursor-grab items-center gap-1 text-[0.857rem] font-semibold active:cursor-grabbing"
                    data-testid={`section-${section.id}-handle`}
                  >
                    <GripVertical aria-hidden="true" className="size-[1.1em] shrink-0 text-muted" />
                    <span className="min-w-0 truncate">{name}</span>
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    disabled={index === 0}
                    onClick={() => step(section, -1)}
                    aria-label={`Move ${name} earlier`}
                    title="Move earlier"
                    data-testid={`section-${section.id}-earlier`}
                  >
                    <ChevronLeft aria-hidden="true" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    disabled={index === sections.length - 1}
                    onClick={() => step(section, 1)}
                    aria-label={`Move ${name} later`}
                    title="Move later"
                    data-testid={`section-${section.id}-later`}
                  >
                    <ChevronRight aria-hidden="true" />
                  </Button>
                  <select
                    className={selectClass}
                    value={section.width}
                    aria-label={`How wide ${name} is`}
                    title="How wide"
                    data-testid={`section-${section.id}-width`}
                    onChange={(event) => {
                      refocus.current = `section-${section.id}-width`;
                      edits.resize(section.id, {
                        width: Number(event.target.value) as SectionWidth,
                      });
                    }}
                  >
                    {WIDTHS.map((one) => (
                      <option key={one} value={one}>
                        {`↔ ${WIDTH_NAMES[one]}`}
                      </option>
                    ))}
                  </select>
                  <select
                    className={selectClass}
                    value={section.height}
                    aria-label={`How tall ${name} is`}
                    title="How tall"
                    data-testid={`section-${section.id}-height`}
                    onChange={(event) =>
                      edits.resize(section.id, { height: event.target.value as SectionHeight })
                    }
                  >
                    {HEIGHTS.map((one) => (
                      <option key={one} value={one}>
                        {`↕ ${HEIGHT_NAMES[one]}`}
                      </option>
                    ))}
                  </select>
                  {hasOptions(section) ? (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => edits.options(section.id)}
                      aria-label={`Choices for ${name}`}
                      title="Choices for this section"
                      data-testid={`section-${section.id}-options`}
                    >
                      <SlidersHorizontal aria-hidden="true" />
                    </Button>
                  ) : null}
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      edits.remove(section.id);
                      setSaid(
                        `${name} ${section.kind === 'custom' ? 'deleted' : 'hidden'}. ` +
                          (section.kind === 'custom' ? '' : 'Add a section brings it back.'),
                      );
                    }}
                    aria-label={section.kind === 'custom' ? `Delete ${name}` : `Hide ${name}`}
                    title={section.kind === 'custom' ? 'Delete this tile' : 'Hide this section'}
                    data-testid={`section-${section.id}-hide`}
                  >
                    {section.kind === 'custom' ? (
                      <Trash2 aria-hidden="true" />
                    ) : (
                      <EyeOff aria-hidden="true" />
                    )}
                  </Button>
                </div>
              ) : null}
              <div
                className={cn(
                  'flex min-h-0 min-w-0 flex-1 flex-col',
                  customizing && 'pointer-events-none select-none',
                )}
                inert={customizing}
              >
                {render(section)}
              </div>
              {customizing ? (
                <div
                  onPointerDown={(event) => resizeFrom(event, section)}
                  aria-hidden="true"
                  title="Drag to make this section wider or narrower"
                  className="absolute top-0 -right-2 bottom-0 hidden w-3 cursor-ew-resize touch-none rounded-sm hover:bg-accent-soft @5xl/dash:block"
                  data-testid={`section-${section.id}-resize`}
                />
              ) : null}
            </div>
          );
        })}
      </div>
      <p className="sr-only" role="status" aria-live="polite" data-testid="dashboard-said">
        {said}
      </p>
    </div>
  );
}
