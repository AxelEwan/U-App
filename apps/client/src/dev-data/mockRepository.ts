import type { CurrentUser } from '../navigation/definitions'
import type { SessionSummary, TodayResponse } from '@qzu/contracts'
import { getSessionStatus } from '../domain/sessionStatus'
import type { CreateTaskInput, MockHomeScenario, MockMemberStatus, MockPublishTask, MockState } from './types'

const studentUser: CurrentUser = {
  id: 'mock-user-student-001',
  displayName: 'User A',
  roleLabel: '普通成员',
  capabilities: { canManageProjects: false },
}

const adminUser: CurrentUser = {
  id: 'mock-user-admin-001',
  displayName: 'User B',
  roleLabel: '管理员',
  capabilities: { canManageProjects: true },
}

const initialTasks: readonly MockPublishTask[] = [
  {
    id: 'task-design-thinking',
    name: '设计思维工作坊',
    type: 'ACTIVITY',
    sessionLabel: '今天 14:00–16:00',
    location: '创新楼 A201',
    checkedInCount: 18,
    totalCount: 24,
    status: 'IN_PROGRESS',
    members: [
      { id: 'member-a', displayName: '成员甲', status: 'PRESENT' },
      { id: 'member-b', displayName: '成员乙', status: 'PENDING' },
      { id: 'member-c', displayName: 'User A', status: 'LEAVE' },
      { id: 'member-d', displayName: 'User B', status: 'ABSENT' },
    ],
  },
  {
    id: 'task-research-methods',
    name: '研究方法',
    type: 'COURSE',
    sessionLabel: '昨天 09:00–10:30',
    location: '文科楼 302',
    checkedInCount: 31,
    totalCount: 32,
    status: 'HISTORY',
    members: [
      { id: 'member-e', displayName: '成员丙', status: 'PRESENT' },
      { id: 'member-f', displayName: '成员丁', status: 'PRESENT' },
    ],
  },
]

const initialState: MockState = {
  currentUser: studentUser,
  homeScenario: 'CHECKIN_ACTIVE',
  courses: [
    { id: 'course-ux', name: '用户体验研究', location: '设计楼 204', weekday: 1, startMinutes: 9 * 60, durationMinutes: 100, weeks: '第 1–16 周', checkInSummary: '近 4 次签到：4 次已签到' },
    { id: 'course-data', name: '数据思维', location: '理科楼 108', weekday: 2, startMinutes: 13 * 60 + 45, durationMinutes: 95, weeks: '第 1–16 周', checkInSummary: '近 4 次签到：3 次已签到' },
    { id: 'course-writing', name: '学术写作', location: '文科楼 302', weekday: 3, startMinutes: 10 * 60, durationMinutes: 90, weeks: '第 2–16 周', checkInSummary: '近 4 次签到：4 次已签到' },
    { id: 'course-studio', name: '产品工作室', location: '创新楼 A201', weekday: 4, startMinutes: 14 * 60, durationMinutes: 120, weeks: '第 1–12 周', checkInSummary: '近 4 次签到：2 次已签到' },
    { id: 'course-methods', name: '研究方法', location: '文科楼 302', weekday: 5, startMinutes: 9 * 60, durationMinutes: 90, weeks: '第 1–16 周', checkInSummary: '近 4 次签到：4 次已签到' },
  ],
  publishTasks: initialTasks,
}

function cloneState(state: MockState): MockState {
  return { ...state, courses: [...state.courses], publishTasks: [...state.publishTasks] }
}

class MockRepository {
  private state: MockState = cloneState(initialState)
  private readonly listeners = new Set<() => void>()

  getState(): MockState {
    return this.state
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private notify(): void {
    this.listeners.forEach((listener) => listener())
  }

  setRole(role: 'STUDENT' | 'ADMIN'): void {
    this.state = { ...this.state, currentUser: role === 'ADMIN' ? adminUser : studentUser }
    this.notify()
  }

  setHomeScenario(scenario: MockHomeScenario): void {
    this.state = { ...this.state, homeScenario: scenario }
    this.notify()
  }

  getToday(now = new Date()): TodayResponse {
    const makeSession = (id: string, startOffset: number, endOffset: number): SessionSummary => {
      const start = new Date(now.getTime() + startOffset * 60_000)
      const end = new Date(now.getTime() + endOffset * 60_000)
      const open = new Date(start.getTime() - 15 * 60_000)
      const close = new Date(end.getTime() + 15 * 60_000)
      return {
        id, projectId: '00000000-0000-4000-8000-000000000001', projectName: '用户体验研究',
        scheduledStartAt: start.toISOString(), scheduledEndAt: end.toISOString(), checkInOpenAt: open.toISOString(), checkInCloseAt: close.toISOString(), locationName: '设计楼 204',
        status: getSessionStatus({ scheduledStartAt: start.toISOString(), scheduledEndAt: end.toISOString(), checkInOpenAt: open.toISOString(), checkInCloseAt: close.toISOString() }, now),
      }
    }
    const active = makeSession('00000000-0000-4000-8000-000000000101', -28, 72)
    const next = makeSession('00000000-0000-4000-8000-000000000102', 10, 105)
    const later = makeSession('00000000-0000-4000-8000-000000000103', 180, 270)
    const scenario = this.state.homeScenario
    const activeCheckin = scenario === 'CHECKIN_ACTIVE' ? active : null
    const nextSession = scenario === 'NEXT_SESSION' ? next : null
    const todaySessions = scenario === 'EMPTY' ? [] : scenario === 'TODAY_ONLY' ? [active, next, later] : [active, next, later]
    return { serverTime: now.toISOString(), activeCheckin, nextSession, todaySessions }
  }

  createTask(input: CreateTaskInput): MockPublishTask {
    const task: MockPublishTask = {
      id: `mock-task-${Date.now()}`,
      name: input.name || '未命名签到任务',
      type: input.type,
      sessionLabel: `${input.startDate} ${input.startTime}–${input.endTime}`,
      location: input.locationName || '地点待定',
      checkedInCount: 0,
      totalCount: input.rosterMode === 'FREE_FORM' ? 0 : 24,
      status: 'IN_PROGRESS',
      members: [],
    }
    this.state = { ...this.state, publishTasks: [task, ...this.state.publishTasks] }
    this.notify()
    return task
  }

  updateMemberStatus(taskId: string, memberId: string, status: MockMemberStatus): void {
    this.state = {
      ...this.state,
      publishTasks: this.state.publishTasks.map((task) =>
        task.id !== taskId
          ? task
          : { ...task, members: task.members.map((member) => member.id === memberId ? { ...member, status } : member) },
      ),
    }
    this.notify()
  }
}

export const mockRepository = new MockRepository()
