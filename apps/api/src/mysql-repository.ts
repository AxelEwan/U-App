import { checkInInputSchema, createProjectMemberInputSchema } from '@qzu/contracts'
import type {
  AttendancePolicy,
  AttendanceRecord,
  CheckInInput,
  CreateAttendancePolicyInput,
  CreateProjectInput,
  CreateProjectMemberInput,
  CreateScheduleRuleInput,
  GenerateSessionsInput,
  SemesterConfigInput,
  SemesterConfigResponse,
  OnboardingResponse,
  AttendanceAdminActionInput,
  AttendanceLiveResponse,
  RosterEntry,
  ProjectSummary,
  ProjectMember,
  ScheduleRule,
  SessionSummary,
  TodayResponse,
  TimetableResponse,
  UpdateProjectInput,
  UpdateScheduleRuleInput,
  WebStudentClassOption,
} from '@qzu/contracts'
import { DomainError, assertAttendanceEligible, deriveSessionStatus, generateWeeklySessionTimes } from '@qzu/core'
import { createDatabase, attendanceAuditLogs, attendancePolicies, attendanceRecords, classTimetable, classes as classTable, courses, eventSessions, miniProgramAuthSessions, projectAdmins, projectMembers, projects, scheduleRules, semesterConfigs, studentBindings, studentCourseEnrollments, students, userIdentities, users, webAuthSessions, webLoginChallenges } from '@qzu/db'
import { and, asc, eq, like, sql } from 'drizzle-orm'
import { createHash, randomBytes } from 'node:crypto'

import { RepositoryError, type BusinessRepository, type WebLoginChallenge, type WebLoginChallengeStatus } from './repository'
import type { AuthContext } from '@qzu/auth'

type MySqlDatabase = ReturnType<typeof createDatabase>['db']
type ProjectRow = typeof projects.$inferSelect
type SessionRow = typeof eventSessions.$inferSelect
type RuleRow = typeof scheduleRules.$inferSelect
type PolicyRow = typeof attendancePolicies.$inferSelect
type MemberRow = typeof projectMembers.$inferSelect
type AttendanceRow = typeof attendanceRecords.$inferSelect

const toRepositoryError = (): RepositoryError => new RepositoryError('DATABASE_UNAVAILABLE', 'Database is temporarily unavailable')
const mapProject = (row: ProjectRow): ProjectSummary => ({ id: row.id, name: row.name, description: row.description, type: row.type, timezone: row.timezone, effectiveStartDate: row.effectiveStartDate, effectiveEndDate: row.effectiveEndDate, status: row.status })
const mapRule = (row: RuleRow): ScheduleRule => ({ id: row.id, projectId: row.projectId, weekdays: row.weekdays, everyNWeeks: row.intervalWeeks, localStartTime: row.localStartTime, localEndTime: row.localEndTime, effectiveStartDate: row.startDate, effectiveEndDate: row.endDate, timezone: row.timezone })
const mapPolicy = (row: PolicyRow): AttendancePolicy => ({ id: row.id, projectId: row.projectId, rosterMode: row.rosterMode, checkInOpenMinutesBefore: row.checkInOpenMinutesBefore, checkInCloseMinutesAfter: row.checkInCloseMinutesAfter, locationEnabled: row.requireLocation, locationName: row.locationName, centerLatitude: row.centerLatitude === null ? null : Number(row.centerLatitude), centerLongitude: row.centerLongitude === null ? null : Number(row.centerLongitude), radiusMeters: row.radiusMeters, passcodeEnabled: row.requirePasscode })
const mapMember = (row: MemberRow): ProjectMember => ({ id: row.id, projectId: row.projectId, userId: row.userId, displayName: row.displayName, externalCode: row.externalCode })
const mapAttendance = (row: AttendanceRow): AttendanceRecord => ({ id: row.id, sessionId: row.sessionId, projectMemberId: row.projectMemberId, userId: row.userId, checkedInAt: row.checkedInAt?.toISOString() ?? null, method: row.method, source: row.source, status: row.status, distanceMeters: row.distanceMeters === null ? null : Number(row.distanceMeters), accuracyMeters: row.accuracyMeters === null ? null : Number(row.accuracyMeters), locationPassed: row.locationPassed, createdByUserId: row.createdByUserId, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), voidedAt: row.voidedAt?.toISOString() ?? null, voidedByUserId: row.voidedByUserId })
const localDateKey = (value: Date, timeZone: string): string => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(value)

function mapSession(row: SessionRow, project: ProjectSummary, now: Date): SessionSummary {
  return { id: row.id, projectId: row.projectId, projectName: project.name, scheduledStartAt: row.scheduledStartAt.toISOString(), scheduledEndAt: row.scheduledEndAt.toISOString(), checkInOpenAt: row.checkinOpenAt.toISOString(), checkInCloseAt: row.checkinCloseAt.toISOString(), locationName: row.locationName, status: deriveSessionStatus({ now, startAt: row.scheduledStartAt, endAt: row.scheduledEndAt, checkInOpenAt: row.checkinOpenAt, checkInCloseAt: row.checkinCloseAt }) }
}

export class MySqlBusinessRepository implements BusinessRepository {
  public constructor(private readonly db: MySqlDatabase) {}
  async listIdentityProviders(userId: string): Promise<readonly ('WECHAT_MINIPROGRAM' | 'CASDOOR')[]> {
    try { return (await this.db.select({ provider: userIdentities.provider }).from(userIdentities).where(eq(userIdentities.userId, userId))).map((row) => row.provider) } catch { throw toRepositoryError() }
  }

  async listProjects(): Promise<readonly ProjectSummary[]> { try { return (await this.db.select().from(projects).orderBy(asc(projects.createdAt))).map(mapProject) } catch { throw toRepositoryError() } }
  async createProject(input: CreateProjectInput, actor: AuthContext): Promise<ProjectSummary> {
    try {
      const value = input
      const projectId = crypto.randomUUID()
      await this.db.transaction(async (tx) => {
        await tx.insert(users).values({ id: actor.userId, displayName: actor.displayName ?? actor.userId, avatarUrl: actor.avatarUrl ?? null }).onDuplicateKeyUpdate({ set: { displayName: actor.displayName ?? actor.userId, avatarUrl: actor.avatarUrl ?? null } })
        await tx.insert(projects).values({ id: projectId, name: value.name, description: value.description ?? null, type: value.type, timezone: value.timezone, effectiveStartDate: value.effectiveStartDate, effectiveEndDate: value.effectiveEndDate ?? null, status: 'DRAFT', createdBy: actor.userId })
        await tx.insert(projectAdmins).values({ id: crypto.randomUUID(), projectId, userId: actor.userId, role: 'OWNER' }).onDuplicateKeyUpdate({ set: { role: 'OWNER' } })
      })
      const created = (await this.db.select().from(projects).where(eq(projects.id, projectId)).limit(1))[0]
      if (!created) throw toRepositoryError()
      return mapProject(created)
    } catch (error) { if (error instanceof RepositoryError) throw error; throw toRepositoryError() }
  }
  async updateProject(id: string, input: UpdateProjectInput): Promise<ProjectSummary | null> {
    try { await this.db.update(projects).set(input).where(eq(projects.id, id)); const row = (await this.db.select().from(projects).where(eq(projects.id, id)).limit(1))[0]; return row ? mapProject(row) : null } catch { throw toRepositoryError() }
  }
  async getProject(id: string): Promise<ProjectSummary | null> { try { const row = (await this.db.select().from(projects).where(eq(projects.id, id)).limit(1))[0]; return row ? mapProject(row) : null } catch { throw toRepositoryError() } }
  async listScheduleRules(projectId: string): Promise<readonly ScheduleRule[]> { try { return (await this.db.select().from(scheduleRules).where(eq(scheduleRules.projectId, projectId))).map(mapRule) } catch { throw toRepositoryError() } }
  async createScheduleRule(projectId: string, input: CreateScheduleRuleInput): Promise<ScheduleRule> {
    try { const id = crypto.randomUUID(); await this.db.insert(scheduleRules).values({ id, projectId, weekdays: [...input.weekdays], intervalWeeks: input.everyNWeeks, localStartTime: input.localStartTime, localEndTime: input.localEndTime, startDate: input.effectiveStartDate, endDate: input.effectiveEndDate, timezone: input.timezone }); const row = (await this.db.select().from(scheduleRules).where(eq(scheduleRules.id, id)).limit(1))[0]; if (!row) throw toRepositoryError(); return mapRule(row) } catch (error) { if (error instanceof RepositoryError) throw error; throw toRepositoryError() }
  }
  async updateScheduleRule(id: string, input: UpdateScheduleRuleInput): Promise<ScheduleRule | null> {
    try { await this.db.update(scheduleRules).set({ ...(input.weekdays ? { weekdays: [...input.weekdays] } : {}), ...(input.everyNWeeks ? { intervalWeeks: input.everyNWeeks } : {}), ...(input.localStartTime ? { localStartTime: input.localStartTime } : {}), ...(input.localEndTime ? { localEndTime: input.localEndTime } : {}), ...(input.effectiveStartDate ? { startDate: input.effectiveStartDate } : {}), ...(input.effectiveEndDate ? { endDate: input.effectiveEndDate } : {}), ...(input.timezone ? { timezone: input.timezone } : {}) }).where(eq(scheduleRules.id, id)); const row = (await this.db.select().from(scheduleRules).where(eq(scheduleRules.id, id)).limit(1))[0]; return row ? mapRule(row) : null } catch { throw toRepositoryError() }
  }
  async listSessions(projectId: string, now = new Date()): Promise<readonly SessionSummary[]> { try { const project = await this.getProject(projectId); if (!project) return []; return (await this.db.select().from(eventSessions).where(eq(eventSessions.projectId, projectId)).orderBy(asc(eventSessions.scheduledStartAt))).map((row) => mapSession(row, project, now)) } catch (error) { if (error instanceof RepositoryError) throw error; throw toRepositoryError() } }
  async generateSessions(projectId: string, input: GenerateSessionsInput): Promise<readonly SessionSummary[]> {
    try {
      const ruleId = input.scheduleRuleId
      const rule = (await this.db.select().from(scheduleRules).where(eq(scheduleRules.id, ruleId)).limit(1))[0]
      const project = await this.getProject(projectId)
      if (!rule || !project || rule.projectId !== projectId) return []
      const policy = (await this.db.select().from(attendancePolicies).where(eq(attendancePolicies.projectId, projectId)).limit(1))[0]
      const openBefore = policy?.checkInOpenMinutesBefore ?? 15
      const closeAfter = policy?.checkInCloseMinutesAfter ?? 15
      const generated = generateWeeklySessionTimes({ timezone: rule.timezone, startDate: rule.startDate, endDate: rule.endDate, weekdays: rule.weekdays, intervalWeeks: rule.intervalWeeks, startTime: rule.localStartTime, endTime: rule.localEndTime })
      await this.db.transaction(async (tx) => {
        for (const item of generated) {
          await tx.insert(eventSessions).values({ id: crypto.randomUUID(), projectId, scheduleRuleId: rule.id, scheduledStartAt: item.scheduledStartAt, scheduledEndAt: item.scheduledEndAt, checkinOpenAt: new Date(item.scheduledStartAt.getTime() - openBefore * 60_000), checkinCloseAt: new Date(item.scheduledEndAt.getTime() + closeAfter * 60_000), locationName: policy?.locationName ?? null, status: 'SCHEDULED' }).onDuplicateKeyUpdate({ set: { scheduledStartAt: sql`scheduled_start_at` } })
        }
      })
      return this.listSessions(projectId)
    } catch (error) { if (error instanceof RepositoryError) throw error; throw toRepositoryError() }
  }
  async getSession(id: string, now = new Date()): Promise<SessionSummary | null> { try { const row = (await this.db.select().from(eventSessions).where(eq(eventSessions.id, id)).limit(1))[0]; if (!row) return null; const project = await this.getProject(row.projectId); return project ? mapSession(row, project, now) : null } catch (error) { if (error instanceof RepositoryError) throw error; throw toRepositoryError() } }
  async getToday(userId: string, now = new Date()): Promise<TodayResponse> {
    try {
      const memberships = await this.db.select({ projectId: projectMembers.projectId }).from(projectMembers).where(eq(projectMembers.userId, userId))
      const projectsForUser = await Promise.all([...new Set(memberships.map((item) => item.projectId))].map(async (projectId) => {
        const project = await this.getProject(projectId)
        const sessions = project ? await this.listSessions(projectId, now) : []
        return project ? { project, sessions } : null
      }))
      const todaySessions = projectsForUser.flatMap((value) => value?.sessions.filter((item) => localDateKey(new Date(item.scheduledStartAt), value.project.timezone) === localDateKey(now, value.project.timezone)) ?? []).sort((a, b) => a.scheduledStartAt.localeCompare(b.scheduledStartAt))
      return { serverTime: now.toISOString(), activeCheckin: todaySessions.find((item) => item.status === 'CHECKIN_OPEN' || item.status === 'IN_PROGRESS') ?? null, nextSession: todaySessions.find((item) => item.status === 'UPCOMING') ?? null, todaySessions }
    } catch (error) { if (error instanceof RepositoryError) throw error; throw toRepositoryError() }
  }
  async listMembers(projectId: string): Promise<readonly ProjectMember[]> { try { return (await this.db.select().from(projectMembers).where(eq(projectMembers.projectId, projectId)).orderBy(asc(projectMembers.createdAt))).map(mapMember) } catch { throw toRepositoryError() } }
  async createMember(projectId: string, input: CreateProjectMemberInput): Promise<ProjectMember> {
    try {
      const project = await this.getProject(projectId)
      if (!project) throw new RepositoryError('NOT_FOUND', 'Project not found')
      const value = createProjectMemberInputSchema.parse(input)
      if (value.userId) {
        const existing = (await this.db.select().from(projectMembers).where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, value.userId))).limit(1))[0]
        if (existing) return mapMember(existing)
        await this.db.insert(users).values({ id: value.userId, displayName: value.displayName, avatarUrl: null }).onDuplicateKeyUpdate({ set: { displayName: value.displayName } })
      }
      const id = crypto.randomUUID()
      await this.db.insert(projectMembers).values({ id, projectId, userId: value.userId ?? null, displayName: value.displayName, externalCode: value.externalCode ?? null })
      const row = (await this.db.select().from(projectMembers).where(eq(projectMembers.id, id)).limit(1))[0]
      if (!row) throw toRepositoryError()
      return mapMember(row)
    } catch (error) { if (error instanceof RepositoryError) throw error; throw toRepositoryError() }
  }
  async getMemberForUser(projectId: string, userId: string): Promise<ProjectMember | null> { try { const row = (await this.db.select().from(projectMembers).where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId))).limit(1))[0]; return row ? mapMember(row) : null } catch { throw toRepositoryError() } }
  async getTimetable(userId: string, now = new Date()): Promise<TimetableResponse> {
    try {
      const memberships = await this.db.select({ projectId: projectMembers.projectId }).from(projectMembers).where(eq(projectMembers.userId, userId))
      const items = (await Promise.all([...new Set(memberships.map((item) => item.projectId))].map((projectId) => this.listSessions(projectId, now)))).flat().sort((a, b) => a.scheduledStartAt.localeCompare(b.scheduledStartAt))
      return { serverTime: now.toISOString(), items }
    } catch (error) { if (error instanceof RepositoryError) throw error; throw toRepositoryError() }
  }
  private async readSemesterConfig(semesterId: string): Promise<SemesterConfigResponse> {
    const semester = (await this.db.select().from(semesterConfigs).where(eq(semesterConfigs.id, semesterId)).limit(1))[0]
    if (!semester) throw new RepositoryError('NOT_FOUND', 'Semester configuration not found')
    const classRows = await this.db.select().from(classTable).where(eq(classTable.semesterId, semesterId))
    const courseRows = await this.db.select().from(courses).where(eq(courses.semesterId, semesterId))
    const timetableRows = (await Promise.all(classRows.map((item) => this.db.select().from(classTimetable).where(eq(classTimetable.classId, item.id))))).flat()
    return {
      semester: { id: semester.id, code: semester.code, name: semester.name, startDate: semester.startDate, endDate: semester.endDate, standardPeriods: [...semester.standardPeriods], active: semester.active },
      classes: classRows.map((item) => ({ id: item.id, semesterId: item.semesterId, classCode: item.classCode, name: item.name })),
      courses: courseRows.map((item) => ({ id: item.id, semesterId: item.semesterId, projectId: item.projectId, courseCode: item.courseCode, name: item.name, kind: item.kind, teacher: item.teacher })),
      timetable: timetableRows.map((item) => ({ id: item.id, classId: item.classId, courseId: item.courseId, weekday: item.weekday, startPeriod: item.startPeriod, endPeriod: item.endPeriod, classroom: item.classroom, teacher: item.teacher, startWeek: item.startWeek, endWeek: item.endWeek, weekPattern: item.weekPattern, specifiedWeeks: item.specifiedWeeks ? [...item.specifiedWeeks] : null })),
    }
  }
  async checkIn(sessionId: string, userId: string, input: CheckInInput, now = new Date()): Promise<AttendanceRecord> {
    try {
      checkInInputSchema.parse(input)
      const sessionRow = (await this.db.select().from(eventSessions).where(eq(eventSessions.id, sessionId)).limit(1))[0]
      if (!sessionRow) throw new DomainError('SESSION_NOT_FOUND', 'Session not found')
      if (!sessionRow.attendanceStartedAt) throw new DomainError('CHECKIN_NOT_OPEN', 'Attendance has not been started by an administrator')
      const policy = (await this.db.select().from(attendancePolicies).where(eq(attendancePolicies.projectId, sessionRow.projectId)).limit(1))[0]
      const member = await this.getMemberForUser(sessionRow.projectId, userId)
      const existing = member ? (await this.db.select().from(attendanceRecords).where(and(eq(attendanceRecords.sessionId, sessionId), eq(attendanceRecords.projectMemberId, member.id))).limit(1))[0] : undefined
      assertAttendanceEligible({ now, opensAt: sessionRow.checkinOpenAt, closesAt: sessionRow.checkinCloseAt, rosterMode: policy?.rosterMode ?? 'ROSTER', hasMemberRecord: member !== null, alreadyCheckedIn: existing !== undefined, locationRequired: policy?.requireLocation ?? false, locationPassed: false, passcodeRequired: policy?.requirePasscode ?? false, passcodePassed: false })
      if (!member) throw new DomainError('MEMBER_NOT_ELIGIBLE', 'A project member record is required')
      const checkedInAt = now
      const id = crypto.randomUUID()
      await this.db.insert(attendanceRecords).values({ id, sessionId, projectMemberId: member.id, userId, checkedInAt, method: 'MANUAL', source: 'SELF_CHECKIN', status: now > sessionRow.scheduledStartAt ? 'LATE' : 'PRESENT', distanceMeters: null, accuracyMeters: null, locationPassed: null, createdByUserId: userId, voidedAt: null, voidedByUserId: null, updatedAt: now })
      const row = (await this.db.select().from(attendanceRecords).where(eq(attendanceRecords.id, id)).limit(1))[0]
      if (!row) throw toRepositoryError()
      return mapAttendance(row)
    } catch (error) {
      if (error instanceof RepositoryError || error instanceof DomainError) throw error
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ER_DUP_ENTRY') throw new DomainError('ALREADY_CHECKED_IN', 'Attendance has already been recorded')
      throw toRepositoryError()
    }
  }
  async listAttendance(sessionId: string): Promise<readonly AttendanceRecord[]> { try { return (await this.db.select().from(attendanceRecords).where(eq(attendanceRecords.sessionId, sessionId)).orderBy(asc(attendanceRecords.createdAt))).map(mapAttendance) } catch { throw toRepositoryError() } }
  async syncSemesterConfig(input: SemesterConfigInput, actor: AuthContext): Promise<SemesterConfigResponse> {
    try {
      const existing = (await this.db.select({ id: semesterConfigs.id }).from(semesterConfigs).where(eq(semesterConfigs.code, input.code)).limit(1))[0]
      if (existing) return this.readSemesterConfig(existing.id)
      const semesterId = crypto.randomUUID()
      const classIds = new Map<string, string>()
      const courseIds = new Map<string, { id: string; projectId: string }>()
      await this.db.transaction(async (tx) => {
        await tx.insert(semesterConfigs).values({ id: semesterId, code: input.code, name: input.name, startDate: input.startDate, endDate: input.endDate, standardPeriods: [...input.standardPeriods], active: input.active })
        for (const item of input.classes) { const id = crypto.randomUUID(); classIds.set(item.classCode, id); await tx.insert(classTable).values({ id, semesterId, classCode: item.classCode, name: item.name }) }
        await tx.insert(users).values({ id: actor.userId, displayName: actor.displayName ?? actor.userId, avatarUrl: actor.avatarUrl ?? null }).onDuplicateKeyUpdate({ set: { displayName: actor.displayName ?? actor.userId } })
        for (const item of input.courses) {
          const projectId = crypto.randomUUID(); const courseId = crypto.randomUUID(); courseIds.set(item.courseCode, { id: courseId, projectId })
          await tx.insert(projects).values({ id: projectId, name: item.name, description: item.teacher ?? null, type: 'COURSE', timezone: 'Asia/Shanghai', effectiveStartDate: input.startDate, effectiveEndDate: input.endDate, status: 'ACTIVE', createdBy: actor.userId })
          await tx.insert(projectAdmins).values({ id: crypto.randomUUID(), projectId, userId: actor.userId, role: 'OWNER' })
          await tx.insert(courses).values({ id: courseId, semesterId, projectId, courseCode: item.courseCode, name: item.name, kind: item.kind, teacher: item.teacher ?? null })
        }
        const periods = new Map(input.standardPeriods.map((period) => [period.period, period]))
        const addDays = (value: string, days: number) => { const date = new Date(`${value}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10) }
        for (const item of input.timetable) {
          const classId = classIds.get(item.classCode); const course = courseIds.get(item.courseCode); const start = periods.get(item.startPeriod); const end = periods.get(item.endPeriod)
          if (!classId || !course || !start || !end) throw new Error('Invalid timetable reference')
          await tx.insert(classTimetable).values({ id: crypto.randomUUID(), classId, courseId: course.id, weekday: item.weekday, startPeriod: item.startPeriod, endPeriod: item.endPeriod, classroom: item.classroom ?? null, teacher: item.teacher ?? null, startWeek: item.startWeek, endWeek: item.endWeek, weekPattern: item.weekPattern, specifiedWeeks: item.specifiedWeeks ?? null })
          const generated = generateWeeklySessionTimes({ timezone: 'Asia/Shanghai', startDate: addDays(input.startDate, (item.startWeek - 1) * 7), endDate: addDays(input.startDate, item.endWeek * 7 - 1), weekdays: [item.weekday], intervalWeeks: item.weekPattern === 'ALL' ? 1 : 2, startTime: start.startTime, endTime: end.endTime })
          const ruleId = crypto.randomUUID()
          await tx.insert(scheduleRules).values({ id: ruleId, projectId: course.projectId, weekdays: [item.weekday], localStartTime: start.startTime, localEndTime: end.endTime, startDate: addDays(input.startDate, (item.startWeek - 1) * 7), endDate: addDays(input.startDate, item.endWeek * 7 - 1), intervalWeeks: item.weekPattern === 'ALL' ? 1 : 2, timezone: 'Asia/Shanghai' })
          for (const occurrence of generated) await tx.insert(eventSessions).values({ id: crypto.randomUUID(), projectId: course.projectId, scheduleRuleId: ruleId, courseId: course.id, scheduledStartAt: occurrence.scheduledStartAt, scheduledEndAt: occurrence.scheduledEndAt, checkinOpenAt: occurrence.scheduledStartAt, checkinCloseAt: occurrence.scheduledEndAt, locationName: item.classroom ?? null, status: 'SCHEDULED' })
        }
      })
      return this.readSemesterConfig(semesterId)
    } catch (error) { if (error instanceof RepositoryError) throw error; throw toRepositoryError() }
  }
  async getOnboarding(userId: string): Promise<OnboardingResponse> {
    try {
      const semester = (await this.db.select().from(semesterConfigs).where(eq(semesterConfigs.active, true)).orderBy(asc(semesterConfigs.createdAt)).limit(1))[0]
      const classRows = semester ? await this.db.select().from(classTable).where(eq(classTable.semesterId, semester.id)) : []
      const binding = (await this.db.select().from(studentBindings).where(eq(studentBindings.userId, userId)).limit(1))[0]
      const student = binding ? (await this.db.select().from(students).where(eq(students.id, binding.studentId)).limit(1))[0] : undefined
      const electiveRows = semester ? await this.db.select().from(courses).where(and(eq(courses.semesterId, semester.id), eq(courses.kind, 'ELECTIVE'))) : []
      const selected = student ? await this.db.select().from(studentCourseEnrollments).where(eq(studentCourseEnrollments.studentId, student.id)) : []
      const selectedIds = selected.map((item) => item.courseId)
      return { status: student ? (electiveRows.length === 0 || selectedIds.length > 0 ? 'READY' : 'NEEDS_ELECTIVES') : 'NEEDS_BINDING', classOptions: classRows.map((item) => ({ id: item.id, semesterId: item.semesterId, classCode: item.classCode, name: item.name })), student: student ? { id: student.id, displayName: student.displayName, classId: student.classId } : null, electiveCourses: electiveRows.map((item) => ({ id: item.id, semesterId: item.semesterId, projectId: item.projectId, courseCode: item.courseCode, name: item.name, kind: item.kind, teacher: item.teacher })), selectedCourseIds: selectedIds }
    } catch (error) { if (error instanceof RepositoryError) throw error; throw toRepositoryError() }
  }

  async listWebStudentLoginOptions(): Promise<readonly WebStudentClassOption[]> {
    try {
      const semester = (await this.db.select().from(semesterConfigs).where(eq(semesterConfigs.active, true)).orderBy(asc(semesterConfigs.createdAt)).limit(1))[0]
      if (!semester) return []
      const classRows = await this.db.select().from(classTable).where(eq(classTable.semesterId, semester.id))
      return Promise.all(classRows.map(async (classValue) => {
        const roster = await this.db.select({ displayName: students.displayName }).from(students).where(and(eq(students.classId, classValue.id), eq(students.active, true))).orderBy(asc(students.displayName))
        return { id: classValue.id, classCode: classValue.classCode, name: classValue.name, studentNames: roster.map((item) => item.displayName) }
      }))
    } catch { throw toRepositoryError() }
  }

  async createWebStudentSession(classId: string, displayName: string, studentNoLast4: string): Promise<{ userId: string; token: string; displayName: string }> {
    try {
      const match = (await this.db.select().from(students).where(and(eq(students.classId, classId), eq(students.displayName, displayName), eq(students.active, true), like(students.studentNo, `%${studentNoLast4}`))).limit(1))[0]
      if (!match) throw new RepositoryError('NOT_FOUND', 'Student verification failed')
      let userId = ''
      await this.db.transaction(async (tx) => {
        const binding = (await tx.select().from(studentBindings).where(eq(studentBindings.studentId, match.id)).limit(1))[0]
        userId = binding?.userId ?? crypto.randomUUID()
        await tx.insert(users).values({ id: userId, displayName: match.displayName, avatarUrl: null }).onDuplicateKeyUpdate({ set: { displayName: match.displayName } })
        if (!binding) await tx.insert(studentBindings).values({ id: crypto.randomUUID(), studentId: match.id, userId })
        const required = await tx.select({ projectId: courses.projectId }).from(classTimetable).innerJoin(courses, eq(classTimetable.courseId, courses.id)).where(and(eq(classTimetable.classId, classId), eq(courses.kind, 'REQUIRED')))
        for (const item of required) if (item.projectId) {
          const existing = (await tx.select({ id: projectMembers.id }).from(projectMembers).where(and(eq(projectMembers.projectId, item.projectId), eq(projectMembers.externalCode, match.studentNo))).limit(1))[0]
          if (existing) await tx.update(projectMembers).set({ userId, displayName: match.displayName }).where(eq(projectMembers.id, existing.id))
          else await tx.insert(projectMembers).values({ id: crypto.randomUUID(), projectId: item.projectId, userId, displayName: match.displayName, externalCode: match.studentNo })
        }
      })
      const token = crypto.randomUUID() + crypto.randomUUID()
      await this.db.insert(webAuthSessions).values({ id: crypto.randomUUID(), userId, tokenHash: createHash('sha256').update(token).digest('hex'), authMethod: 'H5_STUDENT', expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60_000), revokedAt: null, lastSeenAt: new Date() })
      return { userId, token, displayName: match.displayName }
    } catch (error) { if (error instanceof RepositoryError) throw error; throw toRepositoryError() }
  }

  async createAdminWebSession(): Promise<{ userId: string; token: string; displayName: string }> {
    try {
      const userId = '00000000-0000-4000-8000-0000000000ad'
      await this.db.insert(users).values({ id: userId, displayName: '管理员', avatarUrl: null }).onDuplicateKeyUpdate({ set: { displayName: '管理员' } })
      const token = crypto.randomUUID() + crypto.randomUUID()
      await this.db.insert(webAuthSessions).values({ id: crypto.randomUUID(), userId, tokenHash: createHash('sha256').update(token).digest('hex'), authMethod: 'ADMIN_PASSWORD', expiresAt: new Date(Date.now() + 12 * 60 * 60_000), revokedAt: null, lastSeenAt: new Date() })
      return { userId, token, displayName: '管理员' }
    } catch { throw toRepositoryError() }
  }

  async resolveWebSession(token: string): Promise<AuthContext | null> {
    try {
      const hash = createHash('sha256').update(token).digest('hex')
      const row = (await this.db.select({ session: webAuthSessions, user: users }).from(webAuthSessions).innerJoin(users, eq(webAuthSessions.userId, users.id)).where(eq(webAuthSessions.tokenHash, hash)).limit(1))[0]
      if (!row || row.session.revokedAt || row.session.expiresAt <= new Date()) return null
      const admin = row.session.authMethod === 'ADMIN_PASSWORD' || row.session.authMethod === 'CASDOOR' || Boolean((await this.db.select({ id: projectAdmins.id }).from(projectAdmins).where(eq(projectAdmins.userId, row.user.id)).limit(1))[0])
      await this.db.update(webAuthSessions).set({ lastSeenAt: new Date() }).where(eq(webAuthSessions.id, row.session.id))
      const identityProvider = row.session.authMethod === 'CASDOOR' ? 'CASDOOR' : row.session.authMethod === 'WECHAT_CONFIRMATION' ? 'WECHAT_MINIPROGRAM' : row.session.authMethod === 'ADMIN_PASSWORD' ? 'ADMIN_PASSWORD' : 'H5_WEB'
      const identity = identityProvider === 'CASDOOR' || identityProvider === 'WECHAT_MINIPROGRAM' ? (await this.db.select().from(userIdentities).where(and(eq(userIdentities.userId, row.user.id), eq(userIdentities.provider, identityProvider))).limit(1))[0] : undefined
      return { userId: row.user.id, displayName: row.user.displayName, avatarUrl: row.user.avatarUrl, identityProvider, ...(identity?.providerSubject ? { identitySubject: identity.providerSubject } : {}), sessionType: 'WEB', capabilities: { canManageProjects: admin } }
    } catch { throw toRepositoryError() }
  }
  async verifyStudent(userId: string, classId: string, displayName: string, studentNoLast4: string): Promise<OnboardingResponse> {
    try {
      const match = (await this.db.select().from(students).where(and(eq(students.classId, classId), eq(students.displayName, displayName), like(students.studentNo, `%${studentNoLast4}`))).limit(1))[0]
      if (!match) throw new RepositoryError('NOT_FOUND', 'Student verification failed')
      const studentBinding = (await this.db.select().from(studentBindings).where(eq(studentBindings.studentId, match.id)).limit(1))[0]
      const userBinding = (await this.db.select().from(studentBindings).where(eq(studentBindings.userId, userId)).limit(1))[0]
      if ((studentBinding && studentBinding.userId !== userId) || (userBinding && userBinding.studentId !== match.id)) throw new RepositoryError('CONFLICT', 'ACCOUNT_BINDING_CONFLICT')
      await this.db.insert(users).values({ id: userId, displayName: match.displayName, avatarUrl: null }).onDuplicateKeyUpdate({ set: { displayName: match.displayName } })
      if (!studentBinding) await this.db.insert(studentBindings).values({ id: crypto.randomUUID(), studentId: match.id, userId })
      const required = await this.db.select({ projectId: courses.projectId }).from(classTimetable).innerJoin(courses, eq(classTimetable.courseId, courses.id)).where(and(eq(classTimetable.classId, classId), eq(courses.kind, 'REQUIRED')))
      for (const item of required) if (item.projectId) {
        const existing = (await this.db.select({ id: projectMembers.id }).from(projectMembers).where(and(eq(projectMembers.projectId, item.projectId), eq(projectMembers.externalCode, match.studentNo))).limit(1))[0]
        if (existing) await this.db.update(projectMembers).set({ userId, displayName: match.displayName }).where(eq(projectMembers.id, existing.id))
        else await this.db.insert(projectMembers).values({ id: crypto.randomUUID(), projectId: item.projectId, userId, displayName: match.displayName, externalCode: match.studentNo })
      }
      return this.getOnboarding(userId)
    } catch (error) { if (error instanceof RepositoryError) throw error; throw toRepositoryError() }
  }
  async enrollElectives(userId: string, courseIds: readonly string[]): Promise<OnboardingResponse> {
    try {
      const binding = (await this.db.select().from(studentBindings).where(eq(studentBindings.userId, userId)).limit(1))[0]; if (!binding) throw new RepositoryError('NOT_FOUND', 'Student binding is required')
      const student = (await this.db.select().from(students).where(eq(students.id, binding.studentId)).limit(1))[0]; if (!student) throw new RepositoryError('NOT_FOUND', 'Student not found')
      for (const courseId of courseIds) {
        const course = (await this.db.select().from(courses).where(and(eq(courses.id, courseId), eq(courses.kind, 'ELECTIVE'))).limit(1))[0]; if (!course) throw new RepositoryError('NOT_FOUND', 'Course is not an elective')
        const offered = (await this.db.select({ id: classTimetable.id }).from(classTimetable).where(and(eq(classTimetable.classId, student.classId), eq(classTimetable.courseId, courseId))).limit(1))[0]; if (!offered) throw new RepositoryError('NOT_FOUND', 'Course is not offered to this class')
        await this.db.insert(studentCourseEnrollments).values({ id: crypto.randomUUID(), studentId: student.id, courseId }).onDuplicateKeyUpdate({ set: { courseId } })
        if (course.projectId) await this.db.insert(projectMembers).values({ id: crypto.randomUUID(), projectId: course.projectId, userId, displayName: student.displayName, externalCode: student.studentNo }).onDuplicateKeyUpdate({ set: { displayName: student.displayName, externalCode: student.studentNo } })
      }
      return this.getOnboarding(userId)
    } catch (error) { if (error instanceof RepositoryError) throw error; throw toRepositoryError() }
  }
  async startAttendance(sessionId: string, durationMinutes: number, actor: AuthContext, now = new Date()): Promise<SessionSummary> { void actor; try { const current = (await this.db.select().from(eventSessions).where(eq(eventSessions.id, sessionId)).limit(1))[0]; if (!current) throw new RepositoryError('NOT_FOUND', 'Session not found'); if (!current.attendanceStartedAt) await this.db.update(eventSessions).set({ checkinOpenAt: now, checkinCloseAt: new Date(now.getTime() + durationMinutes * 60_000), attendanceStartedAt: now }).where(eq(eventSessions.id, sessionId)); const value = await this.getSession(sessionId, now); if (!value) throw new RepositoryError('NOT_FOUND', 'Session not found'); return value } catch (error) { if (error instanceof RepositoryError) throw error; throw toRepositoryError() } }
  async getLiveAttendance(sessionId: string, now = new Date()): Promise<AttendanceLiveResponse> { const session = await this.getSession(sessionId, now); if (!session) throw new RepositoryError('NOT_FOUND', 'Session not found'); const records = await this.listAttendance(sessionId); const roster = await this.listMembers(session.projectId); const total = roster.length; const active = records.filter((record) => !record.voidedAt); const recordByMember = new Map(active.map((record) => [record.projectMemberId, record])); const members = roster.map((member) => { const record = recordByMember.get(member.id); return { projectMemberId: member.id, userId: member.userId, displayName: member.displayName, externalCode: member.externalCode, status: record?.status ?? 'PENDING' as const, checkedInAt: record?.checkedInAt ?? null } }); return { session, total, present: active.filter((record) => record.status === 'PRESENT').length, late: active.filter((record) => record.status === 'LATE').length, leave: active.filter((record) => record.status === 'LEAVE').length, absent: active.filter((record) => record.status === 'ABSENT').length, pending: Math.max(0, total - active.length), records: [...records], members } }
  async updateAttendance(sessionId: string, input: AttendanceAdminActionInput, actor: AuthContext, now = new Date()): Promise<AttendanceRecord> {
    try {
      const existing = (await this.db.select().from(attendanceRecords).where(and(eq(attendanceRecords.sessionId, sessionId), eq(attendanceRecords.projectMemberId, input.projectMemberId))).limit(1))[0]
      if (input.status === 'VOID') { if (!existing) throw new RepositoryError('NOT_FOUND', 'Attendance record not found'); if (existing.voidedAt) return mapAttendance(existing); await this.db.update(attendanceRecords).set({ voidedAt: now, voidedByUserId: actor.userId, updatedAt: now }).where(eq(attendanceRecords.id, existing.id)); await this.db.insert(attendanceAuditLogs).values({ id: crypto.randomUUID(), attendanceRecordId: existing.id, operatorUserId: actor.userId, previousStatus: existing.status, newStatus: existing.status }); const row = (await this.db.select().from(attendanceRecords).where(eq(attendanceRecords.id, existing.id)).limit(1))[0]; if (!row) throw toRepositoryError(); return mapAttendance(row) }
      const checkedInAt = input.status === 'PRESENT' || input.status === 'LATE' ? (existing?.checkedInAt ?? now) : existing?.checkedInAt ?? null
      const id = existing?.id ?? crypto.randomUUID()
      if (existing) await this.db.update(attendanceRecords).set({ status: input.status, source: 'ADMIN', checkedInAt, updatedAt: now, voidedAt: null, voidedByUserId: null }).where(eq(attendanceRecords.id, id))
      else await this.db.insert(attendanceRecords).values({ id, sessionId, projectMemberId: input.projectMemberId, userId: (await this.db.select({ userId: projectMembers.userId }).from(projectMembers).where(eq(projectMembers.id, input.projectMemberId)).limit(1))[0]?.userId ?? null, checkedInAt, method: 'MANUAL', source: 'ADMIN', status: input.status, distanceMeters: null, accuracyMeters: null, locationPassed: null, createdByUserId: actor.userId, voidedAt: null, voidedByUserId: null, updatedAt: now })
      await this.db.insert(attendanceAuditLogs).values({ id: crypto.randomUUID(), attendanceRecordId: id, operatorUserId: actor.userId, previousStatus: existing?.status ?? null, newStatus: input.status })
      const row = (await this.db.select().from(attendanceRecords).where(eq(attendanceRecords.id, id)).limit(1))[0]; if (!row) throw toRepositoryError(); return mapAttendance(row)
    } catch (error) { if (error instanceof RepositoryError) throw error; throw toRepositoryError() }
  }
  async finalizeAttendance(sessionId: string, actor: AuthContext, now = new Date()): Promise<AttendanceLiveResponse> {
    const session = await this.getSession(sessionId, now); if (!session) throw new RepositoryError('NOT_FOUND', 'Session not found')
    for (const member of await this.listMembers(session.projectId)) { const exists = (await this.db.select({ id: attendanceRecords.id }).from(attendanceRecords).where(and(eq(attendanceRecords.sessionId, sessionId), eq(attendanceRecords.projectMemberId, member.id))).limit(1))[0]; if (!exists) await this.updateAttendance(sessionId, { projectMemberId: member.id, status: 'ABSENT' }, actor, now) }
    await this.db.update(eventSessions).set({ attendanceFinalizedAt: now, checkinCloseAt: now }).where(eq(eventSessions.id, sessionId))
    return this.getLiveAttendance(sessionId, now)
  }
  async exportAttendanceCsv(sessionId: string): Promise<string> { const session = await this.getSession(sessionId); if (!session) throw new RepositoryError('NOT_FOUND', 'Session not found'); const records = await this.listAttendance(sessionId); const members = await this.listMembers(session.projectId); const escape = (value: string | null) => `"${(value ?? '').replaceAll('"', '""')}"`; return `\uFEFF${['姓名,学号,班级,课程,日期,应到时间,签到时间,状态,来源', ...records.map((record) => { const member = members.find((item) => item.id === record.projectMemberId); return [member?.displayName ?? '', member?.externalCode ?? '', '', session.projectName, session.scheduledStartAt.slice(0, 10), session.scheduledStartAt, record.checkedInAt, record.status, record.source].map(escape).join(',') })].join('\n')}\n` }
  async importRoster(semesterCode: string, entries: readonly RosterEntry[], actor: AuthContext): Promise<{ imported: number; skipped: number; conflicts: number }> {
    void actor
    try {
      const semester = (await this.db.select().from(semesterConfigs).where(eq(semesterConfigs.code, semesterCode)).limit(1))[0]
      if (!semester) throw new RepositoryError('NOT_FOUND', 'Semester configuration is required')
      let imported = 0; let skipped = 0; let conflicts = 0
      await this.db.transaction(async (tx) => {
        for (const entry of entries) {
          const classValue = (await tx.select().from(classTable).where(and(eq(classTable.semesterId, semester.id), eq(classTable.classCode, entry.classCode))).limit(1))[0]
          if (!classValue) throw new RepositoryError('NOT_FOUND', 'Roster references an unknown class')
          const existingStudent = (await tx.select().from(students).where(eq(students.studentNo, entry.studentNo)).limit(1))[0]
          if (existingStudent && existingStudent.classId === classValue.id && existingStudent.displayName === entry.displayName) { skipped += 1; continue }
          if (existingStudent) { conflicts += 1; continue }
          await tx.insert(students).values({ id: crypto.randomUUID(), studentNo: entry.studentNo, displayName: entry.displayName, classId: classValue.id, active: true })
          const student = (await tx.select().from(students).where(eq(students.studentNo, entry.studentNo)).limit(1))[0]
          if (!student) throw toRepositoryError()
          const required = await tx.select({ projectId: courses.projectId }).from(classTimetable).innerJoin(courses, eq(classTimetable.courseId, courses.id)).where(and(eq(classTimetable.classId, classValue.id), eq(courses.kind, 'REQUIRED')))
          for (const item of required) if (item.projectId) {
            const existing = (await tx.select({ id: projectMembers.id }).from(projectMembers).where(and(eq(projectMembers.projectId, item.projectId), eq(projectMembers.externalCode, entry.studentNo))).limit(1))[0]
            if (existing) await tx.update(projectMembers).set({ displayName: entry.displayName }).where(eq(projectMembers.id, existing.id))
            else await tx.insert(projectMembers).values({ id: crypto.randomUUID(), projectId: item.projectId, userId: null, displayName: entry.displayName, externalCode: entry.studentNo })
          }
          imported += 1
        }
      })
      return { imported, skipped, conflicts }
    } catch (error) { if (error instanceof RepositoryError) throw error; throw toRepositoryError() }
  }
  async createMiniProgramSession(providerSubject: string): Promise<{ userId: string; token: string; displayName: string }> { return this.createProviderSession('WECHAT_MINIPROGRAM', providerSubject) }
  async createProviderSession(provider: 'WECHAT_MINIPROGRAM' | 'CASDOOR', providerSubject: string, displayName = provider === 'WECHAT_MINIPROGRAM' ? '微信用户' : 'X-Lab 用户'): Promise<{ userId: string; token: string; displayName: string }> {
    try {
      const identity = (await this.db.select().from(userIdentities).where(and(eq(userIdentities.provider, provider), eq(userIdentities.providerSubject, providerSubject))).limit(1))[0]
      const userId = identity?.userId ?? crypto.randomUUID()
      const binding = (await this.db.select({ displayName: students.displayName }).from(studentBindings).innerJoin(students, eq(studentBindings.studentId, students.id)).where(eq(studentBindings.userId, userId)).limit(1))[0]
      const resolvedName = binding?.displayName ?? displayName
      if (!identity) await this.db.transaction(async (tx) => { await tx.insert(users).values({ id: userId, displayName: resolvedName, avatarUrl: null }); await tx.insert(userIdentities).values({ id: crypto.randomUUID(), userId, provider, providerSubject }) })
      else await this.db.update(users).set({ displayName: resolvedName }).where(eq(users.id, userId))
      const token = crypto.randomUUID() + crypto.randomUUID()
      if (provider === 'WECHAT_MINIPROGRAM') await this.db.insert(miniProgramAuthSessions).values({ id: crypto.randomUUID(), userId, tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60_000), revokedAt: null, lastSeenAt: new Date() })
      else await this.db.insert(webAuthSessions).values({ id: crypto.randomUUID(), userId, tokenHash: createHash('sha256').update(token).digest('hex'), authMethod: 'CASDOOR', expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60_000), revokedAt: null, lastSeenAt: new Date() })
      return { userId, token, displayName: resolvedName }
    } catch { throw toRepositoryError() }
  }
  async resolveMiniProgramSession(token: string): Promise<AuthContext | null> {
    try {
      const hash = createHash('sha256').update(token).digest('hex')
      const row = (await this.db.select({ session: miniProgramAuthSessions, user: users, identity: userIdentities }).from(miniProgramAuthSessions).innerJoin(users, eq(miniProgramAuthSessions.userId, users.id)).innerJoin(userIdentities, and(eq(userIdentities.userId, users.id), eq(userIdentities.provider, 'WECHAT_MINIPROGRAM'))).where(eq(miniProgramAuthSessions.tokenHash, hash)).limit(1))[0]
      if (!row || row.session.revokedAt || row.session.expiresAt <= new Date()) return null
      const admin = (await this.db.select({ id: projectAdmins.id }).from(projectAdmins).where(eq(projectAdmins.userId, row.user.id)).limit(1))[0]
      await this.db.update(miniProgramAuthSessions).set({ lastSeenAt: new Date() }).where(eq(miniProgramAuthSessions.id, row.session.id))
      return { userId: row.user.id, displayName: row.user.displayName, avatarUrl: row.user.avatarUrl, identityProvider: 'WECHAT_MINIPROGRAM', identitySubject: row.identity.providerSubject, sessionType: 'MINI_PROGRAM', capabilities: { canManageProjects: Boolean(admin) } }
    } catch { throw toRepositoryError() }
  }
  async linkProviderIdentity(userId: string, provider: 'WECHAT_MINIPROGRAM' | 'CASDOOR', providerSubject: string): Promise<void> {
    try {
      const existing = (await this.db.select().from(userIdentities).where(and(eq(userIdentities.provider, provider), eq(userIdentities.providerSubject, providerSubject))).limit(1))[0]
      if (existing && existing.userId !== userId) throw new RepositoryError('CONFLICT', 'ACCOUNT_BINDING_CONFLICT')
      if (!existing) await this.db.insert(userIdentities).values({ id: crypto.randomUUID(), userId, provider, providerSubject })
    } catch (error) { if (error instanceof RepositoryError) throw error; throw toRepositoryError() }
  }
  async createWebLoginChallenge(browserBindingSecret: string): Promise<WebLoginChallenge> {
    try {
      const challengeToken = randomBytes(32).toString('base64url')
      const shortCode = String(1000 + Math.floor(Math.random() * 9000))
      const expiresAt = new Date(Date.now() + 2 * 60_000)
      const id = crypto.randomUUID()
      await this.db.insert(webLoginChallenges).values({ id, challengeHash: createHash('sha256').update(challengeToken).digest('hex'), shortCodeHash: createHash('sha256').update(shortCode).digest('hex'), browserBindingHash: createHash('sha256').update(browserBindingSecret).digest('hex'), status: 'PENDING', approvedUserId: null, expiresAt, approvedAt: null, consumedAt: null })
      return { id, challengeToken, shortCode, expiresAt: expiresAt.toISOString(), status: 'PENDING' }
    } catch { throw toRepositoryError() }
  }
  async getWebLoginChallenge(id: string, browserBindingSecret: string): Promise<WebLoginChallengeStatus | null> {
    try {
      const row = (await this.db.select().from(webLoginChallenges).where(and(eq(webLoginChallenges.id, id), eq(webLoginChallenges.browserBindingHash, createHash('sha256').update(browserBindingSecret).digest('hex')))).limit(1))[0]
      if (!row) return null
      if (row.status === 'PENDING' && row.expiresAt <= new Date()) { await this.db.update(webLoginChallenges).set({ status: 'EXPIRED' }).where(eq(webLoginChallenges.id, id)); row.status = 'EXPIRED' }
      return { id: row.id, status: row.status, expiresAt: row.expiresAt.toISOString(), approvedAt: row.approvedAt?.toISOString() ?? null }
    } catch { throw toRepositoryError() }
  }
  async approveWebLoginChallenge(input: { id?: string; challengeToken?: string; shortCode?: string; userId: string }): Promise<WebLoginChallengeStatus> {
    try {
      const hash = createHash('sha256').update(input.challengeToken ?? input.shortCode ?? '').digest('hex')
      const where = input.id ? and(eq(webLoginChallenges.id, input.id), eq(webLoginChallenges.challengeHash, hash)) : and(eq(webLoginChallenges.shortCodeHash, hash), eq(webLoginChallenges.status, 'PENDING'))
      const row = (await this.db.select().from(webLoginChallenges).where(where).limit(1))[0]
      if (!row || row.status !== 'PENDING' || row.expiresAt <= new Date()) throw new RepositoryError('NOT_FOUND', 'Challenge is invalid or expired')
      await this.db.update(webLoginChallenges).set({ status: 'APPROVED', approvedUserId: input.userId, approvedAt: new Date() }).where(and(eq(webLoginChallenges.id, row.id), eq(webLoginChallenges.status, 'PENDING')))
      return { id: row.id, status: 'APPROVED', expiresAt: row.expiresAt.toISOString(), approvedAt: new Date().toISOString() }
    } catch (error) { if (error instanceof RepositoryError) throw error; throw toRepositoryError() }
  }
  async consumeWebLoginChallenge(id: string, browserBindingSecret: string): Promise<{ userId: string; token: string; displayName: string }> {
    try {
      const bindingHash = createHash('sha256').update(browserBindingSecret).digest('hex')
      const row = (await this.db.select().from(webLoginChallenges).where(and(eq(webLoginChallenges.id, id), eq(webLoginChallenges.browserBindingHash, bindingHash), eq(webLoginChallenges.status, 'APPROVED'))).limit(1))[0]
      if (!row?.approvedUserId) throw new RepositoryError('NOT_FOUND', 'Challenge is not ready')
      await this.db.update(webLoginChallenges).set({ status: 'CONSUMED', consumedAt: new Date() }).where(and(eq(webLoginChallenges.id, id), eq(webLoginChallenges.status, 'APPROVED')))
      const user = (await this.db.select().from(users).where(eq(users.id, row.approvedUserId)).limit(1))[0]
      if (!user) throw new RepositoryError('NOT_FOUND', 'User not found')
      const token = crypto.randomUUID() + crypto.randomUUID()
      await this.db.insert(webAuthSessions).values({ id: crypto.randomUUID(), userId: user.id, tokenHash: createHash('sha256').update(token).digest('hex'), authMethod: 'WECHAT_CONFIRMATION', expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60_000), revokedAt: null, lastSeenAt: new Date() })
      return { userId: user.id, token, displayName: user.displayName }
    } catch (error) { if (error instanceof RepositoryError) throw error; throw toRepositoryError() }
  }
  async upsertAttendancePolicy(projectId: string, input: CreateAttendancePolicyInput): Promise<AttendancePolicy> { try { const id = crypto.randomUUID(); const values = { id, projectId, rosterMode: input.rosterMode, checkInOpenMinutesBefore: input.checkInOpenMinutesBefore, checkInCloseMinutesAfter: input.checkInCloseMinutesAfter, requireLocation: input.locationEnabled, requirePasscode: input.passcodeEnabled, locationName: input.locationName, centerLatitude: input.centerLatitude?.toString() ?? null, centerLongitude: input.centerLongitude?.toString() ?? null, radiusMeters: input.radiusMeters }; await this.db.insert(attendancePolicies).values(values).onDuplicateKeyUpdate({ set: { rosterMode: input.rosterMode, checkInOpenMinutesBefore: input.checkInOpenMinutesBefore, checkInCloseMinutesAfter: input.checkInCloseMinutesAfter, requireLocation: input.locationEnabled, requirePasscode: input.passcodeEnabled, locationName: input.locationName, centerLatitude: input.centerLatitude?.toString() ?? null, centerLongitude: input.centerLongitude?.toString() ?? null, radiusMeters: input.radiusMeters } }); const row = (await this.db.select().from(attendancePolicies).where(eq(attendancePolicies.projectId, projectId)).limit(1))[0]; if (!row) throw toRepositoryError(); return mapPolicy(row) } catch (error) { if (error instanceof RepositoryError) throw error; throw toRepositoryError() } }
}

export function createMySqlRepository(databaseUrl: string): MySqlBusinessRepository { return new MySqlBusinessRepository(createDatabase(databaseUrl).db) }
