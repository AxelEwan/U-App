import type { CurrentUser } from '../navigation/definitions'

export type MockHomeScenario = 'CHECKIN_ACTIVE' | 'NEXT_SESSION' | 'TODAY_ONLY' | 'EMPTY'
export type MockMemberStatus = 'PRESENT' | 'PENDING' | 'LEAVE' | 'ABSENT'

export interface MockCourse {
  readonly id: string
  readonly name: string
  readonly location: string
  readonly weekday: number
  readonly startMinutes: number
  readonly durationMinutes: number
  readonly weeks: string
  readonly checkInSummary: string
}

export interface MockPublishMember {
  readonly id: string
  readonly displayName: string
  readonly status: MockMemberStatus
}

export interface MockPublishTask {
  readonly id: string
  readonly name: string
  readonly type: 'COURSE' | 'ACTIVITY'
  readonly sessionLabel: string
  readonly location: string
  readonly checkedInCount: number
  readonly totalCount: number
  readonly status: 'IN_PROGRESS' | 'HISTORY'
  readonly members: readonly MockPublishMember[]
}

export interface CreateTaskInput {
  readonly name: string
  readonly description: string
  readonly type: 'COURSE' | 'ACTIVITY'
  readonly startDate: string
  readonly endDate: string
  readonly weekdays: readonly number[]
  readonly intervalWeeks: number
  readonly startTime: string
  readonly endTime: string
  readonly checkInOpen: string
  readonly checkInClose: string
  readonly rosterMode: 'ROSTER' | 'FREE_FORM' | 'MIXED'
  readonly locationName: string
  readonly radiusMeters: number
  readonly locationRequired: boolean
  readonly passcodeEnabled: boolean
  readonly customFields: readonly { name: string; type: 'TEXT' | 'SINGLE_SELECT' | 'MULTI_SELECT'; required: boolean }[]
}

export interface MockState {
  readonly currentUser: CurrentUser
  readonly homeScenario: MockHomeScenario
  readonly courses: readonly MockCourse[]
  readonly publishTasks: readonly MockPublishTask[]
}
