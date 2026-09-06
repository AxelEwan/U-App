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
  ProjectSummary,
  ProjectMember,
  ScheduleRule,
  SessionSummary,
  TodayResponse,
  TimetableResponse,
  UpdateProjectInput,
  UpdateScheduleRuleInput,
} from '@qzu/contracts'
import { DomainError, assertAttendanceEligible, deriveSessionStatus, generateWeeklySessionTimes } from '@qzu/core'
import { createDatabase, attendancePolicies, attendanceRecords, eventSessions, projectAdmins, projectMembers, projects, scheduleRules, users } from '@qzu/db'
import { and, asc, eq, sql } from 'drizzle-orm'

import { RepositoryError, type BusinessRepository } from './repository'
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
  async checkIn(sessionId: string, userId: string, input: CheckInInput, now = new Date()): Promise<AttendanceRecord> {
    try {
      checkInInputSchema.parse(input)
      const sessionRow = (await this.db.select().from(eventSessions).where(eq(eventSessions.id, sessionId)).limit(1))[0]
      if (!sessionRow) throw new DomainError('SESSION_NOT_FOUND', 'Session not found')
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
  async upsertAttendancePolicy(projectId: string, input: CreateAttendancePolicyInput): Promise<AttendancePolicy> { try { const id = crypto.randomUUID(); const values = { id, projectId, rosterMode: input.rosterMode, checkInOpenMinutesBefore: input.checkInOpenMinutesBefore, checkInCloseMinutesAfter: input.checkInCloseMinutesAfter, requireLocation: input.locationEnabled, requirePasscode: input.passcodeEnabled, locationName: input.locationName, centerLatitude: input.centerLatitude?.toString() ?? null, centerLongitude: input.centerLongitude?.toString() ?? null, radiusMeters: input.radiusMeters }; await this.db.insert(attendancePolicies).values(values).onDuplicateKeyUpdate({ set: { rosterMode: input.rosterMode, checkInOpenMinutesBefore: input.checkInOpenMinutesBefore, checkInCloseMinutesAfter: input.checkInCloseMinutesAfter, requireLocation: input.locationEnabled, requirePasscode: input.passcodeEnabled, locationName: input.locationName, centerLatitude: input.centerLatitude?.toString() ?? null, centerLongitude: input.centerLongitude?.toString() ?? null, radiusMeters: input.radiusMeters } }); const row = (await this.db.select().from(attendancePolicies).where(eq(attendancePolicies.projectId, projectId)).limit(1))[0]; if (!row) throw toRepositoryError(); return mapPolicy(row) } catch (error) { if (error instanceof RepositoryError) throw error; throw toRepositoryError() } }
}

export function createMySqlRepository(databaseUrl: string): MySqlBusinessRepository { return new MySqlBusinessRepository(createDatabase(databaseUrl).db) }
