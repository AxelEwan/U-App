export const sessionLifecycleStatuses = [
  'UPCOMING',
  'CHECKIN_OPEN',
  'IN_PROGRESS',
  'CHECKIN_CLOSED',
  'ENDED',
] as const

export type SessionLifecycleStatus = (typeof sessionLifecycleStatuses)[number]

export interface SessionStatusInput {
  readonly now: Date | number
  readonly startAt: Date | number
  readonly endAt: Date | number
  readonly checkInOpenAt: Date | number
  readonly checkInCloseAt: Date | number
}

function timestamp(value: Date | number): number {
  return value instanceof Date ? value.getTime() : value
}

export function deriveSessionStatus(input: SessionStatusInput): SessionLifecycleStatus {
  const now = timestamp(input.now)
  const startAt = timestamp(input.startAt)
  const endAt = timestamp(input.endAt)
  const checkInOpenAt = timestamp(input.checkInOpenAt)
  const checkInCloseAt = timestamp(input.checkInCloseAt)

  if (now >= endAt) return 'ENDED'
  if (now >= checkInCloseAt) return 'CHECKIN_CLOSED'
  if (now >= startAt) return 'IN_PROGRESS'
  if (now >= checkInOpenAt) return 'CHECKIN_OPEN'
  return 'UPCOMING'
}
