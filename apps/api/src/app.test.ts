import { healthResponseSchema, projectSummarySchema, todayResponseSchema } from '@qzu/contracts'
import { describe, expect, it } from 'vitest'

import { createApp } from './app'

describe('API application', () => {
  it('returns a validated health response and request ID', async () => {
    const app = createApp({ corsOrigins: ['http://localhost:3000'] })
    const response = await app.request('/health')
    expect(response.status).toBe(200)
    expect(response.headers.get('X-Request-Id')).toBeTruthy()
    expect(healthResponseSchema.parse(await response.json()).status).toBe('ok')
  })

  it('does not grant CORS to unknown origins', async () => {
    const app = createApp({ corsOrigins: ['http://localhost:3000'] })
    const response = await app.request('/health', { headers: { Origin: 'https://attacker.invalid' } })
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull()
  })

  it('returns projects and today data from the business repository', async () => {
    const app = createApp({ corsOrigins: [], devAuthEnabled: true })
    const projectsResponse = await app.request('/api/v1/projects')
    expect(projectsResponse.status).toBe(200)
    const projects = (await projectsResponse.json()) as { items: unknown[] }
    expect(projects.items).toHaveLength(2)
    expect(projectSummarySchema.parse(projects.items[0])).toBeTruthy()

    const todayResponse = await app.request('/api/v1/me/today', { headers: { 'X-Dev-User': 'student' } })
    expect(todayResponse.status).toBe(200)
    const today = todayResponseSchema.parse(await todayResponse.json())
    expect(today.serverTime).toBeTruthy()
    expect(today.todaySessions.length).toBeGreaterThan(0)

    const projectId = (projects.items[0] as { id: string }).id
    const sessionsResponse = await app.request(`/api/v1/projects/${projectId}/sessions`)
    expect(sessionsResponse.status).toBe(200)
    const sessions = (await sessionsResponse.json()) as { items: { id: string; status: string }[] }
    expect(sessions.items.length).toBeGreaterThan(0)
    const sessionResponse = await app.request(`/api/v1/sessions/${sessions.items[0]!.id}`)
    expect(sessionResponse.status).toBe(200)
  })

  it('requires the admin capability for project creation', async () => {
    const app = createApp({ corsOrigins: [], devAuthEnabled: true })
    const denied = await app.request('/api/v1/projects', { method: 'POST', headers: { 'X-Dev-User': 'student' }, body: '{}' })
    expect(denied.status).toBe(403)
    const created = await app.request('/api/v1/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Dev-User': 'admin' },
      body: JSON.stringify({ name: 'Mock 项目', type: 'COURSE', effectiveStartDate: '2026-09-01' }),
    })
    expect(created.status).toBe(201)
  })

  it('supports real authoring boundaries and idempotent session generation in the contract repository', async () => {
    const app = createApp({ corsOrigins: [], devAuthEnabled: true })
    const headers = { 'Content-Type': 'application/json', 'X-Dev-User': 'admin' }
    const projectResponse = await app.request('/api/v1/projects', { method: 'POST', headers, body: JSON.stringify({ name: '测试课程 A', type: 'COURSE', effectiveStartDate: '2026-09-07', effectiveEndDate: '2026-09-13' }) })
    const project = (await projectResponse.json()) as { id: string }
    const ruleResponse = await app.request(`/api/v1/projects/${project.id}/schedule-rules`, { method: 'POST', headers, body: JSON.stringify({ weekdays: [1], everyNWeeks: 1, localStartTime: '09:00', localEndTime: '10:30', effectiveStartDate: '2026-09-07', effectiveEndDate: '2026-09-13', timezone: 'Asia/Shanghai' }) })
    const rule = (await ruleResponse.json()) as { id: string }
    const first = await app.request(`/api/v1/projects/${project.id}/sessions/generate`, { method: 'POST', headers, body: JSON.stringify({ scheduleRuleId: rule.id }) })
    const second = await app.request(`/api/v1/projects/${project.id}/sessions/generate`, { method: 'POST', headers, body: JSON.stringify({ scheduleRuleId: rule.id }) })
    expect(((await first.json()) as { items: unknown[] }).items).toHaveLength(1)
    expect(((await second.json()) as { items: unknown[] }).items).toHaveLength(1)
  })
})
