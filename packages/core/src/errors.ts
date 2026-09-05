export type DomainErrorCode =
  | 'NOT_FOUND'
  | 'PROJECT_NOT_FOUND'
  | 'SCHEDULE_RULE_NOT_FOUND'
  | 'SESSION_NOT_FOUND'
  | 'CHECKIN_NOT_OPEN'
  | 'CHECKIN_CLOSED'
  | 'MEMBER_NOT_ELIGIBLE'
  | 'ALREADY_CHECKED_IN'
  | 'LOCATION_REQUIRED'
  | 'LOCATION_OUT_OF_RANGE'
  | 'PASSCODE_INVALID'

export class DomainError extends Error {
  public constructor(
    public readonly code: DomainErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'DomainError'
  }
}
