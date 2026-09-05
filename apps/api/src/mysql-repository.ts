import type {
  AttendancePolicy,
  CreateAttendancePolicyInput,
  CreateProjectInput,
  CreateScheduleRuleInput,
  GenerateSessionsInput,
  ProjectSummary,
  ScheduleRule,
  SessionSummary,
  TodayResponse,
  UpdateProjectInput,
  UpdateScheduleRuleInput,
} from '@qzu/contracts'
import { deriveSessionStatus, generateWeeklySessionTimes } from '@qzu/core'
import { createDatabase, attendancePolicies, eventSessions, projectAdmins, projects, scheduleRules, users } from '@qzu/db'
import { asc, eq, sql } from 'drizzle-orm'

import { RepositoryError, type BusinessRepository } from './repository'
import type { AuthContext } from '@qzu/auth'

type MySqlDatabase = ReturnType<typeof createDatabase>['db']
type ProjectRow = typeof projects.$inferSelect
type SessionRow = typeof eventSessions.$inferSelect
type RuleRow = typeof scheduleRules.$inferSelect
type PolicyRow = typeof attendancePolicies.$inferSelect

const toRepositoryError = (): RepositoryError => new RepositoryError('DATABASE_UNAVAILABLE', 'Database is temporarily unavailable')
const mapProject = (row: ProjectRow): ProjectSummary => ({ id: row.id, name: row.name, description: row.description, type: row.type, timezone: row.timezone, effectiveStartDate: row.effectiveStartDate, effectiveEndDate: row.effectiveEndDate, status: row.status })
const mapRule = (row: RuleRow): ScheduleRule => ({ id: row.id, projectId: row.projectId, weekdays: row.weekdays, everyNWeeks: row.intervalWeeks, localStartTime: row.localStartTime, localEndTime: row.localEndTime, effectiveStartDate: row.startDate, effectiveEndDate: row.endDate, timezone: row.timezone })
const mapPolicy = (row: PolicyRow): AttendancePolicy => ({ id: row.id, projectId: row.projectId, rosterMode: row.rosterMode, checkInOpenMinutesBefore: row.checkInOpenMinutesBefore, checkInCloseMinutesAfter: row.checkInCloseMinutesAfter, locationEnabled: row.requireLocation, locationName: row.locationName, centerLatitude: row.centerLatitude === null ? null : Number(row.centerLatitude), centerLongitude: row.centerLongitude === null ? null : Number(row.centerLongitude), radiusMeters: row.radiusMeters, passcodeEnabled: row.requirePasscode })

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
        await tx.insert(users).values({ id: actor.userId }).onDuplicateKeyUpdate({ set: { id: actor.userId } })
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
  async getToday(_userId: string, now = new Date()): Promise<TodayResponse> { try { const rows = await this.db.select().from(eventSessions).orderBy(asc(eventSessions.scheduledStartAt)); const projectRows = await this.db.select().from(projects); const byId = new Map(projectRows.map((row) => [row.id, mapProject(row)])); const day = now.toISOString().slice(0, 10); const todaySessions = rows.filter((row) => row.scheduledStartAt.toISOString().slice(0, 10) === day).flatMap((row) => { const project = byId.get(row.projectId); return project ? [mapSession(row, project, now)] : [] }); return { serverTime: now.toISOString(), activeCheckin: todaySessions.find((item) => item.status === 'CHECKIN_OPEN' || item.status === 'IN_PROGRESS') ?? null, nextSession: todaySessions.find((item) => item.status === 'UPCOMING') ?? null, todaySessions } } catch { throw toRepositoryError() } }
  async upsertAttendancePolicy(projectId: string, input: CreateAttendancePolicyInput): Promise<AttendancePolicy> { try { const id = crypto.randomUUID(); const values = { id, projectId, rosterMode: input.rosterMode, checkInOpenMinutesBefore: input.checkInOpenMinutesBefore, checkInCloseMinutesAfter: input.checkInCloseMinutesAfter, requireLocation: input.locationEnabled, requirePasscode: input.passcodeEnabled, locationName: input.locationName, centerLatitude: input.centerLatitude?.toString() ?? null, centerLongitude: input.centerLongitude?.toString() ?? null, radiusMeters: input.radiusMeters }; await this.db.insert(attendancePolicies).values(values).onDuplicateKeyUpdate({ set: { rosterMode: input.rosterMode, checkInOpenMinutesBefore: input.checkInOpenMinutesBefore, checkInCloseMinutesAfter: input.checkInCloseMinutesAfter, requireLocation: input.locationEnabled, requirePasscode: input.passcodeEnabled, locationName: input.locationName, centerLatitude: input.centerLatitude?.toString() ?? null, centerLongitude: input.centerLongitude?.toString() ?? null, radiusMeters: input.radiusMeters } }); const row = (await this.db.select().from(attendancePolicies).where(eq(attendancePolicies.projectId, projectId)).limit(1))[0]; if (!row) throw toRepositoryError(); return mapPolicy(row) } catch (error) { if (error instanceof RepositoryError) throw error; throw toRepositoryError() } }
}

export function createMySqlRepository(databaseUrl: string): MySqlBusinessRepository { return new MySqlBusinessRepository(createDatabase(databaseUrl).db) }
