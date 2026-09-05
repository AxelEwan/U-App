import { describe, expect, it } from 'vitest'

import { formatCountdown, formatRelativeTime, remainingMilliseconds } from './countdown'

describe('countdown presentation', () => {
  it('uses minutes above ten minutes and MM:SS at ten minutes or less', () => {
    expect(formatRelativeTime(11 * 60_000)).toBe('还有 11 分钟')
    expect(formatRelativeTime(10 * 60_000 + 1_000)).toBe('还有 10 分钟')
    expect(formatRelativeTime(10 * 60_000)).toBe('10:00')
    expect(formatRelativeTime(9 * 60_000 + 32_000)).toBe('09:32')
    expect(formatCountdown(0)).toBe('00:00')
  })
  it('derives remaining time from timestamps', () => {
    expect(remainingMilliseconds('2026-09-05T10:00:00.000Z', Date.parse('2026-09-05T09:59:30.000Z'))).toBe(30_000)
  })
})
