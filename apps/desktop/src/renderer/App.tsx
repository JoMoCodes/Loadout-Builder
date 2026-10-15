import { notesBetween } from '@loadout/core';
import { FlaskConical } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DataSourceInfo } from '../shared/shell';
import { DEFAULT_SETTINGS, mergeSettings, stepFontScale } from '../shared/settings';
import type { AppSettings, SettingsPatch } from '../shared/settings';
import { parseWindowTarget, windowTitle } from '../shared/windows';
import type { WindowTarget } from '../shared/windows';
import { HelpMenu } from './help/HelpMenu';
import { PRINTED_EVENT } from './help/printed';
import { useTours } from './help/useTours';
import { useWeeklyMemory } from './help/weeklyMemory';
import { call, explain, listen, signal } from './lib/channels';
import { PAGES, rememberedPlace } from './pages';
import type { HelpApi, PageId, PageRequest } from './pages/types';
import { useNoStrayDrops } from './components/FileDrop';
import { Nav } from './shell/Nav';
import { TopBar } from './shell/TopBar';
import { OldDataDialog } from './shell/OldDataDialog';
import { WhatsNewDialog } from './shell/WhatsNewDialog';
import { applyLook, cacheLook, readLastPage, writeLastPage } from './shell/display';
import { Button } from './ui/button';

/**
 * What this window was opened on, from its address. The main window has nothing there. A
 * page-only window ("Open in new window") carries its page and tab, and shows that page alone:
 * no left menu, no start-up questions, no tours by themselves.
 */
function readWindowTarget(): WindowTarget | null {
  try {
    return parseWindowTarget(window.location.search);
  } catch {
    return null;
  }
}

export function App() {
  const [target] = useState(readWindowTarget);
  const ownWindow = target !== null;
  const [version, setVersion] = useState<string | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [dataSource, setDataSource] = useState<DataSourceInfo | null>(null);
  // The main window opens on the page it was on last time. A remembered name from before a page
  // was renamed, or folded into another page's tab, opens the new place, tab and all.
  const [remembered] = useState(() => (target ? null : rememberedPlace(readLastPage())));
  const [page, setPage] = useState<PageId>(() => (target ? target.page : remembered!.page));
  const [startTab, setStartTab] = useState<string | null>(
    () => target?.tab ?? remembered?.tab ?? null,
  );
  const [showNews, setShowNews] = useState(false);
  // The "bring over your old data" window, asked at start-up on a first run. `oldDataChecked`
  // stays false until the start-up look is done, so a page tour does not start underneath it.
  const [oldData, setOldData] = useState<'start' | null>(null);
  const [oldDataChecked, setOldDataChecked] = useState(false);
  // The same question for the old Weekly Performance App's data. There is no setting that
  // remembers it was asked, so it is asked once per run while this app has no weekly data.
  const [perfOldData, setPerfOldData] = useState(false);
  const [perfOldDataChecked, setPerfOldDataChecked] = useState(false);
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

        // The start-up questions are the main window's: a page-only window never asks them.
        if (ownWindow) {
          setOldDataChecked(true);
          setPerfOldDataChecked(true);
          console.log(`Loadout Builder page is ready, version ${foundVersion}`);
          signal('app:renderer-ready', foundVersion);
          return;
        }

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

        // The same once-only offer for the old Weekly Performance App's data.
        if (foundSettings.perfOldDataAsked || foundSettings.demoMode) {
          setPerfOldDataChecked(true);
        } else {
          void call('performance:old-data-find').then((found) => {
            if (cancelled) return;
            const it = found.ok ? found.value : null;
            if (it && it.found && it.empty && !it.demo) setPerfOldData(true);
            setPerfOldDataChecked(true);
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
  }, [ownWindow]);

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

  // A setting changed in this window or another one (text size, colours, demo mode): every
  // window shows it.
  useEffect(
    () =>
      listen('settings:changed', (next) => {
        setSettings(next);
        applyLook(next);
        cacheLook(next);
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
      const next = mergeSettings(now ?? DEFAULT_SETTINGS, patch);
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

  const goTo = useCallback(
    (pageId: PageId) => {
      // A page-only window shows its one page: another page opens in the main window.
      if (ownWindow) {
        void call('app:show-page', { page: pageId });
        return;
      }
      setPage(pageId);
      // The remembered tab was for the page the window opened on; the next page picks its own.
      setStartTab(null);
      writeLastPage(pageId);
    },
    [ownWindow],
  );

  // A page-only window asked for a page: the main window shows it.
  useEffect(() => {
    if (ownWindow) return;
    return listen('app:go-to', ({ page: pageId }) => goTo(pageId));
  }, [ownWindow, goTo]);

  // A page-only window's title says what it shows: "Load Out · Available Vans". The tab part
  // follows the open tab, which the page marks on its tab buttons.
  useEffect(() => {
    if (!target) return;
    const frame = document.getElementById('page-frame');
    if (!frame) return;
    const read = () => {
      const tab = frame.querySelector('[role="tab"][aria-selected="true"][data-tab-button]');
      const id = tab?.getAttribute('data-tab-button') ?? undefined;
      document.title = windowTitle(id ? { page: target.page, tab: id } : { page: target.page });
    };
    read();
    const watch = new MutationObserver(read);
    watch.observe(frame, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['aria-selected'],
    });
    return () => watch.disconnect();
  }, [target]);

  // Ctrl+O (Import Sheet) and Ctrl+I (Import Associate Data) work from every page: they go to
  // the page that does it and run it there. Not while a question is open: it would be pushed
  // aside and never answered. In a page-only window they work only on the page that does it.
  useEffect(() => {
    let next = 0;
    function onKey(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
      const key = event.key.toLowerCase();
      const action = key === 'o' ? 'import-sheet' : key === 'i' ? 'import-associates' : null;
      if (!action) return;
      event.preventDefault();
      if (document.querySelector('dialog[open]')) return;
      const wanted: PageId = action === 'import-sheet' ? 'load-out' : 'associates';
      if (ownWindow && target.page !== wanted) return;
      next += 1;
      goTo(wanted);
      setRequest({ id: next, action });
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goTo, ownWindow, target]);

  const closeNews = useCallback(() => {
    setShowNews(false);
    if (version) void call('settings:set', { lastSeenVersion: version });
  }, [version]);

  const closeOldData = useCallback(() => {
    // Asked once at start-up: Not now, Esc and Yes all count as answered.
    void changeSettings({ oldDataAsked: true });
    setOldData(null);
  }, [changeSettings]);
  const closePerfOldData = useCallback(() => {
    // Asked once: Yes, Not now and Esc all count as answered.
    void changeSettings({ perfOldDataAsked: true });
    setPerfOldData(false);
  }, [changeSettings]);

  const current = settings ?? DEFAULT_SETTINGS;
  const entry = PAGES.find((candidate) => candidate.id === page) ?? PAGES[0]!;
  const Page = entry.component;
  const demo = current.demoMode;

  const tours = useTours({
    page,
    settings,
    changeSettings,
    // A page-only window never starts a tour by itself (Help > Take the tour still works).
    blocked:
      ownWindow ||
      showNews ||
      oldData !== null ||
      !oldDataChecked ||
      perfOldData ||
      !perfOldDataChecked,
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
  const weekly = useWeeklyMemory({ settings, changeSettings, page });
  const { setHidden: setWeeklyHidden } = weekly;

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
      weeklyShown: !weekly.hidden,
      dashboardSeen: weekly.dashboardSeen,
      showWeekly: () => setWeeklyHidden(false),
      hideWeekly: () => setWeeklyHidden(true),
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
      weekly.hidden,
      weekly.dashboardSeen,
      setWeeklyHidden,
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
    <div
      className="shell"
      data-shell
      data-ready={settings && version ? 'true' : 'false'}
      data-own-window={ownWindow ? 'true' : undefined}
    >
      {ownWindow ? null : <Nav current={page} onGo={goTo} />}
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
              goTo('how-to-use');
            }}
            weeklyShown={help.weeklyShown}
            onShowWeekly={() => {
              help.showWeekly();
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
            request={request}
            takeRequest={takeRequest}
            ownWindow={ownWindow}
            startTab={startTab}
          />
        </main>
      </div>
      {oldData ? <OldDataDialog how={oldData} onClose={closeOldData} /> : null}
      {perfOldData && oldDataChecked && !oldData ? (
        <OldDataDialog how="start" about="performance" onClose={closePerfOldData} />
      ) : null}
      {showNews && version && settings?.lastSeenVersion && !oldData && !perfOldData ? (
        <WhatsNewDialog
          notes={notesBetween(settings.lastSeenVersion, version)}
          onClose={closeNews}
        />
      ) : null}
    </div>
  );
}
