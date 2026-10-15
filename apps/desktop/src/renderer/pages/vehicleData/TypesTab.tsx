// Vehicle Types: what kind of van each one is. The vehicle list's Ownership Type column says, and
// each ownership type lists the words that mean it. Here people make and change the types, see
// where each lands in the Assign Vans order, and set a van whose list word is wrong. Every change
// asks first when it moves vans, and can be undone from the status line.

import type { VehicleType } from '@loadout/core';
import { useCallback, useMemo, useState } from 'react';
import type { GridColumn, RowAction } from '../../components/DataGrid';
import { DataGrid } from '../../components/DataGrid';
import type { AppSnapshot, VehicleTypeView, VehicleView } from '../../../shared/snapshot';
import { databaseLayoutStore } from '../../lib/gridLayoutStore';
import { Button } from '../../ui/button';
import { Chip } from '../../ui/chip';
import { command } from '../dataPages/bringIn';
import { nameList } from '../dataPages/format';
import { ConfirmDialog } from '../dataPages/Modal';
import {
  ButtonStrip,
  FilterCheck,
  FilterSelect,
  HeaderCard,
  type Messages,
} from '../dataPages/PageParts';
import { chosenRows, rowsForMenu, usePicks } from '../dataPages/picks';
import { useDialogs } from '../dataPages/useDialogs';
import { DeleteTypeDialog, PickTypeDialog, TypeDialog } from './TypeDialogs';
import {
  ALL_TYPES,
  afterDelete,
  impactOf,
  impactQuestion,
  listSays,
  orderSteps,
  passesTypeFilters,
  plainTypes,
  typeFilterOptions,
  typeMix,
  typeVanId,
  typesAfterMove,
  typesAfterSave,
  typesAfterWord,
  whoShort,
  whyListed,
  type TypeFields,
} from './typeRows';

export function TypesTab({ snapshot, messages }: { snapshot: AppSnapshot; messages: Messages }) {
  const { setStatus } = messages;
  const { ask, host } = useDialogs();
  const picks = usePicks();
  const [shown, setShown] = useState(ALL_TYPES);
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null);

  const views = snapshot.vehicles;
  const types = snapshot.vehicleTypes;
  const options = useMemo(() => typeFilterOptions(snapshot), [snapshot]);
  const shownChoice = options.includes(shown) ? shown : ALL_TYPES;
  const steps = useMemo(() => orderSteps(plainTypes(snapshot)), [snapshot]);
  const handOnly = types.filter((type) => type.drive === 'hand');
  const setHere = Object.keys(snapshot.vehicleTypeOverrides).length;
  const flagged = views.filter((view) => whyListed(view).tone === 'bad').length;

  const columns = useMemo<GridColumn<VehicleView>[]>(
    () => [
      picks.column(typeVanId),
      { id: 'name', header: 'Vehicle', value: (view) => view.vehicle.name },
      { id: 'service_type', header: 'Service Type', value: (view) => view.vehicle.serviceType },
      { id: 'list_says', header: 'The List Says', value: listSays },
      {
        id: 'type',
        header: 'Type',
        value: (view) => view.typeName,
        fitExtra: 24,
        cell: (view) =>
          view.typeSource === 'set-here' ? (
            <Chip tone="warn" icon={null}>
              {view.typeName}
            </Chip>
          ) : (
            <span className="truncate">{view.typeName}</span>
          ),
      },
      { id: 'who', header: 'Who May Drive It', value: (view) => driveText(view) },
      {
        id: 'why',
        header: 'Why It Stands Out',
        value: (view) => whyListed(view).text,
        fitExtra: 24,
        cell: (view) => {
          const { text, tone } = whyListed(view);
          return tone ? <Chip tone={tone}>{text}</Chip> : <span className="text-faint">-</span>;
        },
      },
    ],
    [picks],
  );

  const filter = useCallback(
    (view: VehicleView) => passesTypeFilters(view, shownChoice, flaggedOnly),
    [shownChoice, flaggedOnly],
  );
  const rowTone = useCallback((view: VehicleView) => whyListed(view).tone || undefined, []);

  // ------------------------------------------------------------- the actions

  /** Says what happened, with an Undo that puts the types and vans back as they were. */
  function done(text: string) {
    const before = {
      types: plainTypes(snapshot),
      overrides: { ...snapshot.vehicleTypeOverrides },
    };
    setStatus(text, {
      label: 'Undo',
      testId: 'types-undo',
      onClick: () => {
        void (async () => {
          const reply = await command(messages, 'vehicles:restore-types', before);
          if (reply.ok) setStatus('Put back as it was.');
        })();
      },
    });
  }

  /** Asks before a change that moves vans. True to go ahead. */
  async function goAhead(
    nextTypes: readonly VehicleType[],
    nextOverrides: Readonly<Record<string, string>>,
  ): Promise<boolean> {
    const question = impactQuestion(impactOf(views, nextTypes, nextOverrides));
    if (question === null) return true;
    const yes = await ask<boolean>((answer) => (
      <ConfirmDialog
        title="Change these vans?"
        body={question}
        confirmLabel="Yes, change them"
        cancelLabel="No"
        onDone={answer}
      />
    ));
    return yes === true;
  }

  function theChosen(clicked?: VehicleView): VehicleView[] {
    const rows = clicked
      ? rowsForMenu(views, typeVanId, picks.ids, clicked)
      : chosenRows(
          views,
          typeVanId,
          picks.ids,
          views.find((view) => typeVanId(view) === currentId) ?? null,
        );
    if (rows.length === 0) setStatus('Select a van first.');
    return rows;
  }

  async function setType(rows: VehicleView[]) {
    if (rows.length === 0) return;
    const names = nameList(rows.map((view) => view.vehicle.name));
    const typeId = await ask<string | null>((answer) => (
      <PickTypeDialog
        title="Set the type"
        lead={`What kind of van is ${names}? This is kept when a new vehicle list comes in.`}
        types={types}
        initial={rows[0]!.typeId}
        confirmLabel="Set type"
        onDone={answer}
      />
    ));
    if (typeId === null) return;
    const changes = rows.map((view) => ({ vin: view.vehicle.vin, typeId }));
    const nextOverrides = { ...snapshot.vehicleTypeOverrides };
    for (const change of changes) nextOverrides[change.vin] = typeId;
    if (!(await goAhead(plainTypes(snapshot), nextOverrides))) return;
    const reply = await command(messages, 'vehicles:set-types', { changes });
    if (!reply.ok) return;
    const typeName = types.find((type) => type.id === typeId)?.name ?? typeId;
    done(`${names} set to ${typeName}.`);
  }

  async function backToList(rows: VehicleView[]) {
    if (rows.length === 0) return;
    const setRows = rows.filter((view) => view.typeSource === 'set-here');
    if (setRows.length === 0) {
      setStatus('Those vans already follow the vehicle list.');
      return;
    }
    const nextOverrides = { ...snapshot.vehicleTypeOverrides };
    for (const view of setRows) delete nextOverrides[view.vehicle.vin];
    if (!(await goAhead(plainTypes(snapshot), nextOverrides))) return;
    const reply = await command(messages, 'vehicles:set-types', {
      changes: setRows.map((view) => ({ vin: view.vehicle.vin, typeId: '' })),
    });
    if (!reply.ok) return;
    done(`${nameList(setRows.map((view) => view.vehicle.name))} back to the vehicle list's type.`);
  }

  async function saveType(editing: VehicleTypeView | null) {
    const fields = await ask<TypeFields | null>((answer) => (
      <TypeDialog
        types={types}
        editing={editing}
        suggestions={snapshot.unknownOwnership.map((entry) => entry.word)}
        onDone={answer}
      />
    ));
    if (fields === null) return;
    const nextTypes = typesAfterSave(plainTypes(snapshot), editing?.id ?? null, fields);
    if (!(await goAhead(nextTypes, snapshot.vehicleTypeOverrides))) return;
    const reply = await command(messages, 'vehicles:save-type', {
      id: editing?.id ?? null,
      ...fields,
    });
    if (!reply.ok) return;
    done(editing ? `${fields.name} saved.` : `${fields.name} created.`);
  }

  async function move(type: VehicleTypeView, direction: 'earlier' | 'later') {
    const nextTypes = typesAfterMove(plainTypes(snapshot), type.id, direction);
    if (!(await goAhead(nextTypes, snapshot.vehicleTypeOverrides))) return;
    const reply = await command(messages, 'vehicles:move-type', { id: type.id, direction });
    if (!reply.ok) return;
    done(`${type.name} moved ${direction} in the Assign Vans order.`);
  }

  async function deleteType(type: VehicleTypeView) {
    const moveTo = await ask<string | null>((answer) => (
      <DeleteTypeDialog type={type} types={types} onDone={answer} />
    ));
    if (moveTo === null) return;
    const next = afterDelete(plainTypes(snapshot), snapshot.vehicleTypeOverrides, type.id, moveTo);
    if (!(await goAhead(next.types, next.overrides))) return;
    const reply = await command(messages, 'vehicles:delete-type', { id: type.id, moveTo });
    if (!reply.ok) return;
    const target = types.find((t) => t.id === moveTo)?.name ?? moveTo;
    done(`${type.name} deleted. Its vans are now ${target}.`);
  }

  async function addWord(word: string) {
    const typeId = await ask<string | null>((answer) => (
      <PickTypeDialog
        title={`What does "${word}" mean?`}
        lead={`Vans whose Ownership Type says ${word} become the type you pick, now and every time a vehicle list comes in.`}
        types={types}
        initial=""
        confirmLabel="Add to type"
        onDone={answer}
      />
    ));
    if (typeId === null) return;
    const nextTypes = typesAfterWord(plainTypes(snapshot), typeId, word);
    if (!(await goAhead(nextTypes, snapshot.vehicleTypeOverrides))) return;
    const reply = await command(messages, 'vehicles:add-ownership-word', { typeId, word });
    if (!reply.ok) return;
    const typeName = types.find((type) => type.id === typeId)?.name ?? typeId;
    done(`${word} now means ${typeName}.`);
  }

  const rowActions = useMemo<RowAction<VehicleView>[]>(
    () => [
      { id: 'set-type', label: 'Set type...', onSelect: (view) => void setType(theChosen(view)) },
      {
        id: 'back-to-list',
        label: "Back to the list's type",
        onSelect: (view) => void backToList(theChosen(view)),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the actions read the latest rows and ticks on each render
    [views, picks.ids, types],
  );

  function activate(view: VehicleView, columnId: string) {
    if (columnId === 'pick') picks.toggle(typeVanId(view));
    else void setType([view]);
  }

  return (
    <>
      <HeaderCard
        name="types"
        title="Vehicle Types"
        sub="The vehicle list's Ownership Type says what kind each van is, and that decides who may drive it and when Assign Vans hands it out. When the list has a van wrong, set it here. Your choices are kept when a new list comes in."
        metric={`${types.length} types`}
        details={[
          typeMix(snapshot),
          [setHere ? `set here: ${setHere}` : '', flagged ? `to look at: ${flagged}` : '']
            .filter(Boolean)
            .join('   '),
        ]}
      />

      <details
        open
        className="shrink-0 border-b border-line bg-surface px-6 py-2"
        data-testid="types-panel"
      >
        <summary className="cursor-pointer text-sm font-semibold">
          Ownership types and the Assign Vans order
        </summary>
        <div className="flex max-h-[40vh] flex-col gap-3 overflow-auto py-2">
          <section aria-labelledby="types-order-title" className="flex flex-col gap-1.5">
            <h3 id="types-order-title" className="m-0 text-sm font-semibold">
              Assign Vans order
            </h3>
            <p className="hint m-0">
              When more than one van fits a driver equally well, the kind further left goes out
              first. A driver&apos;s own van (Van Affinity), last time&apos;s van and van priority
              still come before this.
            </p>
            <ol
              className="m-0 flex list-none flex-wrap items-stretch gap-1.5 p-0"
              data-testid="types-order"
            >
              {steps.map((step) => (
                <li
                  key={step.id || 'step'}
                  className="flex min-w-[9rem] flex-1 flex-col rounded-md border border-line px-2.5 py-1.5"
                  data-step={step.id || 'step-vans'}
                >
                  <span className="flex items-center gap-2 font-semibold">
                    <span className="inline-flex size-5 items-center justify-center rounded-full bg-accent-soft text-xs tabular-nums">
                      {step.place}
                    </span>
                    {step.name}
                  </span>
                  <span className="text-xs text-muted">{step.who}</span>
                </li>
              ))}
            </ol>
            {handOnly.length > 0 ? (
              <p className="hint m-0" data-testid="types-not-in-order">
                Not in the order, never handed out by Assign Vans:{' '}
                {handOnly.map((type) => type.name).join(', ')}.
              </p>
            ) : null}
          </section>

          <section aria-labelledby="types-list-title" className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h3 id="types-list-title" className="m-0 text-sm font-semibold">
                Ownership types
              </h3>
              <Button
                size="sm"
                variant="primary"
                className="ml-auto"
                onClick={() => void saveType(null)}
                data-testid="create-type"
              >
                + Create a type
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table
                className="w-full min-w-[44rem] border-collapse text-sm"
                data-testid="types-table"
              >
                <thead>
                  <tr className="text-left text-xs text-muted">
                    <th scope="col" className="py-1 pr-3 font-semibold">
                      Type
                    </th>
                    <th scope="col" className="py-1 pr-3 font-semibold">
                      Who may drive it
                    </th>
                    <th scope="col" className="py-1 pr-3 font-semibold">
                      Place in the order
                    </th>
                    <th scope="col" className="py-1 pr-3 font-semibold">
                      Vehicle list says
                    </th>
                    <th scope="col" className="py-1 pr-3 font-semibold">
                      Vans
                    </th>
                    <th scope="col" className="py-1 font-semibold">
                      <span className="sr-only">Changes</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {types.map((type) => {
                    const lastPlace = steps.length;
                    return (
                      <tr key={type.id} className="border-t border-line" data-type={type.id}>
                        <td className="py-1.5 pr-3">
                          <span className="flex items-center gap-2 font-semibold">
                            {type.name}
                            {type.builtIn ? null : (
                              <Chip tone="ok" icon={null}>
                                Yours
                              </Chip>
                            )}
                          </span>
                        </td>
                        <td className="py-1.5 pr-3">{whoShort(type.drive)}</td>
                        <td className="py-1.5 pr-3">
                          {type.place === null ? (
                            <span className="text-muted">Not in the order</span>
                          ) : (
                            <span className="flex items-center gap-1.5">
                              <span className="tabular-nums">
                                {type.place} of {lastPlace}
                              </span>
                              <Button
                                size="sm"
                                aria-label={`Move ${type.name} earlier`}
                                disabled={type.place <= 2}
                                onClick={() => void move(type, 'earlier')}
                                data-testid={`type-up-${type.id}`}
                              >
                                ↑
                              </Button>
                              <Button
                                size="sm"
                                aria-label={`Move ${type.name} later`}
                                disabled={type.place >= lastPlace}
                                onClick={() => void move(type, 'later')}
                                data-testid={`type-down-${type.id}`}
                              >
                                ↓
                              </Button>
                            </span>
                          )}
                        </td>
                        <td className="py-1.5 pr-3">
                          {type.words.length === 0 ? (
                            <span className="text-faint">-</span>
                          ) : (
                            <span className="flex flex-wrap gap-1">
                              {type.words.map((word) => (
                                <code
                                  key={word}
                                  className="rounded border border-line px-1.5 text-xs"
                                >
                                  {word}
                                </code>
                              ))}
                            </span>
                          )}
                        </td>
                        <td className="py-1.5 pr-3 tabular-nums">{type.vans}</td>
                        <td className="py-1.5 text-right whitespace-nowrap">
                          <Button
                            size="sm"
                            onClick={() => void saveType(type)}
                            data-testid={`edit-type-${type.id}`}
                          >
                            Edit
                          </Button>{' '}
                          {type.builtIn ? null : (
                            <Button
                              size="sm"
                              variant="danger"
                              onClick={() => void deleteType(type)}
                              data-testid={`delete-type-${type.id}`}
                            >
                              Delete
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {snapshot.unknownOwnership.length > 0 ? (
            <section
              aria-labelledby="types-unknown-title"
              className="flex flex-col gap-1.5 rounded-md border border-bad bg-bad-soft px-3 py-2"
              data-testid="types-unknown"
            >
              <h3 id="types-unknown-title" className="m-0 text-sm font-semibold">
                Words in the vehicle list the app doesn&apos;t know
              </h3>
              <p className="m-0 text-sm">
                These vans count as Branded Vans until you say what the word means.
              </p>
              <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
                {snapshot.unknownOwnership.map((entry) => (
                  <li key={entry.word} className="flex items-center gap-2 text-sm">
                    <code className="rounded border border-line bg-surface px-1.5">
                      {entry.word}
                    </code>
                    <span className="text-muted">
                      {entry.vans === 1 ? '1 van' : `${entry.vans} vans`}
                    </span>
                    <Button
                      size="sm"
                      onClick={() => void addWord(entry.word)}
                      data-testid={`add-word-${entry.word}`}
                    >
                      Add to a type...
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </details>

      <ButtonStrip label="Van type actions">
        <Button onClick={() => void setType(theChosen())} data-testid="set-type">
          Set Type...
        </Button>
        <Button onClick={() => void backToList(theChosen())} data-testid="back-to-list">
          Back to List&apos;s Type
        </Button>
        {picks.ids.size > 0 ? (
          <span className="text-sm text-muted" data-testid="types-picked-count">
            {picks.ids.size} picked.{' '}
            <button type="button" className="underline" onClick={picks.clear}>
              Clear the ticks
            </button>
          </span>
        ) : (
          <span className="text-sm text-muted">
            Tick vans in the first column to set several at once.
          </span>
        )}
      </ButtonStrip>
      <div className="min-h-0 flex-1">
        <DataGrid
          view="vehicle-types"
          label="Vans and their types"
          columns={columns}
          rows={views}
          getRowId={typeVanId}
          layoutStore={databaseLayoutStore}
          rowActions={rowActions}
          onRowActivate={activate}
          onSelectionChange={(view) => setCurrentId(view ? typeVanId(view) : null)}
          rowTone={rowTone}
          needsAttention={(view) => whyListed(view).tone === 'bad'}
          filter={filter}
          filterControls={
            <>
              <FilterSelect
                label="Type"
                value={shownChoice}
                options={options}
                onChange={setShown}
                testId="type-filter"
              />
              <FilterCheck
                label="Only vans set here or to look at"
                checked={flaggedOnly}
                onChange={setFlaggedOnly}
                testId="type-flagged-only"
              />
            </>
          }
          onResetFilters={() => {
            setShown(ALL_TYPES);
            setFlaggedOnly(false);
          }}
          empty={{
            title: 'No vehicles loaded',
            body: 'Import the fleet on the Vehicle Management tab. Each van shows here with its type.',
          }}
        />
      </div>
      {host}
    </>
  );
}

function driveText(view: VehicleView): string {
  if (view.handOnly) return 'Given by hand only';
  return view.rental ? 'LMR approved only' : 'Anyone qualified';
}
