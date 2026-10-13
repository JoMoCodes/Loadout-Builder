// The Route Sheets page: the open run, History, the choices, and sending. The PDF is read, matched
// and cut into pages in the main process; a page only sees words, counts and the email as HTML.
// The route sheet PDF comes in through files:pick / files:import / files:dropped with the kind
// 'route-sheets', so a page never names a place on the computer.
//
// The quiet commands change nothing saved. Copy for email, Open email draft and Copy + open mail
// app are marked as sent by the page with routeSheets:mark-sent once they worked (the page does
// the clipboard, so only it knows).

import type { Decision } from '@loadout/route-sheets';
import { arrayOf, boolean, filled, nothing, nullable, oneOf, optional, shape, text } from './check';
import { as, defineCommand, defineQuery } from './define';
import type {
  EmailRoutesResult,
  ExportAllResult,
  RouteSheetsDistributionView,
  RouteSheetsPreview,
  RouteSheetsRunListing,
  RouteSheetsStateView,
} from '../routeSheets';
import { SENT_HOWS } from '../routeSheets';

const routeCode = filled(16);
const runId = filled(80);
const decision = shape({
  recipients: optional(arrayOf(filled(20), 10)),
  skipped: optional(boolean),
  manual: optional(boolean),
  viaSuggestion: optional(boolean),
});
const one = shape({ routeCode });

export const routeSheetsChannels = [
  // ---- reading -------------------------------------------------------------------------

  /** The open run, History's list, which route data is in use, the driver list, email. */
  defineQuery('routeSheets:state', { input: nothing, result: as<RouteSheetsStateView>() }),
  /** Who gets each route sheet (the matcher's answer), and what Email all would send. */
  defineQuery('routeSheets:distribution', {
    input: nothing,
    result: as<RouteSheetsDistributionView>(),
  }),
  /** The email one driver gets for this route, as it will look. */
  defineQuery('routeSheets:preview', { input: one, result: as<RouteSheetsPreview>() }),
  /** Every saved run, newest day first. */
  defineQuery('routeSheets:runs', { input: nothing, result: as<RouteSheetsRunListing[]>() }),

  // ---- the run -------------------------------------------------------------------------

  /** Opens a saved run. */
  defineCommand('routeSheets:load-run', { input: shape({ id: runId }), result: as<null>() }),
  /** Starts a new run (nothing is saved until a route sheet PDF comes in). */
  defineCommand('routeSheets:new-run', { input: nothing, result: as<null>() }),
  /** Removes a saved run and its PDF. Asking first is the page's job. */
  defineCommand('routeSheets:delete-run', { input: shape({ id: runId }), result: as<null>() }),

  // ---- choices -----------------------------------------------------------------------------

  /** Chooses who gets a route's sheet, or Don't send; null undoes the choice (Change). */
  defineCommand('routeSheets:set-decision', {
    input: shape({ routeCode, decision: nullable(decision) }),
    result: as<null>(),
  }),
  /** Accept all suggestions. Answers how many were accepted. */
  defineCommand('routeSheets:accept-suggestions', { input: nothing, result: as<number>() }),
  /** Marks a route as sent (how), or not sent (null). */
  defineCommand('routeSheets:mark-sent', {
    input: shape({ routeCode, how: nullable(oneOf(SENT_HOWS)) }),
    result: as<null>(),
  }),
  /** The pad for a wave time the route data does not know; empty clears it. Answers the pad. */
  defineCommand('routeSheets:set-wave-pad', {
    input: shape({ waveTime: filled(20), pad: text(40) }),
    result: as<string | null>(),
  }),

  // ---- sending -------------------------------------------------------------------------------

  /** Emails one route sheet to its driver. Asking first when it was sent before is the page's job. */
  defineCommand('routeSheets:send-one', { input: one, result: as<EmailRoutesResult>() }),
  /** Emails every ready route sheet not sent yet, over one login. Asking first is the page's job. */
  defineCommand('routeSheets:email-all', { input: nothing, result: as<EmailRoutesResult>() }),
  /**
   * Export all: asks for a folder, then writes a folder of email drafts, PDFs and a summary in
   * it. Null when they closed the window.
   */
  defineCommand('routeSheets:export-all', {
    input: nothing,
    result: as<ExportAllResult | null>(),
    quiet: true,
  }),
  /** The email as HTML and text, for the page to put on the clipboard. */
  defineCommand('routeSheets:copy-email', {
    input: one,
    result: as<{ html: string; text: string; subject: string }>(),
    quiet: true,
  }),
  /** Writes the email draft (.eml, with the page attached) and opens it in the mail app. */
  defineCommand('routeSheets:open-draft', {
    input: one,
    result: as<{ opened: boolean }>(),
    quiet: true,
  }),
  /** Opens the mail app on a new email to the driver (the page copied the email first). */
  defineCommand('routeSheets:open-mail-app', {
    input: one,
    result: as<{ mailto: string; opened: boolean }>(),
    quiet: true,
  }),
  /** Asks where to save it, then saves this route's page(s) as a PDF. */
  defineCommand('routeSheets:save-pdf-page', {
    input: one,
    result: as<{ saved: boolean; fileName: string | null }>(),
    quiet: true,
  }),
  /** Opens this route's page(s) of the original PDF. */
  defineCommand('routeSheets:view-original-page', {
    input: one,
    result: as<{ opened: boolean }>(),
    quiet: true,
  }),
] as const;

export type { Decision };
