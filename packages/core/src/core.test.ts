import { describe, expect, it } from 'vitest'

import {
  assertAttendanceEligible,
  applyAttendanceAction,
  DomainError,
  generateWeeklySessionTimes,
  getCheckInWindowState,
  haversineDistanceMeters,
  isWithinRadius,
} from './index'

describe('geospatial rules', () => {
  it('calculates a known haversine distance', () => {
    const meters = haversineDistanceMeters(
      { latitude: 31.2304, longitude: 121.4737 },
      { latitude: 31.2314, longitude: 121.4737 },
    )
    expect(meters).toBeCloseTo(111.2, 0)
  })

  it('treats the radius boundary as inside', () => {
    expect(isWithinRadius(100, 100)).toBe(true)
    expect(isWithinRadius(100.001, 100)).toBe(false)
  })
})

describe('check-in window', () => {
  const opens = new Date('2026-09-05T01:00:00.000Z')
  const closes = new Date('2026-09-05T02:00:00.000Z')

  it('includes both configured boundaries', () => {
    expect(getCheckInWindowState(opens, opens, closes)).toBe('OPEN')
    expect(getCheckInWindowState(closes, opens, closes)).toBe('OPEN')
  })
})

describe('weekly recurrence', () => {
  it('generates every second Monday in project timezone and stores UTC instants', () => {
    const sessions = generateWeeklySessionTimes({
      timezone: 'Asia/Shanghai',
      startDate: '2026-09-07',
      endDate: '2026-10-05',
      weekdays: [1],
      startTime: '09:00',
      endTime: '10:30',
      intervalWeeks: 2,
    })
    expect(sessions.map((session) => session.localDate)).toEqual([
      '2026-09-07',
      '2026-09-21',
      '2026-10-05',
    ])
    expect(sessions[0]?.scheduledStartAt.toISOString()).toBe('2026-09-07T01:00:00.000Z')
  })

  it('uses timezone offsets supplied by the timezone library across DST', () => {
    const sessions = generateWeeklySessionTimes({
      timezone: 'America/New_York',
      startDate: '2026-03-01',
      endDate: '2026-03-15',
      weekdays: [7],
      startTime: '09:00',
      endTime: '10:00',
      intervalWeeks: 1,
    })
    expect(sessions.map((session) => session.scheduledStartAt.toISOString())).toEqual([
      '2026-03-01T14:00:00.000Z',
      '2026-03-08T13:00:00.000Z',
      '2026-03-15T13:00:00.000Z',
    ])
  })
})

describe('attendance eligibility', () => {
  const base = {
    now: new Date('2026-09-05T01:30:00.000Z'),
    opensAt: new Date('2026-09-05T01:00:00.000Z'),
    closesAt: new Date('2026-09-05T02:00:00.000Z'),
    rosterMode: 'ROSTER' as const,
    hasMemberRecord: true,
    alreadyCheckedIn: false,
    locationRequired: false,
    passcodeRequired: false,
  }

  it('rejects a duplicate at the domain boundary', () => {
    expect(() => assertAttendanceEligible({ ...base, alreadyCheckedIn: true })).toThrowError(
      DomainError,
    )
  })

  it('accepts an eligible member', () => {
    expect(() => assertAttendanceEligible(base)).not.toThrow()
  })
})

describe('attendance record lifecycle', () => {
  const now = new Date('2026-09-05T02:00:00.000Z')

  it('creates a self check-in and revokes it without deleting history', () => {
    const checkedIn = applyAttendanceAction({
      record: null,
      action: 'CHECK_IN',
      now,
      actorUserId: 'user-student',
      sessionId: 'session-1',
      projectMemberId: 'member-1',
      userId: 'user-student',
    })
    expect(checkedIn.status).toBe('PRESENT')
    expect(checkedIn.source).toBe('SELF_CHECKIN')

    const revoked = applyAttendanceAction({
      record: checkedIn,
      action: 'REVOKE',
      now: new Date(now.getTime() + 1000),
      actorUserId: 'user-admin',
      sessionId: 'session-1',
      projectMemberId: 'member-1',
    })
    expect(revoked.id).toBe(checkedIn.id)
    expect(revoked.voidedByUserId).toBe('user-admin')
    expect(revoked.voidedAt).not.toBeNull()
  })

  it('uses an admin source for leave and absence decisions', () => {
    const leave = applyAttendanceAction({
      record: null,
      action: 'MARK_LEAVE',
      now,
      actorUserId: 'user-admin',
      sessionId: 'session-1',
      projectMemberId: 'member-1',
    })
    expect(leave.status).toBe('LEAVE')
    expect(leave.source).toBe('ADMIN')
    expect(leave.checkedInAt).toBeNull()
  })
})
