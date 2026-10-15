// The Vehicle Types tab's windows: make or change a type (with where it lands in the Assign Vans
// order), pick a type for some vans, and delete a type.

import { DRIVE_LABELS, DRIVE_RULES, type DriveRule } from '@loadout/core';
import { useId, useMemo, useState } from 'react';
import type { VehicleTypeView } from '../../../shared/snapshot';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Modal } from '../dataPages/Modal';
import { NEW_TYPE, cleanWord, orderSteps, typesAfterSave, type TypeFields } from './typeRows';

// ------------------------------------------------------------ make or change

interface TypeDialogProps {
  types: readonly VehicleTypeView[];
  /** The type being changed, or null to make one. */
  editing: VehicleTypeView | null;
  /** Words in the vehicle list that no type knows yet, offered with one click. */
  suggestions: readonly string[];
  onDone: (fields: TypeFields | null) => void;
}

function startPlace(types: readonly VehicleTypeView[], editing: VehicleTypeView | null): number {
  const handedOut = types.filter((type) => type.drive !== 'hand' && type.id !== editing?.id);
  if (editing && editing.place !== null) return editing.place - 1;
  return handedOut.length + 1;
}

export function TypeDialog({ types, editing, suggestions, onDone }: TypeDialogProps) {
  const nameId = useId();
  const wordId = useId();
  const [name, setName] = useState(editing?.name ?? '');
  const [drive, setDrive] = useState<DriveRule>(editing?.drive ?? 'anyone');
  const [place, setPlace] = useState(() => startPlace(types, editing));
  const [words, setWords] = useState<string[]>(() => [...(editing?.words ?? [])]);
  const [draft, setDraft] = useState('');
  const [problem, setProblem] = useState('');

  const fields: TypeFields = { name: name.trim() || 'This type', drive, words, place };
  const others = types.filter((type) => type.id !== editing?.id && type.drive !== 'hand');
  const steps = useMemo(
    () => orderSteps(typesAfterSave(types, editing?.id ?? null, fields)),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the order follows what is typed
    [types, editing, name, drive, words, place],
  );
  const mine = editing?.id ?? NEW_TYPE;
  const offered = suggestions.filter((word) => !words.includes(word));

  function addWord(text: string) {
    const word = cleanWord(text);
    if (word && !words.includes(word)) setWords([...words, word]);
    setDraft('');
  }

  function save() {
    const clean = name.trim();
    if (!clean) {
      setProblem('Give the type a name.');
      return;
    }
    const clash = types.find(
      (type) => type.id !== editing?.id && type.name.toLowerCase() === clean.toLowerCase(),
    );
    if (clash) {
      setProblem(`There is already a type called ${clash.name}.`);
      return;
    }
    const pending = cleanWord(draft);
    const allWords = pending && !words.includes(pending) ? [...words, pending] : words;
    onDone({ name: clean, drive, words: allWords, place });
  }

  return (
    <Modal
      name="vehicle-type"
      title={editing ? `Change ${editing.name}` : 'Create an ownership type'}
      lead={
        editing
          ? 'Each change takes effect when you press Save.'
          : 'For vans that are none of the other types. You can change it later.'
      }
      confirmLabel={editing ? 'Save' : 'Create type'}
      confirmTestId="type-save"
      onConfirm={save}
      onCancel={() => onDone(null)}
      noValidate
      wide
    >
      <div className="flex flex-col gap-4 text-sm">
        <div className="flex flex-col gap-1">
          <label htmlFor={nameId} className="font-medium">
            Name
          </label>
          <Input
            id={nameId}
            value={name}
            maxLength={40}
            autoFocus
            onChange={(event) => setName(event.target.value)}
            data-testid="type-name"
          />
          <p className="hint m-0">What the app calls it on Vehicle Data and Load Out.</p>
          {problem ? (
            <p role="alert" className="problem m-0" data-testid="type-problem">
              {problem}
            </p>
          ) : null}
        </div>

        <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
          <legend className="mb-1 font-medium">Who may drive it</legend>
          {DRIVE_RULES.map((rule) => (
            <label key={rule} className="flex items-center gap-2">
              <input
                type="radio"
                name="type-drive"
                value={rule}
                checked={drive === rule}
                onChange={() => setDrive(rule)}
                data-testid={`type-drive-${rule}`}
              />
              {rule === 'hand' ? 'Nobody. I give it out by hand' : DRIVE_LABELS[rule]}
            </label>
          ))}
        </fieldset>

        {drive === 'hand' ? (
          <p className="hint m-0" data-testid="type-not-in-order">
            Assign Vans never hands out a van of this type, so it has no place in the order.
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            <span className="font-medium">Where it lands in the Assign Vans order</span>
            <ol className="m-0 flex list-none flex-col gap-1 p-0" data-testid="type-order">
              {steps.map((step) => {
                const isMine = step.id === mine;
                return (
                  <li
                    key={step.id || 'step'}
                    className={
                      isMine
                        ? 'flex items-center gap-2 rounded-md border border-ok bg-ok-soft px-2.5 py-1'
                        : 'flex items-center gap-2 rounded-md border border-line px-2.5 py-1'
                    }
                    data-mine={isMine ? 'true' : undefined}
                  >
                    <span className="w-5 font-semibold tabular-nums">{step.place}</span>
                    <span className="flex-1">
                      {isMine ? <strong>{name.trim() || 'This type'}</strong> : step.name}
                    </span>
                    {isMine ? (
                      <>
                        <Button
                          size="sm"
                          aria-label="Move earlier"
                          disabled={place <= 1}
                          onClick={() => setPlace(place - 1)}
                          data-testid="type-earlier"
                        >
                          ↑
                        </Button>
                        <Button
                          size="sm"
                          aria-label="Move later"
                          disabled={place > others.length}
                          onClick={() => setPlace(place + 1)}
                          data-testid="type-later"
                        >
                          ↓
                        </Button>
                      </>
                    ) : (
                      <span className="text-muted">{step.who}</span>
                    )}
                  </li>
                );
              })}
            </ol>
            <p className="hint m-0">
              When more than one van fits a driver equally well, the higher one goes out first. A
              driver&apos;s own van, last time&apos;s van and van priority still come before this.
            </p>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <label htmlFor={wordId} className="font-medium">
            Words in the vehicle list that mean this type
          </label>
          <div className="flex flex-wrap items-center gap-1.5" data-testid="type-words">
            {words.map((word) => (
              <span
                key={word}
                className="inline-flex items-center gap-1 rounded bg-accent-soft px-2 py-0.5 text-xs font-semibold"
              >
                {word}
                <button
                  type="button"
                  aria-label={`Remove ${word}`}
                  className="px-1"
                  onClick={() => setWords(words.filter((w) => w !== word))}
                >
                  ×
                </button>
              </span>
            ))}
            <Input
              id={wordId}
              value={draft}
              maxLength={60}
              placeholder="Add a word"
              className="w-40"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ',') {
                  event.preventDefault();
                  addWord(draft);
                }
              }}
              data-testid="type-word-input"
            />
          </div>
          {offered.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5 text-muted">
              In your vehicle list but not matched to a type yet:
              {offered.map((word) => (
                <Button
                  key={word}
                  size="sm"
                  onClick={() => addWord(word)}
                  data-testid={`type-suggest-${word}`}
                >
                  + {word}
                </Button>
              ))}
            </div>
          ) : null}
          <p className="hint m-0">
            A van whose Ownership Type says one of these becomes this type. A word belongs to one
            type, so adding it here takes it from any other. You can still set a single van by hand.
          </p>
        </div>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------ pick a type

interface PickTypeProps {
  title: string;
  lead: string;
  types: readonly VehicleTypeView[];
  initial: string;
  confirmLabel: string;
  onDone: (typeId: string | null) => void;
}

/** Choose one type from the list (never typed, so nothing can be misspelt). */
export function PickTypeDialog({
  title,
  lead,
  types,
  initial,
  confirmLabel,
  onDone,
}: PickTypeProps) {
  const [chosen, setChosen] = useState(initial || (types[0]?.id ?? ''));
  return (
    <Modal
      name="pick-type"
      title={title}
      lead={lead}
      confirmLabel={confirmLabel}
      confirmTestId="pick-type-ok"
      onConfirm={() => onDone(chosen)}
      onCancel={() => onDone(null)}
    >
      <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0 text-sm">
        <legend className="sr-only">Types</legend>
        {types.map((type) => (
          <label key={type.id} className="flex items-center gap-2">
            <input
              type="radio"
              name="pick-type"
              value={type.id}
              checked={chosen === type.id}
              onChange={() => setChosen(type.id)}
              data-testid={`pick-type-${type.id}`}
            />
            <span className="font-medium">{type.name}</span>
            <span className="text-muted">{DRIVE_LABELS[type.drive]}</span>
          </label>
        ))}
      </fieldset>
    </Modal>
  );
}

// ------------------------------------------------------------ delete

interface DeleteTypeProps {
  type: VehicleTypeView;
  types: readonly VehicleTypeView[];
  onDone: (moveTo: string | null) => void;
}

/** Delete a type somebody made, saying where its vans go so none is left without a type. */
export function DeleteTypeDialog({ type, types, onDone }: DeleteTypeProps) {
  const others = types.filter((t) => t.id !== type.id);
  const [moveTo, setMoveTo] = useState(others[0]?.id ?? '');
  const selectId = useId();
  return (
    <Modal
      name="delete-type"
      title={`Delete ${type.name}?`}
      lead={
        type.vans === 0
          ? 'No van is this type right now.'
          : `${type.vans === 1 ? '1 van is' : `${type.vans} vans are`} this type. They move to the type you pick, and so do its words from the vehicle list.`
      }
      confirmLabel="Delete type"
      confirmTestId="delete-type-ok"
      danger
      onConfirm={() => onDone(moveTo)}
      onCancel={() => onDone(null)}
    >
      <div className="flex flex-col gap-1 text-sm">
        <label htmlFor={selectId} className="font-medium">
          Move its vans to
        </label>
        <select
          id={selectId}
          value={moveTo}
          onChange={(event) => setMoveTo(event.target.value)}
          className="h-9 rounded-md border border-line-strong bg-surface px-2"
          data-testid="delete-type-move-to"
        >
          {others.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>
    </Modal>
  );
}
