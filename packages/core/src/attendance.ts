import { DomainError } from './errors'
import { getCheckInWindowState } from './time-window'

export type RosterMode = 'ROSTER' | 'FREE_FORM' | 'MIXED'

export type AttendanceStatus = 'PRESENT' | 'LATE' | 'LEAVE' | 'ABSENT'
export type AttendanceSource = 'SELF_CHECKIN' | 'ADMIN'
export type AttendanceAction = 'CHECK_IN' | 'MARK_LEAVE' | 'MARK_ABSENT' | 'REVOKE'

export interface AttendanceRecordState {
  readonly id: string
  readonly sessionId: string
  readonly projectMemberId: string
  readonly userId: string | null
  readonly checkedInAt: Date | null
  readonly source: AttendanceSource
  readonly status: AttendanceStatus
  readonly createdByUserId: string | null
  readonly createdAt: Date
  readonly updatedAt: Date
  readonly voidedAt: Date | null
  readonly voidedByUserId: string | null
}

export interface AttendanceActionInput {
  readonly record: AttendanceRecordState | null
  readonly action: AttendanceAction
  readonly now: Date
  readonly actorUserId: string
  readonly sessionId: string
  readonly projectMemberId: string
  readonly userId?: string | null
}

export function applyAttendanceAction(input: AttendanceActionInput): AttendanceRecordState {
  if (input.action === 'CHECK_IN' && input.record) {
    throw new DomainError('ALREADY_CHECKED_IN', 'Attendance has already been recorded')
  }
  if (input.action === 'REVOKE' && !input.record) {
    throw new DomainError('NOT_FOUND', 'An attendance record is required for this action')
  }
  if (input.record?.voidedAt && input.action !== 'REVOKE') {
    throw new DomainError('NOT_FOUND', 'A voided attendance record cannot be reused')
  }

  const base = input.record ?? {
    id: crypto.randomUUID(),
    sessionId: input.sessionId,
    projectMemberId: input.projectMemberId,
    userId: input.userId ?? null,
    checkedInAt: null,
    source: input.action === 'CHECK_IN' ? 'SELF_CHECKIN' as const : 'ADMIN' as const,
    status: input.action === 'MARK_LEAVE' ? 'LEAVE' as const : input.action === 'MARK_ABSENT' ? 'ABSENT' as const : 'PRESENT' as const,
    createdByUserId: input.actorUserId,
    createdAt: input.now,
    updatedAt: input.now,
    voidedAt: null,
    voidedByUserId: null,
  }

  if (input.action === 'REVOKE') {
    return { ...base, updatedAt: input.now, voidedAt: input.now, voidedByUserId: input.actorUserId }
  }

  if (input.action === 'CHECK_IN') {
    return {
      ...base,
      userId: input.userId ?? base.userId,
      checkedInAt: input.now,
      source: 'SELF_CHECKIN',
      status: 'PRESENT',
      createdByUserId: input.actorUserId,
      updatedAt: input.now,
      voidedAt: null,
      voidedByUserId: null,
    }
  }

  return {
    ...base,
    source: 'ADMIN',
    status: input.action === 'MARK_LEAVE' ? 'LEAVE' : 'ABSENT',
    createdByUserId: base.createdByUserId ?? input.actorUserId,
    updatedAt: input.now,
    voidedAt: null,
    voidedByUserId: null,
  }
}

export interface AttendanceEligibilityInput {
  readonly now: Date
  readonly opensAt: Date
  readonly closesAt: Date
  readonly rosterMode: RosterMode
  readonly hasMemberRecord: boolean
  readonly alreadyCheckedIn: boolean
  readonly locationRequired: boolean
  readonly locationPassed?: boolean
  readonly passcodeRequired: boolean
  readonly passcodePassed?: boolean
}

export function assertAttendanceEligible(input: AttendanceEligibilityInput): void {
  const window = getCheckInWindowState(input.now, input.opensAt, input.closesAt)
  if (window === 'NOT_OPEN') throw new DomainError('CHECKIN_NOT_OPEN', 'Check-in is not open')
  if (window === 'CLOSED') throw new DomainError('CHECKIN_CLOSED', 'Check-in is closed')
  if (input.alreadyCheckedIn) {
    throw new DomainError('ALREADY_CHECKED_IN', 'Attendance has already been recorded')
  }
  if (input.rosterMode === 'ROSTER' && !input.hasMemberRecord) {
    throw new DomainError('MEMBER_NOT_ELIGIBLE', 'A project member record is required')
  }
  if (input.locationRequired && input.locationPassed === undefined) {
    throw new DomainError('LOCATION_REQUIRED', 'Location evidence is required')
  }
  if (input.locationRequired && !input.locationPassed) {
    throw new DomainError('LOCATION_OUT_OF_RANGE', 'Location is outside the allowed radius')
  }
  if (input.passcodeRequired && !input.passcodePassed) {
    throw new DomainError('PASSCODE_INVALID', 'The check-in passcode is invalid')
  }
}
