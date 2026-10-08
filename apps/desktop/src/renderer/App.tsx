import { notesBetween } from '@loadout/core';
import { FlaskConical } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DataSourceInfo } from '../shared/shell';
import { DEFAULT_SETTINGS, sanitizePatch, stepFontScale } from '../shared/settings';
import type { AppSettings, SettingsPatch } from '../shared/settings';
import { HelpMenu } from './help/HelpMenu';
import { PRINTED_EVENT } from './help/printed';
import { useTours } from './help/useTours';
import { call, explain, listen, signal } from './lib/channels';
import { PAGES, pageIdFrom } from './pages';
import type { HelpApi, PageId, PageRequest } from './pages/types';
import { useNoStrayDrops } from './components/FileDrop';
import { Nav } from './shell/Nav';
import { TopBar } from './shell/TopBar';
import { OldDataDialog } from './shell/OldDataDialog';
import { WhatsNewDialog } from './shell/WhatsNewDialog';
import { applyLook, cacheLook, readLastPage, writeLastPage } from './shell/display';
import { Button } from './ui/button';

export function App() {
  const [version, setVersion] = useState<string | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [dataSource, setDataSource] = useState<DataSourceInfo | null>(null);
  const [page, setPage] = useState<PageId>(() => pageIdFrom(readLastPage()));
  const [showNews, setShowNews] = useState(false);
  // The "bring over your old data" window: asked at start-up on a first run, or opened from
  // Settings. `oldDataChecked` stays false until the start-up look is done, so a page tour does
  // not start underneath it.
  const [oldData, setOldData] = useState<'start' | 'settings' | null>(null);
  const [oldDataChecked, setOldDataChecked] = useState(false);
  // In demo mode nothing is kept, so what the checklist sees there lasts for this run only.
  const [demoPrinted, setDemoPrinted] = useState(false);
  const [demoChecklistHidden, setDemoChecklistHidden] = useState(false);
  const [request, setRequest] = useState<PageRequest | null>(null);
  const takeRequest = useCallback(() => setRequest(null), []);

  // A file dropped where nothing takes one does nothing (it would replace the app).
  useNoStrayDrops();

  // Start-up: ask the main process for what the shell needs, then say the page is ready.
  useEffect(() => {
    if (!window.loadout) return;
    let cancelled = false;
    Promise.all([call('app:get-version'), call('settings:get'), call('data:get-source-info')])
      .then(([versionReply, settingsReply, dataReply]) => {
        if (cancelled) return;
        if (!versionReply.ok || !settingsReply.ok || !dataReply.ok) {
          console.log('Loadout Builder page could not read its settings');
          return;
        }
        const foundVersion = versionReply.value;
        const foundSettings = settingsReply.value;
        setVersion(foundVersion);
        setSettings(foundSettings);
        setDataSource(dataReply.value);
        applyLook(foundSettings);
        cacheLook(foundSettings);

        // A first run has nothing to show yet; after an update, show what changed once.
        if (foundSettings.lastSeenVersion === null) {
          void call('settings:set', { lastSeenVersion: foundVersion });
        } else if (notesBetween(foundSettings.lastSeenVersion, foundVersion).length > 0) {
          setShowNews(true);
        } else if (foundSettings.lastSeenVersion !== foundVersion) {
          void call('settings:set', { lastSeenVersion: foundVersion });
        }

        // On a first run with nothing saved, offer to bring over the old app's data (once).
        if (foundSettings.oldDataAsked || foundSettings.demoMode) {
          setOldDataChecked(true);
        } else {
          void call('migration:find').then((found) => {
            if (cancelled) return;
            if (found.ok && found.value && found.value.found && found.value.empty) {
              setOldData('start');
            }
            setOldDataChecked(true);
          });
        }

        console.log(`Loadout Builder page is ready, version ${foundVersion}`);
        signal('app:renderer-ready', foundVersion);
      })
      .catch(() => {
        if (!cancelled) console.log('Loadout Builder page could not read its settings');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // The counts on Home come from the saved data, so read them again whenever it changes.
  useEffect(
    () =>
      listen('state:changed', () => {
        void call('data:get-source-info').then((reply) => {
          if (reply.ok) setDataSource(reply.value);
        });
      }),
    [],
  );

  const changeSettings = useCallback(async (patch: SettingsPatch) => {
    if (!window.loadout) return;
    // Demo mode on or off: a fresh demo run starts the checklist again.
    if (patch.demoMode !== undefined) {
      setDemoPrinted(false);
      setDemoChecklistHidden(false);
    }
    // Show the change straight away, then let the main process save it and confirm.
    setSettings((now) => {
      const next = { ...(now ?? DEFAULT_SETTINGS), ...sanitizePatch(patch) };
      applyLook(next);
      return next;
    });
    const reply = await call('settings:set', patch);
    if (!reply.ok) return;
    setSettings(reply.value);
    applyLook(reply.value);
    cacheLook(reply.value);
    if (patch.demoMode !== undefined) {
      const info = await call('data:get-source-info');
      if (info.ok) setDataSource(info.value);
    }
  }, []);

  const goTo = useCallback((pageId: PageId) => {
    setPage(pageId);
    writeLastPage(pageId);
  }, []);

  // Ctrl+O (Import Sheet) and Ctrl+I (Import Associate Data) work from every page: they go to
  // the page that does it and run it there. Not while a question is open: it would be pushed
  // aside and never answered.
  useEffect(() => {
    let next = 0;
    function onKey(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
      const key = event.key.toLowerCase();
      const action = key === 'o' ? 'import-sheet' : key === 'i' ? 'import-associates' : null;
      if (!action) return;
      event.preventDefault();
      if (document.querySelector('dialog[open]')) return;
      next += 1;
      goTo(action === 'import-sheet' ? 'load-out' : 'associates');
      setRequest({ id: next, action });
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goTo]);

  const closeNews = useCallback(() => {
    setShowNews(false);
    if (version) void call('settings:set', { lastSeenVersion: version });
  }, [version]);

  const closeOldData = useCallback(() => {
    // Asked once at start-up: Not now, Esc and Yes all count as answered. Settings can redo it.
    if (oldData === 'start') void changeSettings({ oldDataAsked: true });
    setOldData(null);
  }, [oldData, changeSettings]);
  const openOldData = useCallback(() => setOldData('settings'), []);

  const current = settings ?? DEFAULT_SETTINGS;
  const entry = PAGES.find((candidate) => candidate.id === page) ?? PAGES[0]!;
  const Page = entry.component;
  const demo = current.demoMode;

  const tours = useTours({
    page,
    settings,
    changeSettings,
    blocked: showNews || oldData !== null || !oldDataChecked,
  });
  const { takeTour, skipNextAutoTour } = tours;

  // A roster was printed or saved: the last step of the first-day checklist.
  useEffect(() => {
    const onPrinted = () => {
      if (demo) setDemoPrinted(true);
      else if (settings && !settings.printedOnce) void changeSettings({ printedOnce: true });
    };
    window.addEventListener(PRINTED_EVENT, onPrinted);
    return () => window.removeEventListener(PRINTED_EVENT, onPrinted);
  }, [demo, settings, changeSettings]);

  const checklistShown = demo ? !demoChecklistHidden : !current.checklistHidden;

  const help = useMemo<HelpApi>(
    () => ({
      takeTour,
      skipNextAutoTour,
      printed: demo ? demoPrinted : current.printedOnce,
      checklistShown,
      showChecklist: () => {
        if (demo) setDemoChecklistHidden(false);
        void changeSettings({ checklistHidden: false });
      },
      hideChecklist: () => {
        if (demo) setDemoChecklistHidden(true);
        else void changeSettings({ checklistHidden: true });
      },
      openLink: async (url: string) => {
        const reply = await call('app:open-link', url);
        return reply.ok ? null : explain(reply);
      },
    }),
    [
      takeTour,
      skipNextAutoTour,
      demo,
      demoPrinted,
      current.printedOnce,
      checklistShown,
      changeSettings,
    ],
  );

  const askAQuestion = useCallback(() => {
    goTo('how-to-use');
    // The question part of How to use says what (not) to post before it links to the forum.
    window.setTimeout(
      () => document.getElementById('help-stuck')?.scrollIntoView({ block: 'start' }),
      50,
    );
  }, [goTo]);

  return (
    <div className="shell" data-shell data-ready={settings && version ? 'true' : 'false'}>
      <Nav current={page} onGo={goTo} />
      <div className="main-column">
        <TopBar
          fontScale={current.fontScale}
          onSmaller={() => void changeSettings({ fontScale: stepFontScale(current.fontScale, -1) })}
          onBigger={() => void changeSettings({ fontScale: stepFontScale(current.fontScale, 1) })}
          onReset={() => void changeSettings({ fontScale: DEFAULT_SETTINGS.fontScale })}
        >
          <HelpMenu
            tourName={tours.tourName}
            onTour={() => tours.takeTour()}
            onHowToUse={() => goTo('how-to-use')}
            checklistShown={checklistShown}
            onShowChecklist={() => {
              help.showChecklist();
              goTo('home');
            }}
            onAsk={askAQuestion}
          />
        </TopBar>
        {current.demoMode ? (
          <div className="demo-banner" role="status" data-testid="demo-banner">
            <FlaskConical aria-hidden="true" className="size-[1.1em]" />
            <span>Demo mode is on. You are looking at made-up drivers and vans.</span>
            <Button size="sm" onClick={() => void changeSettings({ demoMode: false })}>
              Turn off demo mode
            </Button>
          </div>
        ) : null}
        <main className="page-frame" id="page-frame">
          <Page
            version={version ?? ''}
            settings={current}
            changeSettings={changeSettings}
            dataSource={dataSource}
            goTo={goTo}
            help={help}
            openOldData={openOldData}
            request={request}
            takeRequest={takeRequest}
          />
        </main>
      </div>
      {oldData ? <OldDataDialog how={oldData} onClose={closeOldData} /> : null}
      {showNews && version && settings?.lastSeenVersion && !oldData ? (
        <WhatsNewDialog
          notes={notesBetween(settings.lastSeenVersion, version)}
          onClose={closeNews}
        />
      ) : null}
    </div>
  );
}
