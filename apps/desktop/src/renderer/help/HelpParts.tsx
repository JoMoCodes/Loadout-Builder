// Small pieces the help uses: a picture of the app, and a drawn stand-in where a picture of
// another website will go. Every picture of the app is taken in demo mode, so it only ever shows
// made-up drivers and vans.

import { ImageOff } from 'lucide-react';
import assignResult from './shot-assign-result.png';
import associates from './shot-associates.png';
import homeChecklist from './shot-home-checklist.png';
import loadOutRoster from './shot-load-out-roster.png';
import print from './shot-print.png';
import routeData from './shot-route-data.png';
import vehicles from './shot-vehicles.png';

export const SHOTS = {
  'home-checklist': homeChecklist,
  associates,
  vehicles,
  'load-out-roster': loadOutRoster,
  'route-data': routeData,
  print,
  'assign-result': assignResult,
} as const;

export type ShotName = keyof typeof SHOTS;

/** A picture of the app, with words under it that say what it shows. */
export function Shot({ name, caption }: { name: ShotName; caption: string }) {
  return (
    <figure className="help-shot" data-shot={name}>
      <img src={SHOTS[name]} alt={caption} loading="lazy" />
      <figcaption>{caption}</figcaption>
    </figure>
  );
}

/**
 * A drawn box where a picture of another website (DSP Workplace, Cortex) will go. Those pictures
 * can only be taken on a real account, so they are added later with no real names on screen.
 */
export function ShotToCome({ name, what }: { name: string; what: string }) {
  return (
    <div className="help-shot-to-come" data-screenshot-to-come={name} role="note">
      <ImageOff aria-hidden="true" />
      <span>Screenshot to come: {what}</span>
    </div>
  );
}
