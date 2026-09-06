import {
  createAttendancePolicyInputSchema,
  checkInInputSchema,
  createProjectMemberInputSchema,
  createProjectInputSchema,
  createScheduleRuleInputSchema,
  generateSessionsInputSchema,
  type AttendancePolicy,
  type AttendanceRecord,
  type CheckInInput,
  type CreateAttendancePolicyInput,
  type CreateProjectInput,
  type CreateProjectMemberInput,
  type CreateScheduleRuleInput,
  type GenerateSessionsInput,
  type ProjectSummary,
  type ProjectMember,
  type ScheduleRule,
  type SessionSummary,
  type TodayResponse,
  type TimetableResponse,
  type UpdateProjectInput,
  type UpdateScheduleRuleInput,
} from '@qzu/contracts'
import { applyAttendanceAction, assertAttendanceEligible, deriveSessionStatus, generateWeeklySessionTimes } from '@qzu/core'
import type { AuthContext } from '@qzu/auth'

export class RepositoryError extends Error {
  public constructor(public readonly code: 'DATABASE_UNAVAILABLE' | 'NOT_FOUND', message = 'Repository operation failed') {
    super(message)
    this.name = 'RepositoryError'
  }
}

export interface BusinessRepository {
  listProjects(): Promise<readonly ProjectSummary[]>
  createProject(input: CreateProjectInput, actor: AuthContext): Promise<ProjectSummary>
  updateProject(id: string, input: UpdateProjectInput): Promise<ProjectSummary | null>
  getProject(id: string): Promise<ProjectSummary | null>
  listScheduleRules(projectId: string): Promise<readonly ScheduleRule[]>
  createScheduleRule(projectId: string, input: CreateScheduleRuleInput): Promise<ScheduleRule>
  updateScheduleRule(id: string, input: UpdateScheduleRuleInput): Promise<ScheduleRule | null>
  listSessions(projectId: string, now?: Date): Promise<readonly SessionSummary[]>
  generateSessions(projectId: string, input: GenerateSessionsInput): Promise<readonly SessionSummary[]>
  getSession(id: string, now?: Date): Promise<SessionSummary | null>
  getToday(userId: string, now?: Date): Promise<TodayResponse>
  upsertAttendancePolicy(projectId: string, input: CreateAttendancePolicyInput): Promise<AttendancePolicy>
  listMembers(projectId: string): Promise<readonly ProjectMember[]>
  createMember(projectId: string, input: CreateProjectMemberInput): Promise<ProjectMember>
  getMemberForUser(projectId: string, userId: string): Promise<ProjectMember | null>
  getTimetable(userId: string, now?: Date): Promise<TimetableResponse>
  checkIn(sessionId: string, userId: string, input: CheckInInput, now?: Date): Promise<AttendanceRecord>
  listAttendance(sessionId: string): Promise<readonly AttendanceRecord[]>
}

const projectIds = { design: '00000000-0000-4000-8000-000000000001', methods: '00000000-0000-4000-8000-000000000002' } as const
const plusMinutes = (date: Date, minutes: number) => new Date(date.getTime() + minutes * 60_000)

function session(id: string, project: ProjectSummary, startAt: Date, endAt: Date, openAt: Date, closeAt: Date, now: Date): SessionSummary {
  return { id, projectId: project.id, projectName: project.name, scheduledStartAt: startAt.toISOString(), scheduledEndAt: endAt.toISOString(), checkInOpenAt: openAt.toISOString(), checkInCloseAt: closeAt.toISOString(), locationName: project.id === projectIds.design ? '设计楼 204' : '理科楼 108', status: deriveSessionStatus({ now, startAt, endAt, checkInOpenAt: openAt, checkInCloseAt: closeAt }) }
}

function refreshSessionStatus(value: SessionSummary, now: Date): SessionSummary {
  return { ...value, status: deriveSessionStatus({ now, startAt: new Date(value.scheduledStartAt), endAt: new Date(value.scheduledEndAt), checkInOpenAt: new Date(value.checkInOpenAt), checkInCloseAt: new Date(value.checkInCloseAt) }) }
}

function seedProjects(): ProjectSummary[] {
  return [
    { id: projectIds.design, name: '用户体验研究', description: '移动端产品研究课程。', type: 'COURSE', timezone: 'Asia/Shanghai', effectiveStartDate: '2026-09-01', effectiveEndDate: '2026-12-31', status: 'ACTIVE' },
    { id: projectIds.methods, name: '设计思维工作坊', description: '面向项目成员的实践活动。', type: 'ACTIVITY', timezone: 'Asia/Shanghai', effectiveStartDate: '2026-09-01', effectiveEndDate: '2026-12-31', status: 'ACTIVE' },
  ]
}

export class MemoryBusinessRepository implements BusinessRepository {
  private readonly projects = seedProjects()
  private readonly rules = new Map<string, ScheduleRule>()
  private readonly generated = new Map<string, readonly SessionSummary[]>()
  private readonly members = new Map<string, ProjectMember[]>()
  private readonly attendance = new Map<string, AttendanceRecord>()
  public constructor() {
    for (const projectId of Object.values(projectIds)) {
      this.members.set(projectId, [{ id: crypto.randomUUID(), projectId, userId: '00000000-0000-4000-8000-000000000011', displayName: 'Dev Student', externalCode: null }])
    }
  }
  listProjects(): Promise<readonly ProjectSummary[]> { return Promise.resolve(this.projects) }
  createProject(input: CreateProjectInput, actor: AuthContext): Promise<ProjectSummary> {
    void actor
    const value = createProjectInputSchema.parse(input)
    const project: ProjectSummary = { id: crypto.randomUUID(), name: value.name, description: value.description ?? null, type: value.type, timezone: value.timezone, effectiveStartDate: value.effectiveStartDate, effectiveEndDate: value.effectiveEndDate ?? null, status: 'DRAFT' }
    this.projects.unshift(project)
    return Promise.resolve(project)
  }
  updateProject(id: string, input: UpdateProjectInput): Promise<ProjectSummary | null> {
    const index = this.projects.findIndex((project) => project.id === id)
    if (index < 0) return Promise.resolve(null)
    const next = { ...this.projects[index]!, ...input } as ProjectSummary
    this.projects[index] = next
    return Promise.resolve(next)
  }
  getProject(id: string): Promise<ProjectSummary | null> { return Promise.resolve(this.projects.find((project) => project.id === id) ?? null) }
  listScheduleRules(projectId: string): Promise<readonly ScheduleRule[]> { return Promise.resolve([...this.rules.values()].filter((rule) => rule.projectId === projectId)) }
  async createScheduleRule(projectId: string, input: CreateScheduleRuleInput): Promise<ScheduleRule> {
    if (!(await this.getProject(projectId))) throw new RepositoryError('NOT_FOUND', 'Project not found')
    const rule = { id: crypto.randomUUID(), projectId, ...createScheduleRuleInputSchema.parse(input) }
    this.rules.set(rule.id, rule)
    return rule
  }
  updateScheduleRule(id: string, input: UpdateScheduleRuleInput): Promise<ScheduleRule | null> {
    const current = this.rules.get(id)
    if (!current) return Promise.resolve(null)
    const next = { ...current, ...input } as ScheduleRule
    this.rules.set(id, next)
    return Promise.resolve(next)
  }
  private sessionsFor(projectId: string, now: Date): SessionSummary[] {
    const project = this.projects.find((item) => item.id === projectId)
    if (!project) return []
    const prefix = project.id === projectIds.design ? '00000000-0000-4000-8000-0000000001' : '00000000-0000-4000-8000-0000000002'
    return [session(`${prefix}01`, project, plusMinutes(now, -30), plusMinutes(now, 30), plusMinutes(now, -45), plusMinutes(now, 10), now), session(`${prefix}02`, project, plusMinutes(now, 15), plusMinutes(now, 110), plusMinutes(now, 0), plusMinutes(now, 125), now), session(`${prefix}03`, project, plusMinutes(now, 190), plusMinutes(now, 280), plusMinutes(now, 175), plusMinutes(now, 295), now)]
  }
  listSessions(projectId: string, now = new Date()): Promise<readonly SessionSummary[]> {
    const project = this.projects.find((item) => item.id === projectId)
    const generated = [...this.generated.values()].flat().filter((item) => item.projectId === projectId).map((item) => refreshSessionStatus(item, now))
    return Promise.resolve(project && (project.id === projectIds.design || project.id === projectIds.methods) ? this.sessionsFor(projectId, now) : generated)
  }
  async generateSessions(projectId: string, input: GenerateSessionsInput): Promise<readonly SessionSummary[]> {
    const project = await this.getProject(projectId)
    const rule = this.rules.get(generateSessionsInputSchema.parse(input).scheduleRuleId)
    if (!project || !rule || rule.projectId !== projectId) return []
    const existing = this.generated.get(rule.id)
    if (existing) return existing
    const created = generateWeeklySessionTimes({ timezone: rule.timezone, startDate: rule.effectiveStartDate, endDate: rule.effectiveEndDate, weekdays: rule.weekdays, intervalWeeks: rule.everyNWeeks, startTime: rule.localStartTime, endTime: rule.localEndTime }).map((item) => session(crypto.randomUUID(), project, item.scheduledStartAt, item.scheduledEndAt, plusMinutes(item.scheduledStartAt, -15), plusMinutes(item.scheduledEndAt, 15), new Date()))
    this.generated.set(rule.id, created)
    return created
  }
  getSession(id: string, now = new Date()): Promise<SessionSummary | null> { return Promise.resolve(this.projects.flatMap((project) => this.sessionsFor(project.id, now)).find((item) => item.id === id) ?? [...this.generated.values()].flat().map((item) => refreshSessionStatus(item, now)).find((item) => item.id === id) ?? null) }
  getToday(userId: string, now = new Date()): Promise<TodayResponse> { const all = this.projects.flatMap((project) => project.id === projectIds.design || project.id === projectIds.methods ? this.sessionsFor(project.id, now) : [...this.generated.values()].flat().filter((item) => item.projectId === project.id).map((item) => refreshSessionStatus(item, now))).filter((item) => this.members.get(item.projectId)?.some((member) => member.userId === userId) ?? false); return Promise.resolve({ serverTime: now.toISOString(), activeCheckin: all.find((item) => item.status === 'CHECKIN_OPEN' || item.status === 'IN_PROGRESS') ?? null, nextSession: all.find((item) => item.status === 'UPCOMING') ?? null, todaySessions: all }) }
  upsertAttendancePolicy(projectId: string, input: CreateAttendancePolicyInput): Promise<AttendancePolicy> { return Promise.resolve({ id: crypto.randomUUID(), projectId, ...createAttendancePolicyInputSchema.parse(input) }) }
  listMembers(projectId: string): Promise<readonly ProjectMember[]> { return Promise.resolve([...(this.members.get(projectId) ?? [])]) }
  async createMember(projectId: string, input: CreateProjectMemberInput): Promise<ProjectMember> {
    if (!(await this.getProject(projectId))) throw new RepositoryError('NOT_FOUND', 'Project not found')
    const value = createProjectMemberInputSchema.parse(input)
    const members = this.members.get(projectId) ?? []
    const existing = value.userId ? members.find((member) => member.userId === value.userId) : undefined
    if (existing) return existing
    const member: ProjectMember = { id: crypto.randomUUID(), projectId, userId: value.userId ?? null, displayName: value.displayName, externalCode: value.externalCode ?? null }
    members.push(member)
    this.members.set(projectId, members)
    return member
  }
  getMemberForUser(projectId: string, userId: string): Promise<ProjectMember | null> { return Promise.resolve(this.members.get(projectId)?.find((member) => member.userId === userId) ?? null) }
  getTimetable(userId: string, now = new Date()): Promise<TimetableResponse> { const items = this.projects.flatMap((project) => project.id === projectIds.design || project.id === projectIds.methods ? this.sessionsFor(project.id, now) : [...this.generated.values()].flat().filter((item) => item.projectId === project.id).map((item) => refreshSessionStatus(item, now))).filter((item) => this.members.get(item.projectId)?.some((member) => member.userId === userId) ?? false); return Promise.resolve({ serverTime: now.toISOString(), items }) }
  async checkIn(sessionId: string, userId: string, input: CheckInInput, now = new Date()): Promise<AttendanceRecord> {
    checkInInputSchema.parse(input)
    const sessionValue = await this.getSession(sessionId, now)
    if (!sessionValue) throw new RepositoryError('NOT_FOUND', 'Session not found')
    const member = await this.getMemberForUser(sessionValue.projectId, userId)
    const existing = member ? this.attendance.get(`${sessionId}:${member.id}`) : undefined
    assertAttendanceEligible({ now, opensAt: new Date(sessionValue.checkInOpenAt), closesAt: new Date(sessionValue.checkInCloseAt), rosterMode: 'ROSTER', hasMemberRecord: member !== null, alreadyCheckedIn: existing !== undefined, locationRequired: false, passcodeRequired: false })
    if (!member) throw new RepositoryError('NOT_FOUND', 'Project member not found')
    const created = applyAttendanceAction({ record: null, action: 'CHECK_IN', now, actorUserId: userId, sessionId, projectMemberId: member.id, userId })
    const record: AttendanceRecord = { ...created, checkedInAt: created.checkedInAt?.toISOString() ?? null, createdAt: created.createdAt.toISOString(), updatedAt: created.updatedAt.toISOString(), voidedAt: created.voidedAt?.toISOString() ?? null, method: 'MANUAL', status: now.getTime() > new Date(sessionValue.scheduledStartAt).getTime() ? 'LATE' : 'PRESENT', distanceMeters: null, accuracyMeters: null, locationPassed: null }
    this.attendance.set(`${sessionId}:${member.id}`, record)
    return record
  }
  listAttendance(sessionId: string): Promise<readonly AttendanceRecord[]> { return Promise.resolve([...this.attendance.values()].filter((record) => record.sessionId === sessionId)) }
}
