import {
  createAttendancePolicyInputSchema,
  createProjectInputSchema,
  createScheduleRuleInputSchema,
  generateSessionsInputSchema,
  type AttendancePolicy,
  type CreateAttendancePolicyInput,
  type CreateProjectInput,
  type CreateScheduleRuleInput,
  type GenerateSessionsInput,
  type ProjectSummary,
  type ScheduleRule,
  type SessionSummary,
  type TodayResponse,
  type UpdateProjectInput,
  type UpdateScheduleRuleInput,
} from '@qzu/contracts'
import { deriveSessionStatus, generateWeeklySessionTimes } from '@qzu/core'
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
}

const projectIds = { design: '00000000-0000-4000-8000-000000000001', methods: '00000000-0000-4000-8000-000000000002' } as const
const plusMinutes = (date: Date, minutes: number) => new Date(date.getTime() + minutes * 60_000)

function session(id: string, project: ProjectSummary, startAt: Date, endAt: Date, openAt: Date, closeAt: Date, now: Date): SessionSummary {
  return { id, projectId: project.id, projectName: project.name, scheduledStartAt: startAt.toISOString(), scheduledEndAt: endAt.toISOString(), checkInOpenAt: openAt.toISOString(), checkInCloseAt: closeAt.toISOString(), locationName: project.id === projectIds.design ? '设计楼 204' : '理科楼 108', status: deriveSessionStatus({ now, startAt, endAt, checkInOpenAt: openAt, checkInCloseAt: closeAt }) }
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
  listSessions(projectId: string, now = new Date()): Promise<readonly SessionSummary[]> { return Promise.resolve(this.sessionsFor(projectId, now)) }
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
  getSession(id: string, now = new Date()): Promise<SessionSummary | null> { return Promise.resolve(this.projects.flatMap((project) => this.sessionsFor(project.id, now)).find((item) => item.id === id) ?? null) }
  getToday(_userId: string, now = new Date()): Promise<TodayResponse> { const all = this.projects.flatMap((project) => this.sessionsFor(project.id, now)); return Promise.resolve({ serverTime: now.toISOString(), activeCheckin: all.find((item) => item.status === 'CHECKIN_OPEN' || item.status === 'IN_PROGRESS') ?? null, nextSession: all.find((item) => item.status === 'UPCOMING') ?? null, todaySessions: all }) }
  upsertAttendancePolicy(projectId: string, input: CreateAttendancePolicyInput): Promise<AttendancePolicy> { return Promise.resolve({ id: crypto.randomUUID(), projectId, ...createAttendancePolicyInputSchema.parse(input) }) }
}
