import type { AttendancePolicy, CreateAttendancePolicyInput, CreateProjectInput, CreateScheduleRuleInput, MeResponse, ProjectSummary, ScheduleRule, SessionSummary, TodayResponse } from '@qzu/contracts'

export interface ProjectRepository {
  listProjects(): Promise<readonly ProjectSummary[]>
  getProject(id: string): Promise<ProjectSummary | null>
  createProject(input: CreateProjectInput): Promise<ProjectSummary>
  createScheduleRule(projectId: string, input: CreateScheduleRuleInput): Promise<ScheduleRule>
  listScheduleRules(projectId: string): Promise<readonly ScheduleRule[]>
  saveAttendancePolicy(projectId: string, input: CreateAttendancePolicyInput): Promise<AttendancePolicy>
  generateSessions(projectId: string, scheduleRuleId: string): Promise<readonly SessionSummary[]>
}

export interface SessionRepository {
  listSessions(projectId: string): Promise<readonly SessionSummary[]>
  listSchedule(): Promise<readonly SessionSummary[]>
  getSession(id: string): Promise<SessionSummary | null>
}

export interface TodayRepository {
  getToday(): Promise<TodayResponse>
  getMe(): Promise<MeResponse>
}

export interface ClientRepository extends ProjectRepository, SessionRepository, TodayRepository {}
