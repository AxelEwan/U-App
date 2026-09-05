export type CheckInWindowState = 'NOT_OPEN' | 'OPEN' | 'CLOSED'

export function getCheckInWindowState(
  now: Date,
  opensAt: Date,
  closesAt: Date,
): CheckInWindowState {
  if (closesAt.getTime() < opensAt.getTime()) {
    throw new RangeError('Check-in close time must not precede open time')
  }
  if (now.getTime() < opensAt.getTime()) return 'NOT_OPEN'
  if (now.getTime() > closesAt.getTime()) return 'CLOSED'
  return 'OPEN'
}
