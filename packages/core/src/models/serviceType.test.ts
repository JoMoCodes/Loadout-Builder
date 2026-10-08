// Service-type helpers. Expected answers come from the old Python helpers on the same inputs.

import { describe, expect, it } from 'vitest';
import { createDriverRow, hasVan, needsVan, padLabel } from './roster';
import { isOnRoadDriver, isRideAlong, requiredQualification, serviceFamily } from './serviceType';

const CASES: Array<[string | null, string, string, boolean, boolean]> = [
  ['Standard Parcel Step Van - US', 'step van', 'Step Van', false, false],
  ['Standard Parcel Electric - Rivian MEDIUM', 'electric', 'EDV', false, false],
  ['Nursery Route Level 2 - Electric Vehicle', 'electric', 'EDV', false, false],
  ['Standard Parcel - Large Van', 'large van', 'CDV', false, false],
  ['Cargo van', 'large van', 'CDV', false, false],
  ['DSP Initiated Work', '', '', false, false],
  ['On-Road Experience: Rider', '', '', true, false],
  ['On Road Experience - Driver', '', '', false, true],
  ['on-road experience rider', '', '', true, false],
  ['', '', '', false, false],
  ['Rivian', 'electric', 'EDV', false, false],
  ['ON ROAD EXPERIENCE DRIVER!!', '', '', false, true],
  ['Step Van Electric', 'step van', 'Step Van', false, false],
  ['On-Road   Experience:   Rider (training)', '', '', true, false],
  ['Experience Rider', '', '', false, false],
  ['STEP VAN', 'step van', 'Step Van', false, false],
  [null, '', '', false, false],
];

describe('service type helpers', () => {
  it.each(CASES)('reads %j', (text, family, qualification, rider, onRoadDriver) => {
    expect(serviceFamily(text)).toBe(family);
    expect(requiredQualification(text)).toBe(qualification);
    expect(isRideAlong(text)).toBe(rider);
    expect(isOnRoadDriver(text)).toBe(onRoadDriver);
  });
});

describe('who needs a van', () => {
  it.each([
    ['Standard Parcel Step Van - US', true],
    ['Standard Parcel Electric - Rivian MEDIUM', true],
    ['Nursery Route Level 2 - Electric Vehicle', true],
    ['Standard Parcel - Large Van', true],
    ['Cargo van', true],
    ['DSP Initiated Work', true],
    ['On-Road Experience: Rider', false],
    ['On Road Experience - Driver', true],
    ['on-road experience rider', false],
    ['', false],
    ['Rivian', true],
    ['ON ROAD EXPERIENCE DRIVER!!', true],
    ['Step Van Electric', true],
    ['On-Road   Experience:   Rider (training)', false],
    ['Experience Rider', true],
    ['STEP VAN', true],
    ['   ', false],
    [' Standard Parcel ', true],
  ] as Array<[string, boolean]>)('service type %j needs a van: %s', (serviceType, expected) => {
    expect(needsVan(createDriverRow({ serviceType }))).toBe(expected);
  });

  it('does not look at the shift type', () => {
    expect(needsVan(createDriverRow({ shiftType: 'Electric Route' }))).toBe(false);
    expect(
      needsVan(createDriverRow({ shiftType: 'Call Out', serviceType: 'Standard Parcel' })),
    ).toBe(true);
  });

  it('knows a van from a blank or spaces', () => {
    expect(hasVan(createDriverRow({ vehicle: '  ' }))).toBe(false);
    expect(hasVan(createDriverRow({ vehicle: '51' }))).toBe(true);
  });

  it('writes the PAD label', () => {
    expect(padLabel(createDriverRow({ pad: '2' }))).toBe('PAD 2');
    expect(padLabel(createDriverRow())).toBe('');
  });
});
