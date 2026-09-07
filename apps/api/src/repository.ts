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
  type SemesterConfigInput,
  type SemesterConfigResponse,
  type OnboardingResponse,
  type AttendanceAdminActionInput,
  type AttendanceLiveResponse,
  type RosterEntry,
  type ProjectSummary,
  type ProjectMember,
  type ScheduleRule,
  type SessionSummary,
  type TodayResponse,
  type TimetableResponse,
  type UpdateProjectInput,
  type UpdateScheduleRuleInput,
  type WebStudentClassOption,
} from '@qzu/contracts'
import { applyAttendanceAction, assertAttendanceEligible, deriveSessionStatus, generateWeeklySessionTimes, DomainError } from '@qzu/core'
import type { AuthContext, IdentityProvider } from '@qzu/auth'
import { createHash, randomBytes } from 'node:crypto'

type FixedStudent = { id: string; studentNo: string; displayName: string; classId: string; active: boolean }
type FixedSession = { summary: SessionSummary; courseId: string; classId: string; started: boolean; finalized: boolean }

export class RepositoryError extends Error {
  public constructor(public readonly code: 'DATABASE_UNAVAILABLE' | 'NOT_FOUND' | 'CONFLICT' | 'RATE_LIMITED', message = 'Repository operation failed') {
    super(message)
    this.name = 'RepositoryError'
  }
}
export interface RosterImportResult { readonly imported: number; readonly skipped: number; readonly conflicts: number }
export interface WebLoginChallenge {
  readonly id: string
  readonly challengeToken: string
  readonly shortCode: string
  readonly expiresAt: string
  readonly status: 'PENDING'
}
export interface WebLoginChallengeStatus {
  readonly id: string
  readonly status: 'PENDING' | 'APPROVED' | 'DENIED' | 'CONSUMED' | 'EXPIRED'
  readonly expiresAt: string
  readonly approvedAt: string | null
}

export interface BusinessRepository {
  listIdentityProviders(userId: string): Promise<readonly ('WECHAT_MINIPROGRAM' | 'CASDOOR')[]>
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
  syncSemesterConfig(input: SemesterConfigInput, actor: AuthContext): Promise<SemesterConfigResponse>
  getOnboarding(userId: string): Promise<OnboardingResponse>
  verifyStudent(userId: string, classId: string, displayName: string, studentNoLast4: string): Promise<OnboardingResponse>
  enrollElectives(userId: string, courseIds: readonly string[]): Promise<OnboardingResponse>
  startAttendance(sessionId: string, durationMinutes: number, actor: AuthContext, now?: Date): Promise<SessionSummary>
  getLiveAttendance(sessionId: string, now?: Date): Promise<AttendanceLiveResponse>
  updateAttendance(sessionId: string, input: AttendanceAdminActionInput, actor: AuthContext, now?: Date): Promise<AttendanceRecord>
  finalizeAttendance(sessionId: string, actor: AuthContext, now?: Date): Promise<AttendanceLiveResponse>
  exportAttendanceCsv(sessionId: string): Promise<string>
  importRoster(semesterCode: string, entries: readonly RosterEntry[], actor: AuthContext): Promise<RosterImportResult>
  listWebStudentLoginOptions(): Promise<readonly WebStudentClassOption[]>
  createWebStudentSession(classId: string, displayName: string, studentNoLast4: string): Promise<{ userId: string; token: string; displayName: string }>
  createAdminWebSession(): Promise<{ userId: string; token: string; displayName: string }>
  resolveWebSession(token: string): Promise<AuthContext | null>
  createMiniProgramSession(providerSubject: string): Promise<{ userId: string; token: string; displayName: string }>
  resolveMiniProgramSession(token: string): Promise<AuthContext | null>
  createProviderSession(provider: 'WECHAT_MINIPROGRAM' | 'CASDOOR', providerSubject: string, displayName?: string): Promise<{ userId: string; token: string; displayName: string }>
  linkProviderIdentity(userId: string, provider: 'WECHAT_MINIPROGRAM' | 'CASDOOR', providerSubject: string): Promise<void>
  createWebLoginChallenge(browserBindingSecret: string): Promise<WebLoginChallenge>
  getWebLoginChallenge(id: string, browserBindingSecret: string): Promise<WebLoginChallengeStatus | null>
  approveWebLoginChallenge(input: { id?: string; challengeToken?: string; shortCode?: string; userId: string }): Promise<WebLoginChallengeStatus>
  consumeWebLoginChallenge(id: string, browserBindingSecret: string): Promise<{ userId: string; token: string; displayName: string }>
}

const projectIds = { design: '00000000-0000-4000-8000-000000000001', methods: '00000000-0000-4000-8000-000000000002' } as const
const plusMinutes = (date: Date, minutes: number) => new Date(date.getTime() + minutes * 60_000)
const hashSecret = (value: string): string => createHash('sha256').update(value).digest('hex')

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
  private semester: SemesterConfigResponse | null = null
  private readonly fixedStudents = new Map<string, FixedStudent>()
  private readonly studentByUser = new Map<string, string>()
  private readonly providerIdentities = new Map<string, { userId: string; provider: 'WECHAT_MINIPROGRAM' | 'CASDOOR'; providerSubject: string }>()
  private readonly userDisplayNames = new Map<string, string>()
  private readonly electiveEnrollments = new Set<string>()
  private readonly fixedSessions = new Map<string, FixedSession>()
  private readonly miniSessions = new Map<string, { userId: string; expiresAt: number }>()
  private readonly webSessions = new Map<string, { userId: string; identityProvider: IdentityProvider; displayName: string; expiresAt: number }>()
  private readonly webChallenges = new Map<string, { challengeHash: string; shortCodeHash: string; browserBindingHash: string; status: WebLoginChallengeStatus['status']; approvedUserId: string | null; approvedAt: number | null; expiresAt: number }>()
  public constructor() {
    for (const projectId of Object.values(projectIds)) {
      this.members.set(projectId, [{ id: crypto.randomUUID(), projectId, userId: '00000000-0000-4000-8000-000000000011', displayName: 'Dev Student', externalCode: null }])
    }
  }
  listIdentityProviders(userId: string): Promise<readonly ('WECHAT_MINIPROGRAM' | 'CASDOOR')[]> { return Promise.resolve([...this.providerIdentities.values()].filter((identity) => identity.userId === userId).map((identity) => identity.provider)) }
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
    const fixed = [...this.fixedSessions.values()].filter((item) => item.summary.projectId === projectId).map((item) => refreshSessionStatus(item.summary, now))
    const generated = [...this.generated.values()].flat().filter((item) => item.projectId === projectId).map((item) => refreshSessionStatus(item, now))
    return Promise.resolve(project && (project.id === projectIds.design || project.id === projectIds.methods) ? this.sessionsFor(projectId, now) : [...generated, ...fixed])
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
  getSession(id: string, now = new Date()): Promise<SessionSummary | null> { return Promise.resolve(this.projects.flatMap((project) => this.sessionsFor(project.id, now)).find((item) => item.id === id) ?? [...this.generated.values()].flat().map((item) => refreshSessionStatus(item, now)).find((item) => item.id === id) ?? [...this.fixedSessions.values()].map((item) => refreshSessionStatus(item.summary, now)).find((item) => item.id === id) ?? null) }
  getToday(userId: string, now = new Date()): Promise<TodayResponse> { const all = [...this.projects.flatMap((project) => project.id === projectIds.design || project.id === projectIds.methods ? this.sessionsFor(project.id, now) : [...this.generated.values()].flat().filter((item) => item.projectId === project.id).map((item) => refreshSessionStatus(item, now))), ...[...this.fixedSessions.values()].map((item) => refreshSessionStatus(item.summary, now))].filter((item) => this.members.get(item.projectId)?.some((member) => member.userId === userId) ?? false); return Promise.resolve({ serverTime: now.toISOString(), activeCheckin: all.find((item) => item.status === 'CHECKIN_OPEN' || item.status === 'IN_PROGRESS') ?? null, nextSession: all.find((item) => item.status === 'UPCOMING') ?? null, todaySessions: all }) }
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
  getTimetable(userId: string, now = new Date()): Promise<TimetableResponse> { const items = [...this.projects.flatMap((project) => project.id === projectIds.design || project.id === projectIds.methods ? this.sessionsFor(project.id, now) : [...this.generated.values()].flat().filter((item) => item.projectId === project.id).map((item) => refreshSessionStatus(item, now))), ...[...this.fixedSessions.values()].map((item) => refreshSessionStatus(item.summary, now))].filter((item) => this.members.get(item.projectId)?.some((member) => member.userId === userId) ?? false); return Promise.resolve({ serverTime: now.toISOString(), items }) }
  async checkIn(sessionId: string, userId: string, input: CheckInInput, now = new Date()): Promise<AttendanceRecord> {
    checkInInputSchema.parse(input)
    const sessionValue = await this.getSession(sessionId, now)
    if (!sessionValue) throw new RepositoryError('NOT_FOUND', 'Session not found')
    const fixed = this.fixedSessions.get(sessionId)
    if (fixed && !fixed.started) throw new DomainError('CHECKIN_NOT_OPEN', 'Attendance has not been started by an administrator')
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
  createMiniProgramSession(providerSubject: string): Promise<{ userId: string; token: string; displayName: string }> { return this.createProviderSession('WECHAT_MINIPROGRAM', providerSubject) }
  createProviderSession(provider: 'WECHAT_MINIPROGRAM' | 'CASDOOR', providerSubject: string, displayName = provider === 'WECHAT_MINIPROGRAM' ? '微信用户' : 'X-Lab 用户'): Promise<{ userId: string; token: string; displayName: string }> {
    const key = `${provider}:${providerSubject}`
    const identity = this.providerIdentities.get(key)
    const userId = identity?.userId ?? crypto.randomUUID()
    if (!identity) this.providerIdentities.set(key, { userId, provider, providerSubject })
    const student = this.fixedStudents.get(this.studentByUser.get(userId) ?? '')
    const resolvedName = student?.displayName ?? displayName
    this.userDisplayNames.set(userId, resolvedName)
    const token = crypto.randomUUID() + crypto.randomUUID()
    if (provider === 'WECHAT_MINIPROGRAM') this.miniSessions.set(token, { userId, expiresAt: Date.now() + 30 * 24 * 60 * 60_000 })
    else this.webSessions.set(token, { userId, identityProvider: 'CASDOOR', displayName: resolvedName, expiresAt: Date.now() + 30 * 24 * 60 * 60_000 })
    return Promise.resolve({ userId, token, displayName: resolvedName })
  }
  linkProviderIdentity(userId: string, provider: 'WECHAT_MINIPROGRAM' | 'CASDOOR', providerSubject: string): Promise<void> {
    const key = `${provider}:${providerSubject}`
    const existing = this.providerIdentities.get(key)
    if (existing && existing.userId !== userId) throw new RepositoryError('CONFLICT', 'ACCOUNT_BINDING_CONFLICT')
    this.providerIdentities.set(key, { userId, provider, providerSubject })
    return Promise.resolve()
  }
  resolveMiniProgramSession(token: string): Promise<AuthContext | null> { const value = this.miniSessions.get(token); if (!value || value.expiresAt <= Date.now()) return Promise.resolve(null); return Promise.resolve({ userId: value.userId, displayName: this.fixedStudents.get(this.studentByUser.get(value.userId) ?? '')?.displayName ?? this.userDisplayNames.get(value.userId) ?? '微信用户', identityProvider: 'WECHAT_MINIPROGRAM', sessionType: 'MINI_PROGRAM', capabilities: { canManageProjects: false } }) }

  listWebStudentLoginOptions(): Promise<readonly WebStudentClassOption[]> {
    if (!this.semester) return Promise.resolve([])
    return Promise.resolve(this.semester.classes.map((classValue) => ({ id: classValue.id, classCode: classValue.classCode, name: classValue.name, studentNames: [...this.fixedStudents.values()].filter((student) => student.classId === classValue.id && student.active).map((student) => student.displayName).sort() })))
  }

  createWebStudentSession(classId: string, displayName: string, studentNoLast4: string): Promise<{ userId: string; token: string; displayName: string }> {
    if (!this.semester || !this.semester.classes.some((item) => item.id === classId)) throw new RepositoryError('NOT_FOUND', 'Class not found')
    const student = [...this.fixedStudents.values()].find((item) => item.classId === classId && item.active && item.displayName === displayName && item.studentNo.endsWith(studentNoLast4))
    if (!student) throw new RepositoryError('NOT_FOUND', 'Student verification failed')
    let userId = [...this.studentByUser.entries()].find(([, studentId]) => studentId === student.id)?.[0]
    if (!userId) {
      userId = crypto.randomUUID()
      this.studentByUser.set(userId, student.id)
    }
    this.userDisplayNames.set(userId, student.displayName)
    this.refreshStudentMembership(student)
    const token = crypto.randomUUID() + crypto.randomUUID()
    this.webSessions.set(token, { userId, identityProvider: 'H5_WEB', displayName: student.displayName, expiresAt: Date.now() + 30 * 24 * 60 * 60_000 })
    return Promise.resolve({ userId, token, displayName: student.displayName })
  }

  createAdminWebSession(): Promise<{ userId: string; token: string; displayName: string }> {
    const userId = '00000000-0000-4000-8000-0000000000ad'
    const token = crypto.randomUUID() + crypto.randomUUID()
    this.webSessions.set(token, { userId, identityProvider: 'ADMIN_PASSWORD', displayName: '管理员', expiresAt: Date.now() + 12 * 60 * 60_000 })
    return Promise.resolve({ userId, token, displayName: '管理员' })
  }

  resolveWebSession(token: string): Promise<AuthContext | null> {
    const value = this.webSessions.get(token)
    if (!value || value.expiresAt <= Date.now()) return Promise.resolve(null)
    const student = this.fixedStudents.get(this.studentByUser.get(value.userId) ?? '')
    const admin = value.identityProvider === 'ADMIN_PASSWORD' || value.identityProvider === 'CASDOOR'
    return Promise.resolve({ userId: value.userId, displayName: student?.displayName ?? value.displayName, identityProvider: value.identityProvider, sessionType: 'WEB', capabilities: { canManageProjects: admin } })
  }

  syncSemesterConfig(input: SemesterConfigInput, actor: AuthContext): Promise<SemesterConfigResponse> {
    void actor
    const semesterId = crypto.randomUUID()
    const classValues = input.classes.map((item) => ({ id: crypto.randomUUID(), semesterId, classCode: item.classCode, name: item.name }))
    const classByCode = new Map(classValues.map((item) => [item.classCode, item]))
    const courseValues = input.courses.map((item) => {
      const projectId = crypto.randomUUID()
      const project: ProjectSummary = { id: projectId, name: item.name, description: item.teacher ?? null, type: 'COURSE', timezone: 'Asia/Shanghai', effectiveStartDate: input.startDate, effectiveEndDate: input.endDate, status: 'ACTIVE' }
      this.projects.push(project)
      this.members.set(projectId, [])
      return { id: crypto.randomUUID(), semesterId, projectId, courseCode: item.courseCode, name: item.name, kind: item.kind, teacher: item.teacher ?? null }
    })
    const courseByCode = new Map(courseValues.map((item) => [item.courseCode, item]))
    const timetable = input.timetable.map((item) => ({ id: crypto.randomUUID(), classId: classByCode.get(item.classCode)?.id ?? '', courseId: courseByCode.get(item.courseCode)?.id ?? '', weekday: item.weekday, startPeriod: item.startPeriod, endPeriod: item.endPeriod, classroom: item.classroom ?? null, teacher: item.teacher ?? null, startWeek: item.startWeek, endWeek: item.endWeek, weekPattern: item.weekPattern, specifiedWeeks: item.specifiedWeeks ?? null }))
    if (timetable.some((item) => !item.classId || !item.courseId)) throw new RepositoryError('NOT_FOUND', 'Timetable references an unknown class or course')
    this.semester = { semester: { id: semesterId, code: input.code, name: input.name, startDate: input.startDate, endDate: input.endDate, standardPeriods: [...input.standardPeriods], active: input.active }, classes: classValues, courses: courseValues, timetable }
    const periods = new Map(input.standardPeriods.map((period) => [period.period, period]))
    const addDays = (value: string, days: number) => { const date = new Date(`${value}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10) }
    for (const item of timetable) {
      const course = courseValues.find((value) => value.id === item.courseId)
      if (!course) throw new RepositoryError('NOT_FOUND', 'Timetable references an unknown course')
      const start = periods.get(item.startPeriod)
      const end = periods.get(item.endPeriod)
      if (!start || !end) throw new RepositoryError('NOT_FOUND', 'Timetable references an unknown period')
      const generated = generateWeeklySessionTimes({ timezone: 'Asia/Shanghai', startDate: addDays(input.startDate, (item.startWeek - 1) * 7), endDate: addDays(input.startDate, item.endWeek * 7 - 1), weekdays: [item.weekday], intervalWeeks: item.weekPattern === 'ALL' ? 1 : 2, startTime: start.startTime, endTime: end.endTime })
      for (const occurrence of generated) {
        if ((item.weekPattern === 'ODD' && Math.ceil((new Date(`${occurrence.localDate}T00:00:00Z`).getTime() - new Date(`${input.startDate}T00:00:00Z`).getTime()) / 604800000) % 2 !== 0) || (item.weekPattern === 'EVEN' && Math.ceil((new Date(`${occurrence.localDate}T00:00:00Z`).getTime() - new Date(`${input.startDate}T00:00:00Z`).getTime()) / 604800000) % 2 === 0)) continue
        const id = crypto.randomUUID()
        this.fixedSessions.set(id, { summary: session(id, { id: course.projectId, name: course.name, description: null, type: 'COURSE', timezone: 'Asia/Shanghai', effectiveStartDate: input.startDate, effectiveEndDate: input.endDate, status: 'ACTIVE' }, occurrence.scheduledStartAt, occurrence.scheduledEndAt, occurrence.scheduledStartAt, occurrence.scheduledEndAt, new Date()), courseId: course.id, classId: item.classId, started: false, finalized: false })
      }
    }
    for (const student of this.fixedStudents.values()) this.refreshStudentMembership(student)
    return Promise.resolve(this.semester)
  }

  private refreshStudentMembership(student: FixedStudent): void {
    if (!this.semester) return
    const selected = (courseId: string) => this.electiveEnrollments.has(`${student.id}:${courseId}`)
    for (const course of this.semester.courses) {
      const offered = this.semester.timetable.some((item) => item.classId === student.classId && item.courseId === course.id)
      if (!offered || (course.kind === 'ELECTIVE' && !selected(course.id))) continue
      const projectId = course.projectId!
      const members = this.members.get(projectId) ?? []
      const existing = members.find((member) => member.externalCode === student.studentNo)
      const userId = [...this.studentByUser.entries()].find(([, studentId]) => studentId === student.id)?.[0] ?? null
      if (existing) { existing.userId = userId; continue }
      members.push({ id: crypto.randomUUID(), projectId, userId, displayName: student.displayName, externalCode: student.studentNo })
      this.members.set(projectId, members)
    }
  }

  getOnboarding(userId: string): Promise<OnboardingResponse> {
    const studentId = this.studentByUser.get(userId)
    const student = studentId ? this.fixedStudents.get(studentId) ?? null : null
    const selectedCourseIds = student ? [...this.electiveEnrollments].filter((value) => value.startsWith(`${student.id}:`)).map((value) => value.slice(student.id.length + 1)) : []
    const semester = this.semester
    return Promise.resolve({ status: student ? (selectedCourseIds.length || !(semester?.courses.some((course) => course.kind === 'ELECTIVE') ?? false) ? 'READY' : 'NEEDS_ELECTIVES') : 'NEEDS_BINDING', classOptions: semester?.classes ?? [], student: student ? { id: student.id, displayName: student.displayName, classId: student.classId } : null, electiveCourses: semester?.courses.filter((course) => course.kind === 'ELECTIVE') ?? [], selectedCourseIds })
  }

  async verifyStudent(userId: string, classId: string, displayName: string, studentNoLast4: string): Promise<OnboardingResponse> {
    if (!this.semester || !this.semester.classes.some((item) => item.id === classId)) throw new RepositoryError('NOT_FOUND', 'Class not found')
    const existingUser = this.studentByUser.get(userId)
    if (existingUser) return this.getOnboarding(userId)
    const student = [...this.fixedStudents.values()].find((item) => item.classId === classId && item.active && item.displayName === displayName && item.studentNo.endsWith(studentNoLast4))
    if (!student) throw new RepositoryError('NOT_FOUND', 'Student verification failed')
    const existingBindingUser = [...this.studentByUser.entries()].find(([, studentId]) => studentId === student.id)?.[0]
    if (existingBindingUser && existingBindingUser !== userId) throw new RepositoryError('CONFLICT', 'ACCOUNT_BINDING_CONFLICT')
    this.studentByUser.set(userId, student.id)
    this.userDisplayNames.set(userId, student.displayName)
    this.refreshStudentMembership(student)
    return this.getOnboarding(userId)
  }

  async enrollElectives(userId: string, courseIds: readonly string[]): Promise<OnboardingResponse> {
    const studentId = this.studentByUser.get(userId)
    if (!studentId || !this.semester) throw new RepositoryError('NOT_FOUND', 'Student binding is required')
    const allowed = new Set(this.semester.courses.filter((course) => course.kind === 'ELECTIVE').map((course) => course.id))
    if (courseIds.some((courseId) => !allowed.has(courseId))) throw new RepositoryError('NOT_FOUND', 'Course is not an elective in the active semester')
    for (const courseId of courseIds) this.electiveEnrollments.add(`${studentId}:${courseId}`)
    this.refreshStudentMembership(this.fixedStudents.get(studentId)!)
    return this.getOnboarding(userId)
  }

  async startAttendance(sessionId: string, durationMinutes: number, actor: AuthContext, now = new Date()): Promise<SessionSummary> {
    void actor
    const fixed = this.fixedSessions.get(sessionId)
    if (!fixed) { const value = await this.getSession(sessionId, now); if (!value) throw new RepositoryError('NOT_FOUND', 'Session not found'); return { ...value, checkInOpenAt: now.toISOString(), checkInCloseAt: plusMinutes(now, durationMinutes).toISOString() } }
    if (fixed.started) return fixed.summary
    fixed.started = true
    fixed.summary = { ...fixed.summary, checkInOpenAt: now.toISOString(), checkInCloseAt: plusMinutes(now, durationMinutes).toISOString(), status: deriveSessionStatus({ now, startAt: new Date(fixed.summary.scheduledStartAt), endAt: new Date(fixed.summary.scheduledEndAt), checkInOpenAt: now, checkInCloseAt: plusMinutes(now, durationMinutes) }) }
    return fixed.summary
  }

  async getLiveAttendance(sessionId: string, now = new Date()): Promise<AttendanceLiveResponse> {
    const current = await this.getSession(sessionId, now)
    if (!current) throw new RepositoryError('NOT_FOUND', 'Session not found')
    const records = [...await this.listAttendance(sessionId)]
    const roster = this.members.get(current.projectId) ?? []
    const total = this.fixedSessions.get(sessionId) ? roster.length : records.length
    const active = records.filter((record) => !record.voidedAt)
    const recordByMember = new Map(active.map((record) => [record.projectMemberId, record]))
    const members = roster.map((member) => { const record = recordByMember.get(member.id); return { projectMemberId: member.id, userId: member.userId, displayName: member.displayName, externalCode: member.externalCode, status: record ? record.status : 'PENDING' as const, checkedInAt: record?.checkedInAt ?? null } })
    return { session: current, total, present: active.filter((record) => record.status === 'PRESENT').length, late: active.filter((record) => record.status === 'LATE').length, leave: active.filter((record) => record.status === 'LEAVE').length, absent: active.filter((record) => record.status === 'ABSENT').length, pending: Math.max(0, total - active.length), records, members }
  }

  async updateAttendance(sessionId: string, input: AttendanceAdminActionInput, actor: AuthContext, now = new Date()): Promise<AttendanceRecord> {
    const current = await this.getSession(sessionId, now)
    if (!current) throw new RepositoryError('NOT_FOUND', 'Session not found')
    const member = (await this.listMembers(current.projectId)).find((item) => item.id === input.projectMemberId)
    if (!member) throw new RepositoryError('NOT_FOUND', 'Project member not found')
    const key = `${sessionId}:${member.id}`
    const existing = this.attendance.get(key)
    if (input.status === 'VOID' && !existing) throw new RepositoryError('NOT_FOUND', 'Attendance record not found')
    if (input.status === 'VOID' && existing?.voidedAt) return existing
    const record: AttendanceRecord = input.status === 'VOID' ? { ...existing!, voidedAt: now.toISOString(), voidedByUserId: actor.userId, updatedAt: now.toISOString() } : { ...(existing ?? { id: crypto.randomUUID(), sessionId, projectMemberId: member.id, userId: member.userId, checkedInAt: null, method: 'MANUAL' as const, createdByUserId: actor.userId, createdAt: now.toISOString(), voidedAt: null, voidedByUserId: null, distanceMeters: null, accuracyMeters: null, locationPassed: null }), status: input.status, source: 'ADMIN', updatedAt: now.toISOString(), voidedAt: null, voidedByUserId: null }
    this.attendance.set(key, record)
    return record
  }

  async finalizeAttendance(sessionId: string, actor: AuthContext, now = new Date()): Promise<AttendanceLiveResponse> {
    const current = await this.getSession(sessionId, now)
    if (!current) throw new RepositoryError('NOT_FOUND', 'Session not found')
    for (const member of await this.listMembers(current.projectId)) {
      if (!this.attendance.has(`${sessionId}:${member.id}`)) await this.updateAttendance(sessionId, { projectMemberId: member.id, status: 'ABSENT' }, actor, now)
    }
    const fixed = this.fixedSessions.get(sessionId)
    if (fixed) fixed.finalized = true
    return this.getLiveAttendance(sessionId, now)
  }

  async exportAttendanceCsv(sessionId: string): Promise<string> {
    const current = await this.getSession(sessionId)
    if (!current) throw new RepositoryError('NOT_FOUND', 'Session not found')
    const rows = ['姓名,学号,班级,课程,日期,应到时间,签到时间,状态,来源']
    for (const record of await this.listAttendance(sessionId)) {
      const member = (await this.listMembers(current.projectId)).find((item) => item.id === record.projectMemberId)
      rows.push([member?.displayName ?? '', member?.externalCode ?? '', '', current.projectName, current.scheduledStartAt.slice(0, 10), current.scheduledStartAt, record.checkedInAt ?? '', record.status, record.source].map((value) => `"${String(value).replaceAll('"', '""')}"`).join(','))
    }
    return `\uFEFF${rows.join('\n')}\n`
  }

  createWebLoginChallenge(browserBindingSecret: string): Promise<WebLoginChallenge> {
    const id = crypto.randomUUID()
    const challengeToken = randomBytes(32).toString('base64url')
    const shortCode = String(1000 + Math.floor(Math.random() * 9000))
    const expiresAt = Date.now() + 2 * 60_000
    this.webChallenges.set(id, { challengeHash: hashSecret(challengeToken), shortCodeHash: hashSecret(shortCode), browserBindingHash: hashSecret(browserBindingSecret), status: 'PENDING', approvedUserId: null, approvedAt: null, expiresAt })
    return Promise.resolve({ id, challengeToken, shortCode, expiresAt: new Date(expiresAt).toISOString(), status: 'PENDING' })
  }

  getWebLoginChallenge(id: string, browserBindingSecret: string): Promise<WebLoginChallengeStatus | null> {
    const value = this.webChallenges.get(id)
    if (!value || value.browserBindingHash !== hashSecret(browserBindingSecret)) return Promise.resolve(null)
    if (value.status === 'PENDING' && value.expiresAt <= Date.now()) value.status = 'EXPIRED'
    return Promise.resolve({ id, status: value.status, expiresAt: new Date(value.expiresAt).toISOString(), approvedAt: value.approvedAt ? new Date(value.approvedAt).toISOString() : null })
  }

  approveWebLoginChallenge(input: { id?: string; challengeToken?: string; shortCode?: string; userId: string }): Promise<WebLoginChallengeStatus> {
    const value = input.id ? this.webChallenges.get(input.id) : [...this.webChallenges.values()].find((item) => input.challengeToken ? item.challengeHash === hashSecret(input.challengeToken) : item.shortCodeHash === hashSecret(input.shortCode ?? ''))
    const id = input.id ?? [...this.webChallenges.entries()].find(([, item]) => item === value)?.[0]
    if (!value || !id || value.status !== 'PENDING' || value.expiresAt <= Date.now()) throw new RepositoryError('NOT_FOUND', 'Challenge is invalid or expired')
    if (input.id && (!input.challengeToken || value.challengeHash !== hashSecret(input.challengeToken))) throw new RepositoryError('NOT_FOUND', 'Challenge is invalid or expired')
    value.status = 'APPROVED'; value.approvedUserId = input.userId; value.approvedAt = Date.now()
    return Promise.resolve({ id, status: value.status, expiresAt: new Date(value.expiresAt).toISOString(), approvedAt: new Date(value.approvedAt).toISOString() })
  }

  consumeWebLoginChallenge(id: string, browserBindingSecret: string): Promise<{ userId: string; token: string; displayName: string }> {
    const value = this.webChallenges.get(id)
    if (!value || value.browserBindingHash !== hashSecret(browserBindingSecret) || value.status !== 'APPROVED' || !value.approvedUserId) throw new RepositoryError('NOT_FOUND', 'Challenge is not ready')
    value.status = 'CONSUMED'
    const userId = value.approvedUserId
    const student = this.fixedStudents.get(this.studentByUser.get(userId) ?? '')
    const displayName = student?.displayName ?? this.userDisplayNames.get(userId) ?? '微信用户'
    const token = crypto.randomUUID() + crypto.randomUUID()
    this.webSessions.set(token, { userId, identityProvider: 'WECHAT_MINIPROGRAM', displayName, expiresAt: Date.now() + 30 * 24 * 60 * 60_000 })
    return Promise.resolve({ userId, token, displayName })
  }

  importRoster(_semesterCode: string, entries: readonly RosterEntry[], actor: AuthContext): Promise<RosterImportResult> {
    void actor
    if (!this.semester) throw new RepositoryError('NOT_FOUND', 'Semester configuration is required')
    let imported = 0; let skipped = 0; let conflicts = 0
    for (const entry of entries) {
      const classValue = this.semester.classes.find((item) => item.classCode === entry.classCode)
      if (!classValue) throw new RepositoryError('NOT_FOUND', 'Roster references an unknown class')
      const current = [...this.fixedStudents.values()].find((item) => item.studentNo === entry.studentNo)
      if (current && current.classId === classValue.id && current.displayName === entry.displayName) { skipped += 1; continue }
      if (current) { conflicts += 1; continue }
      const student = { id: crypto.randomUUID(), studentNo: entry.studentNo, displayName: entry.displayName, classId: classValue.id, active: true }
      student.displayName = entry.displayName; student.classId = classValue.id; student.active = true
      this.fixedStudents.set(student.id, student)
      this.refreshStudentMembership(student)
      imported += 1
    }
    return Promise.resolve({ imported, skipped, conflicts })
  }
}
