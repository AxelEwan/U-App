import type { AttendancePolicy, AttendanceRecord, CheckInInput, CreateAttendancePolicyInput, CreateProjectInput, CreateScheduleRuleInput, EnrollElectivesInput, MeResponse, OnboardingResponse, ProjectMember, ProjectSummary, ScheduleRule, SessionSummary, TodayResponse, TimetableResponse, VerifyStudentInput } from '@qzu/contracts'

export interface ProjectRepository {
  listProjects(): Promise<readonly ProjectSummary[]>
  getProject(id: string): Promise<ProjectSummary | null>
  createProject(input: CreateProjectInput): Promise<ProjectSummary>
  createScheduleRule(projectId: string, input: CreateScheduleRuleInput): Promise<ScheduleRule>
  listScheduleRules(projectId: string): Promise<readonly ScheduleRule[]>
  saveAttendancePolicy(projectId: string, input: CreateAttendancePolicyInput): Promise<AttendancePolicy>
  generateSessions(projectId: string, scheduleRuleId: string): Promise<readonly SessionSummary[]>
  listMembers(projectId: string): Promise<readonly ProjectMember[]>
}

export interface SessionRepository {
  listSessions(projectId: string): Promise<readonly SessionSummary[]>
  listSchedule(): Promise<readonly SessionSummary[]>
  getSession(id: string): Promise<SessionSummary | null>
  checkIn(sessionId: string, input: CheckInInput): Promise<AttendanceRecord>
  getAttendance(sessionId: string): Promise<readonly AttendanceRecord[]>
}

export interface TodayRepository {
  getToday(): Promise<TodayResponse>
  getMe(): Promise<MeResponse>
  getTimetable(): Promise<TimetableResponse>
  getOnboarding(): Promise<OnboardingResponse>
  verifyStudent(input: VerifyStudentInput): Promise<OnboardingResponse>
  enrollElectives(input: EnrollElectivesInput): Promise<OnboardingResponse>
}

export interface ClientRepository extends ProjectRepository, SessionRepository, TodayRepository {}
