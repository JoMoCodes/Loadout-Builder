import type { routeSheetsChannels } from '../../shared/channels/routeSheets';
import type { HandlersFor } from './types';

// Handlers for the Route Sheets page. One per channel declared in shared/channels/routeSheets.ts.
// Each one calls the route sheets of the open saved data (main/routeSheets/host.ts); the rules
// live in @loadout/route-sheets. The route sheet PDF comes in through files:import.

export const routeSheetsHandlers: HandlersFor<typeof routeSheetsChannels> = {
  'routeSheets:state': (_input, ctx) =>
    ctx.host.routeSheets.state(
      ctx.services.emailAccount,
      ctx.services.oldRouteSheetsFolderExists(),
    ),
  'routeSheets:distribution': (_input, ctx) => ctx.host.routeSheets.distributionView(),
  'routeSheets:preview': ({ routeCode }, ctx) => ctx.host.routeSheets.preview(routeCode),
  'routeSheets:runs': (_input, ctx) => ctx.host.routeSheets.runList(),

  'routeSheets:load-run': ({ id }, ctx) => {
    ctx.host.routeSheets.loadRun(id);
    return null;
  },
  'routeSheets:new-run': (_input, ctx) => {
    ctx.host.routeSheets.newRun();
    return null;
  },
  'routeSheets:delete-run': ({ id }, ctx) => {
    ctx.host.routeSheets.deleteRun(id);
    return null;
  },

  'routeSheets:set-decision': ({ routeCode, decision }, ctx) => {
    ctx.host.routeSheets.setDecision(routeCode, decision);
    return null;
  },
  'routeSheets:accept-suggestions': (_input, ctx) => ctx.host.routeSheets.acceptSuggestions(),
  'routeSheets:mark-sent': ({ routeCode, how }, ctx) => {
    ctx.host.routeSheets.markSent(routeCode, how);
    return null;
  },
  'routeSheets:set-wave-pad': ({ waveTime, pad }, ctx) =>
    ctx.host.routeSheets.setWavePad(waveTime, pad),

  'routeSheets:send-one': ({ routeCode }, ctx) =>
    ctx.host.routeSheets.sendOne(routeCode, ctx.services.emailAccount),
  'routeSheets:email-all': (_input, ctx) =>
    ctx.host.routeSheets.emailAll(ctx.services.emailAccount),
  'routeSheets:export-all': (_input, ctx) => ctx.host.routeSheets.exportAll(ctx.services),
  'routeSheets:copy-email': ({ routeCode }, ctx) => ctx.host.routeSheets.copyEmail(routeCode),
  'routeSheets:open-draft': ({ routeCode }, ctx) =>
    ctx.host.routeSheets.openDraft(routeCode, ctx.services),
  'routeSheets:open-mail-app': ({ routeCode }, ctx) =>
    ctx.host.routeSheets.openMailApp(routeCode, ctx.services),
  'routeSheets:save-pdf-page': ({ routeCode }, ctx) =>
    ctx.host.routeSheets.savePdfPage(routeCode, ctx.services),
  'routeSheets:view-original-page': ({ routeCode }, ctx) =>
    ctx.host.routeSheets.viewOriginalPage(routeCode, ctx.services),
};
