import { describe, expect, it } from 'vitest'

import { deriveSessionStatus } from './session-status'

describe('deriveSessionStatus', () => {
  const base = {
    startAt: 1_000,
    endAt: 5_000,
    checkInOpenAt: 500,
    checkInCloseAt: 4_000,
  }

  it.each([
    [0, 'UPCOMING'],
    [500, 'CHECKIN_OPEN'],
    [1_000, 'IN_PROGRESS'],
    [4_000, 'CHECKIN_CLOSED'],
    [5_000, 'ENDED'],
  ] as const)('returns %s at %s', (now, expected) => {
    expect(deriveSessionStatus({ ...base, now })).toBe(expected)
  })
})
