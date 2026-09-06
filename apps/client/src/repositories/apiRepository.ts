import type { AttendancePolicy, AttendanceRecord, CheckInInput, CreateAttendancePolicyInput, CreateProjectInput, CreateScheduleRuleInput, EnrollElectivesInput, MeResponse, OnboardingResponse, ProjectMember, ProjectSummary, ScheduleRule, SessionSummary, TodayResponse, TimetableResponse, VerifyStudentInput } from '@qzu/contracts'
import Taro from '@tarojs/taro'

import type { ClientRepository } from './types'

const API_BASE_URL = process.env.TARO_APP_API_BASE_URL
  ?? (process.env.TARO_ENV === 'weapp' ? 'http://127.0.0.1:3004' : 'http://localhost:3004')
interface ListResponse<T> { readonly items: T[] }

export class ApiRepository implements ClientRepository {
  private devUser: 'student' | 'admin' = 'student'
  private authReady: Promise<void> | null = null
  public constructor(private readonly baseUrl = API_BASE_URL) {}
  setDevRole(role: 'STUDENT' | 'ADMIN'): void { this.devUser = role === 'ADMIN' ? 'admin' : 'student' }

  private async request<T>(path: string, options: Omit<Taro.request.Option, 'url'> = {}): Promise<T> {
    if (process.env.TARO_APP_ENABLE_WECHAT_AUTH === 'true' && process.env.TARO_ENV === 'weapp' && !path.startsWith('/api/v1/auth/')) {
      this.authReady ??= Taro.login().then(({ code }) => Taro.request({ url: `${this.baseUrl}/api/v1/auth/wechat/login`, method: 'POST', data: { code } }).then(() => undefined))
      await this.authReady
    }
    const response = await Taro.request<T>({
      ...options,
      url: `${this.baseUrl}${path}`,
      header: { ...(options.header ?? {}), 'X-Dev-User': this.devUser },
    })
    if (response.statusCode < 200 || response.statusCode >= 300) throw new Error(`API request failed: ${response.statusCode}`)
    return response.data
  }

  async listProjects(): Promise<readonly ProjectSummary[]> {
    return (await this.request<ListResponse<ProjectSummary>>('/api/v1/projects')).items
  }
  async getProject(id: string): Promise<ProjectSummary | null> {
    try { return await this.request<ProjectSummary>(`/api/v1/projects/${id}`) } catch { return null }
  }
  async createProject(input: CreateProjectInput): Promise<ProjectSummary> {
    return this.request<ProjectSummary>('/api/v1/projects', { method: 'POST', data: input })
  }
  createScheduleRule(projectId: string, input: CreateScheduleRuleInput): Promise<ScheduleRule> { return this.request<ScheduleRule>(`/api/v1/projects/${projectId}/schedule-rules`, { method: 'POST', data: input }) }
  async listScheduleRules(projectId: string): Promise<readonly ScheduleRule[]> { return (await this.request<ListResponse<ScheduleRule>>(`/api/v1/projects/${projectId}/schedule-rules`)).items }
  saveAttendancePolicy(projectId: string, input: CreateAttendancePolicyInput): Promise<AttendancePolicy> { return this.request<AttendancePolicy>(`/api/v1/projects/${projectId}/attendance-policy`, { method: 'POST', data: input }) }
  async generateSessions(projectId: string, scheduleRuleId: string): Promise<readonly SessionSummary[]> { return (await this.request<ListResponse<SessionSummary>>(`/api/v1/projects/${projectId}/sessions/generate`, { method: 'POST', data: { scheduleRuleId } })).items }
  async listMembers(projectId: string): Promise<readonly ProjectMember[]> { return (await this.request<ListResponse<ProjectMember>>(`/api/v1/projects/${projectId}/members`)).items }
  async listSessions(projectId: string): Promise<readonly SessionSummary[]> {
    return (await this.request<ListResponse<SessionSummary>>(`/api/v1/projects/${projectId}/sessions`)).items
  }
  async listSchedule(): Promise<readonly SessionSummary[]> {
    return (await this.getTimetable()).items
  }
  async getSession(id: string): Promise<SessionSummary | null> {
    try { return await this.request<SessionSummary>(`/api/v1/sessions/${id}`) } catch { return null }
  }
  async checkIn(sessionId: string, input: CheckInInput): Promise<AttendanceRecord> { return this.request<AttendanceRecord>(`/api/v1/sessions/${sessionId}/check-in`, { method: 'POST', data: input }) }
  async getAttendance(sessionId: string): Promise<readonly AttendanceRecord[]> { return (await this.request<ListResponse<AttendanceRecord>>(`/api/v1/sessions/${sessionId}/attendance`)).items }
  async getToday(): Promise<TodayResponse> {
    return this.request<TodayResponse>('/api/v1/me/today')
  }
  getMe(): Promise<MeResponse> { return this.request<MeResponse>('/api/v1/me') }
  getTimetable(): Promise<TimetableResponse> { return this.request<TimetableResponse>('/api/v1/me/timetable') }
  getOnboarding(): Promise<OnboardingResponse> { return this.request<OnboardingResponse>('/api/v1/me/onboarding') }
  verifyStudent(input: VerifyStudentInput): Promise<OnboardingResponse> { return this.request<OnboardingResponse>('/api/v1/me/onboarding/verify', { method: 'POST', data: input }) }
  enrollElectives(input: EnrollElectivesInput): Promise<OnboardingResponse> { return this.request<OnboardingResponse>('/api/v1/me/onboarding/electives', { method: 'POST', data: input }) }
}

export const apiRepository = new ApiRepository()
