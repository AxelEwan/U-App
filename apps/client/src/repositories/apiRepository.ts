import type { AttendancePolicy, AttendanceRecord, CapabilitiesResponse, CheckInInput, CreateAttendancePolicyInput, CreateProjectInput, CreateScheduleRuleInput, CreateWebLoginChallengeOutput, EnrollElectivesInput, MeResponse, OnboardingResponse, ProjectMember, ProjectSummary, ReadinessResponse, ScheduleRule, SessionSummary, TodayResponse, TimetableResponse, VerifyStudentInput, WebLoginChallengeStatusResponse, WebStudentClassOption } from '@qzu/contracts'
import Taro from '@tarojs/taro'

import type { ClientRepository } from './types'

const API_BASE_URL = process.env.TARO_APP_API_BASE_URL
  ?? (process.env.TARO_ENV === 'weapp' ? 'http://127.0.0.1:3004' : 'http://localhost:3004')
const DEV_AUTH_HEADER_ENABLED = process.env.NODE_ENV !== 'production' && process.env.TARO_APP_ENABLE_DEV_AUTH === 'true'
interface ListResponse<T> { readonly items: T[] }

export class ApiRequestError extends Error {
  public constructor(public readonly statusCode: number, public readonly code?: string) {
    super(code ?? `API_HTTP_${statusCode}`)
    this.name = 'ApiRequestError'
  }
}

export class ApiRepository implements ClientRepository {
  private devUser: 'student' | 'admin' = 'student'
  private sessionToken: string | null = null
  public constructor(private readonly baseUrl = API_BASE_URL) {}
  setDevRole(role: 'STUDENT' | 'ADMIN'): void {
    if (DEV_AUTH_HEADER_ENABLED) this.devUser = role === 'ADMIN' ? 'admin' : 'student'
  }

  async loginWechat(): Promise<{ userId: string; displayName: string }> {
    const { code } = await Taro.login()
    if (!code) throw new Error('WECHAT_LOGIN_CODE_MISSING')
    const response = await Taro.request<{ userId: string; displayName: string; token?: string }>({ url: `${this.baseUrl}/api/v1/auth/wechat/login`, method: 'POST', data: { code }, credentials: 'include' })
    if (response.statusCode < 200 || response.statusCode >= 300) throw new Error(`API request failed: ${response.statusCode}`)
    this.sessionToken = response.data.token ?? null
    return { userId: response.data.userId, displayName: response.data.displayName }
  }

  createWebLoginChallenge(): Promise<CreateWebLoginChallengeOutput> {
    return this.request<CreateWebLoginChallengeOutput>('/api/v1/auth/web/challenges', { method: 'POST' })
  }
  getWebLoginChallengeStatus(challengeId: string): Promise<WebLoginChallengeStatusResponse> {
    return this.request<WebLoginChallengeStatusResponse>(`/api/v1/auth/web/challenges/${challengeId}`)
  }
  approveWebLoginChallengeByCode(shortCode: string): Promise<WebLoginChallengeStatusResponse> {
    return this.request<WebLoginChallengeStatusResponse>(`/api/v1/auth/web/challenges/code/${encodeURIComponent(shortCode)}/approve`, { method: 'POST' })
  }
  approveWebLoginChallenge(challengeId: string, challengeToken: string): Promise<WebLoginChallengeStatusResponse> {
    return this.request<WebLoginChallengeStatusResponse>(`/api/v1/auth/web/challenges/${challengeId}/approve`, { method: 'POST', data: { challengeToken } })
  }
  consumeWebLoginChallenge(challengeId: string): Promise<{ userId: string; displayName: string }> {
    return this.request<{ userId: string; displayName: string }>(`/api/v1/auth/web/challenges/${challengeId}/consume`, { method: 'POST' })
  }

  private async request<T>(path: string, options: Omit<Taro.request.Option, 'url'> = {}): Promise<T> {
    const authHeader = this.sessionToken ? { Authorization: `Bearer ${this.sessionToken}` } : {}
    const devHeader = DEV_AUTH_HEADER_ENABLED ? { 'X-Dev-User': this.devUser } : {}
    const response = await Taro.request<T>({
      ...options,
      url: `${this.baseUrl}${path}`,
      credentials: 'include',
      header: { ...(options.header ?? {}), ...authHeader, ...devHeader },
    })
    if (response.statusCode < 200 || response.statusCode >= 300) {
      const body = response.data as unknown as { error?: { code?: unknown } }
      throw new ApiRequestError(response.statusCode, typeof body?.error?.code === 'string' ? body.error.code : undefined)
    }
    return response.data
  }

  async getReadiness(): Promise<ReadinessResponse> {
    const response = await Taro.request<ReadinessResponse>({ url: `${this.baseUrl}/ready`, method: 'GET', credentials: 'include' })
    if (response.statusCode !== 200 && response.statusCode !== 503) throw new ApiRequestError(response.statusCode)
    return response.data
  }

  getCapabilities(): Promise<CapabilitiesResponse> { return this.request<CapabilitiesResponse>('/api/v1/meta/capabilities') }

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
  getWebStudentLoginOptions(): Promise<{ classes: readonly WebStudentClassOption[] }> { return this.request<{ classes: readonly WebStudentClassOption[] }>('/api/v1/auth/web/student/options') }
  loginWebStudent(input: VerifyStudentInput): Promise<{ userId: string; displayName: string }> { return this.request<{ userId: string; displayName: string }>('/api/v1/auth/web/student/login', { method: 'POST', data: input }) }
  verifyStudent(input: VerifyStudentInput): Promise<OnboardingResponse> { return this.request<OnboardingResponse>('/api/v1/me/onboarding/verify', { method: 'POST', data: input }) }
  enrollElectives(input: EnrollElectivesInput): Promise<OnboardingResponse> { return this.request<OnboardingResponse>('/api/v1/me/onboarding/electives', { method: 'POST', data: input }) }
}

export const apiRepository = new ApiRepository()
