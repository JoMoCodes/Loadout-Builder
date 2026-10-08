// Reading Amazon's service type: which kind of van it calls for, and who needs one.

import {
  FAMILY_ELECTRIC,
  FAMILY_LARGE,
  FAMILY_STEP_VAN,
  QUAL_CDV,
  QUAL_EDV,
  QUAL_STEP_VAN,
} from './constants';

/**
 * The vehicle family a service type calls for, or '' if it doesn't say. Reads the
 * vehicle out of the name, not the route number, so all three nursery levels land
 * on electric together.
 */
export function serviceFamily(serviceType: string | null | undefined): string {
  const text = (serviceType ?? '').toLowerCase();
  if (text.includes('step van')) return FAMILY_STEP_VAN;
  if (text.includes('electric') || text.includes('rivian')) return FAMILY_ELECTRIC;
  if (text.includes('large van') || text.includes('cargo')) return FAMILY_LARGE;
  return '';
}

/** What the route itself demands, read off Amazon's service type. '' where the name doesn't say. */
export function requiredQualification(serviceType: string | null | undefined): string {
  const text = (serviceType ?? '').toLowerCase();
  if (text.includes('step van')) return QUAL_STEP_VAN;
  if (text.includes('electric') || text.includes('rivian')) return QUAL_EDV;
  if (text.includes('large van') || text.includes('cargo')) return QUAL_CDV;
  return '';
}

// On-road experience comes in two shapes: a rider goes out in someone else's van;
// a driver takes one out and is often on neither list.
const ON_ROAD_RIDER = 'on road experience rider';
const ON_ROAD_DRIVER = 'on road experience driver';

/** Lowercase with the punctuation squeezed out, for comparing type names. */
function flatten(text: string | null | undefined): string {
  return (text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter((part) => part !== '')
    .join(' ');
}

/** A rider goes out with someone else, so needs no van of their own. */
export function isRideAlong(serviceType: string | null | undefined): boolean {
  return flatten(serviceType).includes(ON_ROAD_RIDER);
}

/** An on-road experience driver: working today, often on no other list. */
export function isOnRoadDriver(serviceType: string | null | undefined): boolean {
  return flatten(serviceType).includes(ON_ROAD_DRIVER);
}
