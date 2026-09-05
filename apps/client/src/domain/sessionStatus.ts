import type { SessionSummary } from '@qzu/contracts'

export const sessionLifecycleStatuses = ['UPCOMING', 'CHECKIN_OPEN', 'IN_PROGRESS', 'CHECKIN_CLOSED', 'ENDED'] as const
export type SessionLifecycleStatus = (typeof sessionLifecycleStatuses)[number]

export function deriveClientSessionStatus(input: { now: Date; startAt: Date; endAt: Date; checkInOpenAt: Date; checkInCloseAt: Date }): SessionLifecycleStatus {
  if (input.now >= input.endAt) return 'ENDED'
  if (input.now >= input.checkInCloseAt) return 'CHECKIN_CLOSED'
  if (input.now >= input.startAt) return 'IN_PROGRESS'
  if (input.now >= input.checkInOpenAt) return 'CHECKIN_OPEN'
  return 'UPCOMING'
}

export function getSessionStatus(session: Pick<SessionSummary, 'scheduledStartAt' | 'scheduledEndAt' | 'checkInOpenAt' | 'checkInCloseAt'>, now = new Date()): SessionLifecycleStatus {
  return deriveClientSessionStatus({ now, startAt: new Date(session.scheduledStartAt), endAt: new Date(session.scheduledEndAt), checkInOpenAt: new Date(session.checkInOpenAt), checkInCloseAt: new Date(session.checkInCloseAt) })
}
