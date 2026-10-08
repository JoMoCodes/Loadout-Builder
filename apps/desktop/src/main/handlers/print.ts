// Handlers for the Print tab and the two fixed exports. The page sends a layout; the rules (who
// prints, in what order, how the page is laid out) are the core's, and the drawing is
// src/shared/print/sheet.ts. Files are only ever written where the person chose in the save window
// (or, for Preview, to one throwaway file in the computer's temporary folder).

import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  isRosterEmpty,
  printing,
  rosterDateLabel,
  sheetExport,
  shiftTypeCounts,
  type AppState,
} from '@loadout/core';
import type { printChannels } from '../../shared/channels/print';
import { vansSpec } from '../../shared/print/sheet';
import { ChannelRefusal } from '../channels';
import { writeExportFile, writePrintFile } from '../print/write';
import type { HandlersFor } from './types';

type PrintSpec = printing.PrintSpec;

// What Preview writes, in the temporary folder: always the same file, so previews do not pile up.
const PREVIEW_NAME = 'Loadout Builder preview.pdf';

// A saved layout is a few hundred characters; this is many times that and still small.
const MAX_LAYOUT_TEXT = 200_000;

/** Reads a layout from the page the way a saved one is read: whatever it cannot honour is dropped. */
export function readLayout(raw: Record<string, unknown>): PrintSpec {
  const text = JSON.stringify(raw);
  if (text.length > MAX_LAYOUT_TEXT) {
    throw new ChannelRefusal('refused', 'That layout is too big to keep. Take some columns off.');
  }
  return printing.specFromJson(text);
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Nothing to print: said the way the old Print tab said it. */
function guardRoster(state: AppState): void {
  if (isRosterEmpty(state.roster)) {
    throw new ChannelRefusal(
      'refused',
      'Import a load-out sheet on the Roster tab first - there is nothing to print.',
    );
  }
}

/** A name typed with no extension gets .pdf, as the old save window's default did. */
/**
 * The file to write: the name chosen, with ".pdf" added when it has no extension. The save
 * window only warned about the name as typed, so a ".pdf" file of that name that is already there
 * is refused rather than quietly written over.
 */
function withExtension(file: string): string {
  if (path.extname(file)) return file;
  const named = `${file}.pdf`;
  if (existsSync(named)) {
    throw new ChannelRefusal(
      'refused',
      `There is already a file called ${path.basename(named)} there. Choose the name again, ` +
        'with .pdf or .xlsx on the end, to write over it or to pick another name.',
    );
  }
  return named;
}

function refuseWith(error: unknown): never {
  if (error instanceof printing.PrintError || error instanceof sheetExport.ExportError) {
    throw new ChannelRefusal('refused', error.message);
  }
  throw error;
}

export const printHandlers: HandlersFor<typeof printChannels> = {
  'print:rows': (_input, ctx) => {
    const state = ctx.state;
    const shiftCounts = [...shiftTypeCounts(state.roster).entries()].sort((a, b) =>
      compareText(a[0].toLowerCase(), b[0].toLowerCase()),
    );
    return {
      rows: state.printRows(ctx.today()),
      dateLabel: rosterDateLabel(state.roster),
      rosterEmpty: isRosterEmpty(state.roster),
      shiftCounts,
      carryingDwp: sheetExport.carryingDwp(state.roster),
      dwpLoaded: state.dwp.rows.length > 0,
    };
  },

  'print:set-spec': ({ spec }, ctx) => {
    const layout = readLayout(spec);
    ctx.state.setPrintSpec(layout);
    return layout;
  },

  'print:save-preset': ({ name, spec }, ctx) => {
    if (!name.trim()) {
      throw new ChannelRefusal('refused', 'Give the layout a name first.');
    }
    ctx.state.savePrintPreset(name.trim(), readLayout(spec));
    return ctx.state.printPresets();
  },

  'print:load-preset': ({ name }, ctx) => {
    const layout = ctx.state.printPreset(name);
    if (layout === null) {
      throw new ChannelRefusal('refused', 'That saved layout is not there any more.');
    }
    ctx.state.setPrintSpec(layout);
    return layout;
  },

  'print:delete-preset': ({ name }, ctx) => {
    ctx.state.deletePrintPreset(name);
    return ctx.state.printPresets();
  },

  'print:reset': (_input, ctx) => {
    const layout = printing.defaultSpec();
    ctx.state.setPrintSpec(layout);
    return layout;
  },

  'print:print': async ({ spec, vans, openAfter }, ctx) => {
    const state = ctx.state;
    guardRoster(state);
    const tab = readLayout(spec);
    // Print Vans is the tab's own page and people, cut down to who and which van.
    const layout = vans ? vansSpec(tab) : tab;
    const dateLabel = rosterDateLabel(state.roster);
    const chosen = await ctx.services.chooseSaveFile({
      title: vans ? 'Print vans' : 'Print page',
      defaultName: printing.defaultFilename(layout, dateLabel),
      nearFile: state.roster.sourceFile,
      startIn: 'data',
    });
    if (chosen === null) return { status: 'cancelled' };
    const file = withExtension(chosen);
    const rows = state.printRows(ctx.today());
    let written: { drivers: number; pages: number };
    try {
      written = await writePrintFile(file, rows, layout, dateLabel);
    } catch (error) {
      refuseWith(error);
    }
    const openFailed = openAfter ? !(await ctx.services.openFile(file)) : false;
    return {
      status: 'written',
      fileName: path.basename(file),
      drivers: written.drivers,
      pages: written.pages,
      leftOff: rows.length - written.drivers,
      openFailed,
    };
  },

  'print:preview': async ({ spec }, ctx) => {
    const state = ctx.state;
    guardRoster(state);
    const file = path.join(ctx.services.tempFolder(), PREVIEW_NAME);
    let written: { drivers: number; pages: number };
    try {
      written = await writePrintFile(
        file,
        state.printRows(ctx.today()),
        readLayout(spec),
        rosterDateLabel(state.roster),
      );
    } catch (error) {
      refuseWith(error);
    }
    const openFailed = !(await ctx.services.openFile(file));
    return { ...written, openFailed };
  },

  'print:export': async ({ withDwp }, ctx) => {
    const state = ctx.state;
    const carrying = sheetExport.carryingDwp(state.roster);
    if (withDwp) {
      // Said in words by the page; only the reason travels.
      if (isRosterEmpty(state.roster)) return { status: 'nothing', reason: 'no-roster' };
      if (!carrying) {
        return {
          status: 'nothing',
          reason: state.dwp.rows.length > 0 ? 'no-dwp-on-roster' : 'no-dwp-sheet',
        };
      }
    }
    const chosen = await ctx.services.chooseSaveFile({
      title: withDwp ? 'Export with DWP' : 'Export roster',
      defaultName: sheetExport.defaultFilename(state.roster, withDwp),
      nearFile: state.roster.sourceFile,
      startIn: 'schedule-data',
    });
    if (chosen === null) return { status: 'cancelled' };
    const file = withExtension(chosen);
    let drivers: number;
    try {
      drivers = await writeExportFile(file, state.roster, withDwp);
    } catch (error) {
      refuseWith(error);
    }
    return {
      status: 'written',
      fileName: path.basename(file),
      drivers,
      carryingDwp: withDwp ? carrying : 0,
    };
  },
};
