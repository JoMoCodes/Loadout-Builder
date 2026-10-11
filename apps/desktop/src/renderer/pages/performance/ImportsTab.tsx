// The Imports tab: one card per kind of weekly export, with the folder the app remembers for it,
// when it was last brought in and which weeks are missing. Files or folders can be dropped on a
// card, or anywhere on the tab (the app then sorts them by name). Sync now brings in whatever is
// new in every remembered folder. Ported from the old app's import menu and auto-import.

import { FolderOpen, RefreshCw, TriangleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { PerfImportCard, PerfImportSummary, PerfKind } from '../../../shared/performance';
import { PERF_KINDS, PERF_KIND_WORDS, SINGLE_FILE_KINDS } from '../../../shared/performance';
import type { AppSnapshot } from '../../../shared/snapshot';
import type { AppSettings, SettingsPatch } from '../../../shared/settings';
import { call, explain } from '../../lib/channels';
import { Button } from '../../ui/button';
import { ConfirmDialog } from '../dataPages/Modal';
import type { Messages } from '../dataPages/PageParts';
import { useDialogs } from '../dataPages/useDialogs';
import { PerfDrop, type DroppedToken } from './PerfDrop';
import { importWords, missingWeeksWords, syncWords, whenWords } from './perfText';

interface Result {
  lines: string[];
  problems: string[];
}

const hasData = (card: PerfImportCard | undefined) =>
  !!card && (card.lastImportAt !== null || card.newestWeek !== null);

type Job = { kind: PerfKind; how: 'choose' } | { kind: PerfKind; how: 'again'; token?: string };

export function ImportsTab({
  snapshot,
  settings,
  changeSettings,
  messages,
}: {
  snapshot: AppSnapshot;
  settings: AppSettings;
  changeSettings(patch: SettingsPatch): Promise<void>;
  messages: Messages;
}) {
  const { setStatus, setProblem } = messages;
  const { ask, host } = useDialogs();
  const [cards, setCards] = useState<PerfImportCard[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    let off = false;
    void call('performance:import-cards').then((reply) => {
      if (off) return;
      if (reply.ok) setCards(reply.value ?? []);
      else setProblem({ title: 'The import cards could not be read', message: explain(reply) });
    });
    return () => {
      off = true;
    };
  }, [snapshot.revision, setProblem]);

  const cardOf = (kind: PerfKind) => cards.find((card) => card.kind === kind);

  async function askFirst(kinds: readonly PerfKind[]): Promise<boolean> {
    if (!kinds.some((kind) => hasData(cardOf(kind)))) return true;
    const yes = await ask<boolean>((done) => (
      <ConfirmDialog
        title="Bring these in again?"
        body="This replaces the weeks already brought in from these files. Go ahead?"
        confirmLabel="Yes, bring them in"
        cancelLabel="No, keep what I have"
        onDone={done}
      />
    ));
    return yes === true;
  }

  async function run(jobs: readonly Job[]) {
    if (busy || jobs.length === 0) return;
    if (!(await askFirst(jobs.map((job) => job.kind)))) return;
    setBusy(true);
    setResult(null);
    messages.clearProblem();
    setStatus('Bringing in the files...');
    const summaries: PerfImportSummary[] = [];
    const failures: string[] = [];
    try {
      for (const job of jobs) {
        const reply =
          job.how === 'choose'
            ? await call('performance:choose-and-import', { kind: job.kind })
            : await call('performance:import', { kind: job.kind, token: job.token });
        if (!reply.ok) {
          failures.push(`${PERF_KIND_WORDS[job.kind].title}: ${explain(reply)}`);
          continue;
        }
        if (reply.value) summaries.push(reply.value);
      }
    } finally {
      setBusy(false);
    }
    if (summaries.length === 0 && failures.length === 0) {
      setStatus('');
      return;
    }
    const many = jobs.length > 1;
    const lines = summaries.map((summary) =>
      many
        ? `${PERF_KIND_WORDS[summary.kind].title}: ${importWords(summary)}`
        : importWords(summary),
    );
    const problems = [
      ...failures,
      ...summaries.flatMap((summary) =>
        summary.problems.map((problem) =>
          many ? `${PERF_KIND_WORDS[summary.kind].title}: ${problem}` : problem,
        ),
      ),
    ];
    setResult({ lines, problems });
    setStatus(
      failures.length > 0
        ? 'Some files did not come in.'
        : problems.length > 0
          ? 'Brought in, with some problems.'
          : 'Brought in.',
    );
  }

  async function dropped(tokens: DroppedToken[]) {
    if (tokens.length === 0) {
      setStatus('');
      setProblem({
        title: 'Nothing to bring in',
        message:
          'None of those files looked like a weekly export. Check the file names, or drop them on the card they belong to.',
      });
      return;
    }
    await run(tokens.map((one) => ({ kind: one.kind, how: 'again', token: one.token })));
  }

  async function syncNow() {
    if (busy) return;
    setBusy(true);
    setResult(null);
    messages.clearProblem();
    setStatus('Looking for new files...');
    try {
      const reply = await call('performance:sync-now');
      if (!reply.ok) {
        setStatus('');
        setProblem({ title: 'Sync did not finish', message: explain(reply) });
        return;
      }
      if (!reply.value) {
        setStatus('');
        return;
      }
      setResult({ lines: [syncWords(reply.value)], problems: reply.value.problems });
      setStatus(syncWords(reply.value));
    } finally {
      setBusy(false);
    }
  }

  async function forget(kind: PerfKind) {
    const reply = await call('performance:forget-folder', { kind });
    if (!reply.ok) {
      setProblem({ title: 'The folder was not forgotten', message: explain(reply) });
      return;
    }
    setStatus(`The app no longer looks for ${PERF_KIND_WORDS[kind].the} there.`);
  }

  const lastSync = snapshot.performance.lastSync;

  return (
    <PerfDrop
      kind={null}
      disabled={busy}
      onDropped={(tokens) => void dropped(tokens)}
      onProblem={(words) =>
        setProblem({ title: 'Those files were not brought in', message: words })
      }
      className="flex min-h-0 flex-1 flex-col"
    >
      <div className="min-h-0 flex-1 overflow-auto px-6 py-4" data-testid="perf-imports">
        <section className="card mb-4" aria-labelledby="perf-sync-title">
          <div className="flex flex-wrap items-center gap-4">
            <h2 id="perf-sync-title" className="m-0 text-[1.15rem] font-semibold">
              Bring in the weekly exports
            </h2>
            <Button
              variant="primary"
              onClick={() => void syncNow()}
              disabled={busy}
              data-testid="perf-sync-now"
            >
              <RefreshCw aria-hidden="true" />
              Sync now
            </Button>
            <label className="switch-row text-sm">
              <input
                type="checkbox"
                role="switch"
                className="switch"
                checked={settings.performance.autoImportOnStartup}
                onChange={(event) =>
                  void changeSettings({
                    performance: { autoImportOnStartup: event.target.checked },
                  })
                }
                data-testid="perf-auto-import"
              />
              Bring in new files each time the app opens
            </label>
          </div>
          <p className="m-0 mt-2 text-sm text-muted" data-testid="perf-last-sync">
            {lastSync
              ? `Last looked ${whenWords(lastSync.at)}: ${syncWords(lastSync)}`
              : 'The app has not looked for new files yet.'}
          </p>
          <p className="m-0 mt-1 text-sm text-muted">
            Choose a folder for each kind of export once. After that, Sync now brings in whatever is
            new. You can also drop files or a whole folder anywhere on this tab.
          </p>
          {result ? (
            <div
              className="mt-3 rounded-md border border-line bg-sunken px-3 py-2"
              data-testid="perf-import-result"
            >
              {result.lines.map((line) => (
                <p key={line} className="m-0 text-sm">
                  {line}
                </p>
              ))}
              {result.problems.length > 0 ? (
                <ul
                  className="m-0 mt-1 list-disc pl-5 text-sm text-warn"
                  data-testid="perf-import-problems"
                >
                  {result.problems.map((problem) => (
                    <li key={problem}>{problem}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </section>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {PERF_KINDS.map((kind) => {
            const card = cardOf(kind);
            const words = PERF_KIND_WORDS[kind];
            const single = SINGLE_FILE_KINDS.includes(kind);
            const missing = card ? missingWeeksWords(kind, card.missingWeeks) : '';
            return (
              <PerfDrop
                key={kind}
                kind={kind}
                disabled={busy}
                onDropped={(tokens) => void dropped(tokens)}
                onProblem={(text) =>
                  setProblem({ title: 'Those files were not brought in', message: text })
                }
              >
                <article
                  className="card flex h-full flex-col gap-1"
                  aria-labelledby={`perf-card-${kind}`}
                  data-testid={`perf-card-${kind}`}
                >
                  <h3 id={`perf-card-${kind}`} className="m-0 text-base font-semibold">
                    {words.title}
                  </h3>
                  <p className="m-0 text-sm text-muted">{words.whereFrom}</p>
                  <p
                    className="m-0 flex items-center gap-1.5 text-sm"
                    data-testid="perf-card-folder"
                  >
                    <FolderOpen aria-hidden="true" className="size-[1.05em] shrink-0 text-muted" />
                    {card?.folderName
                      ? `${single ? 'File' : 'Folder'}: ${card.folderName}`
                      : single
                        ? 'No file chosen yet'
                        : 'No folder chosen yet'}
                  </p>
                  {card?.folderMissing ? (
                    <p
                      className="m-0 flex items-start gap-1.5 text-sm text-warn"
                      data-testid="perf-card-missing-folder"
                    >
                      <TriangleAlert aria-hidden="true" className="mt-0.5 size-[1.05em] shrink-0" />
                      {single ? 'That file' : 'That folder'} is not there now. If it is on a USB
                      stick, plug it in. Or choose it again.
                    </p>
                  ) : null}
                  <p className="m-0 text-sm text-muted" data-testid="perf-card-last">
                    {card?.lastImportAt
                      ? `Last brought in ${whenWords(card.lastImportAt)}`
                      : 'Not brought in yet'}
                    {card?.newestWeek ? `. Newest week: ${card.newestWeek}.` : ''}
                  </p>
                  {missing ? (
                    <p
                      className="m-0 flex items-start gap-1.5 text-sm text-warn"
                      data-testid="perf-card-missing-weeks"
                    >
                      <TriangleAlert aria-hidden="true" className="mt-0.5 size-[1.05em] shrink-0" />
                      {missing}
                    </p>
                  ) : null}
                  <div className="mt-auto flex flex-wrap gap-1.5 pt-2">
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() => void run([{ kind, how: 'choose' }])}
                      data-testid={`perf-choose-${kind}`}
                    >
                      {single ? 'Choose file…' : 'Choose folder…'}
                    </Button>
                    <Button
                      size="sm"
                      disabled={busy || !card?.folderName}
                      onClick={() => void run([{ kind, how: 'again' }])}
                      data-testid={`perf-again-${kind}`}
                    >
                      Bring in again
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy || !card?.folderName}
                      onClick={() => void forget(kind)}
                      data-testid={`perf-forget-${kind}`}
                    >
                      {single ? 'Forget file' : 'Forget folder'}
                    </Button>
                  </div>
                </article>
              </PerfDrop>
            );
          })}
        </div>
      </div>
      {host}
    </PerfDrop>
  );
}
