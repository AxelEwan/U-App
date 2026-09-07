import { attendanceRecordsResponseSchema, healthResponseSchema, projectSummarySchema, timetableResponseSchema, todayResponseSchema } from '@qzu/contracts'
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

  it('resolves a provider session when development auth is disabled', async () => {
    const app = createApp({ corsOrigins: [], devAuthEnabled: false, resolveMiniProgramSession: (token) => Promise.resolve(token === 'opaque' ? { userId: '00000000-0000-4000-8000-000000000099', displayName: 'Bound Student', identityProvider: 'WECHAT_MINIPROGRAM', sessionType: 'MINI_PROGRAM', capabilities: { canManageProjects: false } } : null) })
    const response = await app.request('/api/v1/me', { headers: { Cookie: 'qzu_mini_session=opaque' } })
    expect(response.status).toBe(200)
    expect((await response.json() as { identityProvider: string }).identityProvider).toBe('WECHAT_MINIPROGRAM')
  })

  it('accepts a mini-program bearer session when development auth is disabled', async () => {
    const app = createApp({ corsOrigins: [], devAuthEnabled: false, resolveMiniProgramSession: (token) => Promise.resolve(token === 'opaque' ? { userId: '00000000-0000-4000-8000-000000000099', displayName: 'Bound Student', identityProvider: 'WECHAT_MINIPROGRAM', sessionType: 'MINI_PROGRAM', capabilities: { canManageProjects: false } } : null) })
    const response = await app.request('/api/v1/me', { headers: { Authorization: 'Bearer opaque' } })
    expect(response.status).toBe(200)
    expect((await response.json() as { userId: string }).userId).toBe('00000000-0000-4000-8000-000000000099')
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
    const member = await app.request(`/api/v1/projects/${project.id}/members`, { method: 'POST', headers, body: JSON.stringify({ userId: '00000000-0000-4000-8000-000000000011', displayName: 'Dev Student' }) })
    expect(member.status).toBe(201)
    const timetable = await app.request('/api/v1/me/timetable', { headers: { 'X-Dev-User': 'student' } })
    expect(timetableResponseSchema.parse(await timetable.json()).items.some((item) => item.projectId === project.id)).toBe(true)
  })

  it('supports a roster-bound normal check-in and prevents duplicates', async () => {
    const app = createApp({ corsOrigins: [], devAuthEnabled: true })
    const studentHeaders = { 'Content-Type': 'application/json', 'X-Dev-User': 'student' }
    const today = await app.request('/api/v1/me/today', { headers: { 'X-Dev-User': 'student' } })
    const active = ((await today.json()) as { activeCheckin: { id: string } | null }).activeCheckin
    expect(active).not.toBeNull()
    const checkIn = await app.request(`/api/v1/sessions/${active!.id}/check-in`, { method: 'POST', headers: studentHeaders, body: '{}' })
    expect(checkIn.status).toBe(201)
    expect((await checkIn.json() as { status: string }).status).toBe('LATE')
    const duplicate = await app.request(`/api/v1/sessions/${active!.id}/check-in`, { method: 'POST', headers: studentHeaders, body: '{}' })
    expect(duplicate.status).toBe(409)
    const attendance = await app.request(`/api/v1/sessions/${active!.id}/attendance`, { headers: { 'X-Dev-User': 'student' } })
    expect(attendance.status).toBe(200)
    expect(attendanceRecordsResponseSchema.parse(await attendance.json()).items).toHaveLength(1)
    const timetable = await app.request('/api/v1/me/timetable', { headers: { 'X-Dev-User': 'student' } })
    expect(timetableResponseSchema.parse(await timetable.json()).items.length).toBeGreaterThan(0)
  })

  it('runs the fixed-semester student and attendance flow without exposing roster data in config', async () => {
    const app = createApp({ corsOrigins: [], devAuthEnabled: true })
    const admin = { 'Content-Type': 'application/json', 'X-Dev-User': 'admin' }
    const student = { 'Content-Type': 'application/json', 'X-Dev-User': 'student' }
    const config = await app.request('/api/v1/admin/semester-config', { method: 'POST', headers: admin, body: JSON.stringify({ code: '2026-fall-test', name: '测试学期', startDate: '2026-09-01', endDate: '2026-09-30', standardPeriods: [{ period: 1, startTime: '09:00', endTime: '10:30' }], classes: [{ classCode: 'TEST-01', name: '测试班' }], courses: [{ courseCode: 'REQ-01', name: '必修课', kind: 'REQUIRED' }, { courseCode: 'ELE-01', name: '选修课', kind: 'ELECTIVE' }], timetable: [{ classCode: 'TEST-01', courseCode: 'REQ-01', weekday: 2, startPeriod: 1, endPeriod: 1, classroom: 'A-101', startWeek: 1, endWeek: 4 }] }) })
    expect(config.status).toBe(201)
    const configBody = await config.json() as { classes: { id: string }[]; courses: { id: string; kind: string }[] }
    const classId = configBody.classes[0]!.id
    const required = configBody.courses.find((course) => course.kind === 'REQUIRED')!
    const roster = await app.request('/api/v1/admin/roster', { method: 'POST', headers: admin, body: JSON.stringify({ semesterCode: '2026-fall-test', entries: [{ classCode: 'TEST-01', studentNo: '20260001', displayName: '测试同学' }] }) })
    expect(roster.status).toBe(201)
    const before = await app.request('/api/v1/me/onboarding', { headers: { 'X-Dev-User': 'student' } })
    expect((await before.json() as { status: string }).status).toBe('NEEDS_BINDING')
    const verify = await app.request('/api/v1/me/onboarding/verify', { method: 'POST', headers: student, body: JSON.stringify({ classId, displayName: '测试同学', studentNoLast4: '0001' }) })
    expect(verify.status).toBe(200)
    const verifyBody = await verify.json() as { status: string; electiveCourses: { id: string }[] }
    expect(verifyBody.status).toBe('NEEDS_ELECTIVES')
    const enrolled = await app.request('/api/v1/me/onboarding/electives', { method: 'POST', headers: student, body: JSON.stringify({ courseIds: [verifyBody.electiveCourses[0]!.id] }) })
    expect((await enrolled.json() as { status: string }).status).toBe('READY')
    const projects = await app.request('/api/v1/projects')
    const projectItems = (await projects.json() as { items: { id: string; name: string }[] }).items
    const courseProject = projectItems.find((project) => project.name === '必修课')!
    const sessions = await app.request(`/api/v1/projects/${courseProject.id}/sessions`)
    const session = (await sessions.json() as { items: { id: string }[] }).items[0]!
    const timetable = await app.request('/api/v1/me/timetable', { headers: { 'X-Dev-User': 'student' } })
    expect((await timetable.json() as { items: unknown[] }).items.length).toBeGreaterThan(0)
    const start = await app.request(`/api/v1/sessions/${session.id}/attendance/start`, { method: 'POST', headers: admin, body: JSON.stringify({ durationMinutes: 10 }) })
    expect(start.status).toBe(200)
    const checkIn = await app.request(`/api/v1/sessions/${session.id}/check-in`, { method: 'POST', headers: student, body: '{}' })
    expect(checkIn.status).toBe(201)
    expect((await checkIn.json() as { status: string }).status).toBe('LATE')
    const live = await app.request(`/api/v1/sessions/${session.id}/attendance/live`, { headers: { 'X-Dev-User': 'admin' } })
    const liveBody = await live.json() as { present: number; late: number; records: { projectMemberId: string }[] }
    expect(liveBody.late).toBe(1)
    const override = await app.request(`/api/v1/sessions/${session.id}/attendance`, { method: 'PATCH', headers: admin, body: JSON.stringify({ projectMemberId: liveBody.records[0]!.projectMemberId, status: 'PRESENT' }) })
    expect(override.status).toBe(200)
    const finalized = await app.request(`/api/v1/sessions/${session.id}/attendance/finalize`, { method: 'POST', headers: admin, body: '{}' })
    expect(finalized.status).toBe(200)
    const csv = await app.request(`/api/v1/sessions/${session.id}/attendance.csv`, { headers: { 'X-Dev-User': 'admin' } })
    expect(csv.status).toBe(200)
    expect(await csv.text()).toContain('测试同学')
    void required
  })
})
