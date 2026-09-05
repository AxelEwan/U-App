import type { AttendancePolicy, CreateAttendancePolicyInput, CreateProjectInput, CreateScheduleRuleInput, MeResponse, ProjectSummary, ScheduleRule, SessionSummary, TodayResponse } from '@qzu/contracts'
import Taro from '@tarojs/taro'

import type { ClientRepository } from './types'

const API_BASE_URL = process.env.TARO_ENV === 'weapp' ? 'http://127.0.0.1:3004' : 'http://localhost:3004'
interface ListResponse<T> { readonly items: T[] }

export class ApiRepository implements ClientRepository {
  private devUser: 'student' | 'admin' = 'student'
  public constructor(private readonly baseUrl = API_BASE_URL) {}
  setDevRole(role: 'STUDENT' | 'ADMIN'): void { this.devUser = role === 'ADMIN' ? 'admin' : 'student' }

  private async request<T>(path: string, options: Omit<Taro.request.Option, 'url'> = {}): Promise<T> {
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
  async listSessions(projectId: string): Promise<readonly SessionSummary[]> {
    return (await this.request<ListResponse<SessionSummary>>(`/api/v1/projects/${projectId}/sessions`)).items
  }
  async listSchedule(): Promise<readonly SessionSummary[]> {
    const projects = await this.listProjects()
    const sessions = await Promise.all(projects.map((project) => this.listSessions(project.id)))
    return sessions.flat()
  }
  async getSession(id: string): Promise<SessionSummary | null> {
    try { return await this.request<SessionSummary>(`/api/v1/sessions/${id}`) } catch { return null }
  }
  async getToday(): Promise<TodayResponse> {
    return this.request<TodayResponse>('/api/v1/me/today')
  }
  getMe(): Promise<MeResponse> { return this.request<MeResponse>('/api/v1/me') }
}

export const apiRepository = new ApiRepository()
