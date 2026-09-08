import {
  attendanceRecordSchema,
  attendanceRecordsResponseSchema,
  attendanceLiveResponseSchema,
  attendanceAdminActionInputSchema,
  attendancePolicySchema,
  checkInInputSchema,
  createAttendancePolicyInputSchema,
  createProjectMemberInputSchema,
  createProjectInputSchema,
  createScheduleRuleInputSchema,
  generateSessionsInputSchema,
  semesterConfigInputSchema,
  semesterConfigResponseSchema,
  chooseClassInputSchema,
  verifyStudentInputSchema,
  enrollElectivesInputSchema,
  startAttendanceInputSchema,
  rosterImportInputSchema,
  wechatLoginInputSchema,
  webStudentLoginInputSchema,
  webStudentLoginOptionsResponseSchema,
  adminLoginInputSchema,
  createWebLoginChallengeOutputSchema,
  webLoginChallengeApproveSchema,
  webLoginChallengeStatusResponseSchema,
  healthResponseSchema,
  readinessResponseSchema,
  capabilitiesResponseSchema,
  meResponseSchema,
  projectsResponseSchema,
  projectMembersResponseSchema,
  scheduleRuleSchema,
  sessionsResponseSchema,
  todayResponseSchema,
  timetableResponseSchema,
  updateProjectInputSchema,
  updateScheduleRuleInputSchema,
  type ApiErrorCode,
} from '@qzu/contracts'
import { requireAdmin, type AuthContext } from '@qzu/auth'
import { DomainError } from '@qzu/core'
import { Hono } from 'hono'
import type { Context } from 'hono'
import { cors } from 'hono/cors'
import { scryptSync, timingSafeEqual } from 'node:crypto'

import { MemoryBusinessRepository, RepositoryError, type BusinessRepository } from './repository'
import type { CasdoorCallbackResult } from './casdoor'

export interface ApiRuntimeConfig {
  readonly corsOrigins: readonly string[]
  readonly repository?: BusinessRepository
  readonly devAuthEnabled?: boolean
  readonly resolveMiniProgramSession?: (token: string) => Promise<AuthContext | null>
  readonly createMiniProgramSession?: (providerSubject: string) => Promise<{ userId: string; token: string; displayName: string }>
  readonly exchangeWechatCode?: (code: string) => Promise<string>
  readonly resolveWebSession?: (token: string) => Promise<AuthContext | null>
  readonly createWebStudentSession?: (classId: string, displayName: string, studentNoLast4: string) => Promise<{ userId: string; token: string; displayName: string }>
  readonly createAdminWebSession?: () => Promise<{ userId: string; token: string; displayName: string }>
  readonly adminLoginSecretHash?: string
  readonly createProviderSession?: (provider: 'WECHAT_MINIPROGRAM' | 'CASDOOR', providerSubject: string, displayName?: string) => Promise<{ userId: string; token: string; displayName: string }>
  readonly linkProviderIdentity?: (userId: string, provider: 'WECHAT_MINIPROGRAM' | 'CASDOOR', providerSubject: string) => Promise<void>
  readonly casdoorAuthorizationUrl?: (returnUrl: string, targetUserId?: string) => Promise<string>
  readonly handleCasdoorCallback?: (url: string) => Promise<CasdoorCallbackResult>
  readonly publicH5Url?: string
  readonly publicAdminUrl?: string
  readonly repositoryMode?: 'memory' | 'mysql'
  readonly checkDatabaseReadiness?: () => Promise<{ readonly database: 'ok' | 'unavailable'; readonly schema: 'ok' | 'incomplete' | 'unavailable'; readonly missingTables: readonly string[] }>
}
type ApiVariables = { requestId: string }
type ApiEnv = { Variables: ApiVariables }

function errorStatus(code: ApiErrorCode): 400 | 401 | 403 | 404 | 409 | 429 | 500 {
  if (code === 'UNAUTHORIZED' || code === 'AUTHENTICATION_REQUIRED') return 401
  if (code === 'FORBIDDEN' || code === 'ADMIN_REQUIRED') return 403
  if (code.endsWith('_NOT_FOUND') || code === 'NOT_FOUND') return 404
  if (code === 'ALREADY_CHECKED_IN' || code === 'DATABASE_UNAVAILABLE') return code === 'DATABASE_UNAVAILABLE' ? 500 : 409
  if (code === 'ACCOUNT_BINDING_CONFLICT') return 409
  if (code === 'RATE_LIMITED') return 429
  if (code === 'INTERNAL_ERROR') return 500
  return 400
}

export class ApiError extends Error {
  public constructor(public readonly code: ApiErrorCode, message: string, public readonly details?: unknown) { super(message); this.name = 'ApiError' }
}

const DEV_USERS = {
  student: { userId: '00000000-0000-4000-8000-000000000011', displayName: 'Dev Student', canManageProjects: false },
  admin: { userId: '00000000-0000-4000-8000-000000000012', displayName: 'Dev Admin', canManageProjects: true },
} as const

async function resolveAuth(request: Request, enabled: boolean, resolveMiniProgramSession?: (token: string) => Promise<AuthContext | null>, resolveWebSession?: (token: string) => Promise<AuthContext | null>): Promise<AuthContext | null> {
  if (enabled) {
    const key = request.headers.get('X-Dev-User') as keyof typeof DEV_USERS | null
    const user = key ? DEV_USERS[key] : undefined
    if (user) return { userId: user.userId, displayName: user.displayName, identityProvider: 'DEV', sessionType: 'DEV', capabilities: { canManageProjects: user.canManageProjects } }
  }
  const bearer = /^Bearer\s+(.+)$/i.exec(request.headers.get('Authorization') ?? '')?.[1]
  const cookie = /(?:^|;)\s*qzu_mini_session=([^;]+)/.exec(request.headers.get('Cookie') ?? '')?.[1]
  const token = bearer ?? cookie
  if (token && resolveMiniProgramSession) return resolveMiniProgramSession(token)
  const webCookie = /(?:^|;)\s*qzu_web_session=([^;]+)/.exec(request.headers.get('Cookie') ?? '')?.[1]
  return webCookie && resolveWebSession ? resolveWebSession(webCookie) : null
}

function adminContext(request: Request, enabled: boolean, resolveMiniProgramSession?: (token: string) => Promise<AuthContext | null>, resolveWebSession?: (token: string) => Promise<AuthContext | null>): Promise<AuthContext> {
  const context = resolveAuth(request, enabled, resolveMiniProgramSession, resolveWebSession)
  return context.then((value) => requireAdmin({ context: value, mode: 'all_authenticated', policy: { isProjectAdmin: () => Promise.resolve(false), isSystemAdmin: () => Promise.resolve(false) } }))
}

function setWebSessionCookie(context: Context<ApiEnv>, token: string): void {
  context.header('Set-Cookie', `qzu_web_session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${30 * 24 * 60 * 60}`)
}

function setBindingCookie(context: Context<ApiEnv>, token: string): void {
  context.header('Set-Cookie', `qzu_web_binding=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=180`)
}

function readCookie(request: Request, name: string): string | null {
  return new RegExp(`(?:^|;)\\s*${name}=([^;]+)`).exec(request.headers.get('Cookie') ?? '')?.[1] ?? null
}

function verifyAdminPassword(password: string, encoded: string): boolean {
  const parts = encoded.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false
  const n = Number(parts[1]); const r = Number(parts[2]); const p = Number(parts[3])
  if (![n, r, p].every(Number.isSafeInteger) || n < 16_384 || r < 1 || p < 1) return false
  try {
    const salt = Buffer.from(parts[4]!, 'base64')
    const expected = Buffer.from(parts[5]!, 'base64')
    const actual = scryptSync(password, salt, expected.length, { N: n, r, p, maxmem: 64 * 1024 * 1024 })
    return actual.length === expected.length && timingSafeEqual(actual, expected)
  } catch { return false }
}

export function createApp(config: ApiRuntimeConfig) {
  const allowedOrigins = new Set(config.corsOrigins)
  const repository = config.repository ?? new MemoryBusinessRepository()
  const app = new Hono<ApiEnv>()
  const rateBuckets = new Map<string, { count: number; resetAt: number }>()
  const allowRate = (key: string, limit: number, windowMs: number): boolean => {
    const now = Date.now()
    const current = rateBuckets.get(key)
    if (!current || current.resetAt <= now) { rateBuckets.set(key, { count: 1, resetAt: now + windowMs }); return true }
    if (current.count >= limit) return false
    current.count += 1
    return true
  }
  app.use('*', async (context, next) => { const requestId = context.req.header('X-Request-Id')?.slice(0, 128) || crypto.randomUUID(); context.set('requestId', requestId); context.header('X-Request-Id', requestId); await next() })
  app.use('*', cors({ origin: (origin) => allowedOrigins.has(origin) ? origin : undefined, allowMethods: ['GET', 'POST', 'PATCH', 'OPTIONS'], allowHeaders: ['Content-Type', 'X-Request-Id', 'Authorization', ...(config.devAuthEnabled ? ['X-Dev-User'] : [])], credentials: true, maxAge: 600 }))
  app.use('*', async (context, next) => { const startedAt = performance.now(); await next(); console.log(JSON.stringify({ level: 'info', event: 'http_request', requestId: context.get('requestId'), method: context.req.method, path: context.req.path, status: context.res.status, durationMs: Math.round((performance.now() - startedAt) * 100) / 100 })) })

  app.get('/health', (context) => context.json(healthResponseSchema.parse({ status: 'ok', service: 'qzu-api', timestamp: new Date().toISOString() })))
  const getReadiness = async () => {
    if (config.repositoryMode !== 'mysql' || !config.checkDatabaseReadiness) return { repository: 'memory' as const, database: 'not_required' as const, schema: 'not_required' as const, missingTables: [] as readonly string[] }
    try {
      return { repository: 'mysql' as const, ...(await config.checkDatabaseReadiness()) }
    } catch {
      return { repository: 'mysql' as const, database: 'unavailable' as const, schema: 'unavailable' as const, missingTables: [] as readonly string[] }
    }
  }
  app.get('/ready', async (context) => {
    const readiness = await getReadiness()
    const ready = readiness.repository === 'memory' || (readiness.database === 'ok' && readiness.schema === 'ok')
    const body = readinessResponseSchema.parse({ status: ready ? 'ready' : 'not_ready', service: 'qzu-api', ...readiness, timestamp: new Date().toISOString() })
    return context.json(body, ready ? 200 : 503)
  })
  app.get('/api/v1/meta/capabilities', async (context) => {
    const readiness = await getReadiness()
    return context.json(capabilitiesResponseSchema.parse({
      api: true,
      databaseReady: readiness.repository === 'memory' || (readiness.database === 'ok' && readiness.schema === 'ok'),
      wechatLogin: Boolean(config.exchangeWechatCode && config.createMiniProgramSession),
      casdoorLogin: Boolean(config.casdoorAuthorizationUrl && config.handleCasdoorCallback && config.createProviderSession),
      adminPasswordLogin: Boolean(config.adminLoginSecretHash && config.createAdminWebSession),
    }))
  })
  app.post('/api/v1/auth/wechat/login', async (context) => {
    if (!config.exchangeWechatCode || !config.createMiniProgramSession) throw new ApiError('AUTHENTICATION_REQUIRED', 'WeChat login is not configured')
    const input = wechatLoginInputSchema.safeParse(await context.req.json())
    if (!input.success) throw new ApiError('VALIDATION_ERROR', 'Invalid WeChat login input', input.error.flatten())
    const providerSubject = await config.exchangeWechatCode(input.data.code)
    const session = await config.createMiniProgramSession(providerSubject)
    context.header('Set-Cookie', `qzu_mini_session=${session.token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${30 * 24 * 60 * 60}`)
    return context.json({ userId: session.userId, displayName: session.displayName, token: session.token })
  })
  app.post('/api/v1/auth/wechat/link', async (context) => {
    if (!config.exchangeWechatCode || !config.linkProviderIdentity) throw new ApiError('AUTHENTICATION_REQUIRED', 'WeChat linking is not configured')
    const auth = await resolveAuth(context.req.raw, config.devAuthEnabled === true, config.resolveMiniProgramSession, config.resolveWebSession)
    if (!auth) throw new ApiError('UNAUTHORIZED', 'Authentication is required')
    const input = wechatLoginInputSchema.safeParse(await context.req.json())
    if (!input.success) throw new ApiError('VALIDATION_ERROR', 'Invalid WeChat login input', input.error.flatten())
    await config.linkProviderIdentity(auth.userId, 'WECHAT_MINIPROGRAM', await config.exchangeWechatCode(input.data.code))
    return context.json({ linked: true })
  })
  app.get('/api/v1/auth/casdoor/start', async (context) => {
    if (!config.casdoorAuthorizationUrl) throw new ApiError('AUTHENTICATION_REQUIRED', 'Casdoor is not configured')
    const link = context.req.query('link') === '1'
    const auth = link ? await resolveAuth(context.req.raw, config.devAuthEnabled === true, config.resolveMiniProgramSession, config.resolveWebSession) : null
    if (link && !auth) throw new ApiError('UNAUTHORIZED', 'Authentication is required')
    const returnUrl = context.req.query('mode') === 'admin' ? config.publicAdminUrl ?? config.publicH5Url ?? '/' : config.publicH5Url ?? '/'
    return context.redirect(await config.casdoorAuthorizationUrl(returnUrl, auth?.userId))
  })
  app.get('/api/v1/auth/casdoor/callback', async (context) => {
    if (!config.handleCasdoorCallback) throw new ApiError('AUTHENTICATION_REQUIRED', 'Casdoor is not configured')
    const result = await config.handleCasdoorCallback(context.req.url)
    if (result.targetUserId) {
      if (!config.linkProviderIdentity) throw new ApiError('AUTHENTICATION_REQUIRED', 'Identity linking is not configured')
      await config.linkProviderIdentity(result.targetUserId, 'CASDOOR', result.providerSubject)
      return context.redirect(result.returnUrl)
    }
    if (!config.createProviderSession) throw new ApiError('AUTHENTICATION_REQUIRED', 'Casdoor session is not configured')
    const session = await config.createProviderSession('CASDOOR', result.providerSubject, result.displayName)
    setWebSessionCookie(context, session.token)
    return context.redirect(result.returnUrl)
  })
  app.post('/api/v1/auth/web/challenges', async (context) => {
    const binding = readCookie(context.req.raw, 'qzu_web_binding') ?? `${crypto.randomUUID()}${crypto.randomUUID()}`
    const challenge = await repository.createWebLoginChallenge(binding)
    if (!readCookie(context.req.raw, 'qzu_web_binding')) setBindingCookie(context, binding)
    return context.json(createWebLoginChallengeOutputSchema.parse({ challengeId: challenge.id, challengeToken: challenge.challengeToken, shortCode: challenge.shortCode, expiresAt: challenge.expiresAt, status: challenge.status }))
  })
  app.get('/api/v1/auth/web/challenges/:id', async (context) => {
    const binding = readCookie(context.req.raw, 'qzu_web_binding')
    const status = binding ? await repository.getWebLoginChallenge(context.req.param('id'), binding) : null
    if (!status) throw new ApiError('NOT_FOUND', 'Challenge not found')
    return context.json(webLoginChallengeStatusResponseSchema.parse({ challengeId: status.id, status: status.status, expiresAt: status.expiresAt, approvedAt: status.approvedAt }))
  })
  const approveChallenge = async (context: Context<ApiEnv>, identifier: { id?: string; shortCode?: string }) => {
    const auth = await resolveAuth(context.req.raw, config.devAuthEnabled === true, config.resolveMiniProgramSession, config.resolveWebSession)
    if (!auth || auth.identityProvider !== 'WECHAT_MINIPROGRAM') throw new ApiError('FORBIDDEN', 'An authenticated WeChat session is required')
    if (!allowRate(`challenge:${context.req.header('x-forwarded-for') ?? auth.userId}`, 10, 60_000)) throw new ApiError('RATE_LIMITED', 'Too many attempts')
    const input = webLoginChallengeApproveSchema.safeParse(await context.req.json().catch(() => ({})))
    if (!input.success) throw new ApiError('VALIDATION_ERROR', 'Invalid challenge approval', input.error.flatten())
    if (identifier.id && !input.data.challengeToken) throw new ApiError('NOT_FOUND', 'Challenge not found')
    const status = await repository.approveWebLoginChallenge({ ...identifier, ...(input.data.challengeToken ? { challengeToken: input.data.challengeToken } : {}), userId: auth.userId })
    return context.json(webLoginChallengeStatusResponseSchema.parse({ challengeId: status.id, status: status.status, expiresAt: status.expiresAt, approvedAt: status.approvedAt }))
  }
  app.post('/api/v1/auth/web/challenges/:id/approve', async (context) => approveChallenge(context, { id: context.req.param('id') }))
  app.post('/api/v1/auth/web/challenges/code/:code/approve', async (context) => approveChallenge(context, { shortCode: context.req.param('code') }))
  app.post('/api/v1/auth/web/challenges/:id/consume', async (context) => {
    const binding = readCookie(context.req.raw, 'qzu_web_binding')
    if (!binding) throw new ApiError('UNAUTHORIZED', 'Browser binding is required')
    const session = await repository.consumeWebLoginChallenge(context.req.param('id'), binding)
    setWebSessionCookie(context, session.token)
    return context.json({ userId: session.userId, displayName: session.displayName })
  })
  app.get('/api/v1/auth/web/student/options', async (context) => {
    if (!config.repository) return context.json({ classes: [] })
    return context.json(webStudentLoginOptionsResponseSchema.parse({ classes: await config.repository.listWebStudentLoginOptions() }))
  })
  app.post('/api/v1/auth/web/student/login', async (context) => {
    if (!config.createWebStudentSession) throw new ApiError('AUTHENTICATION_REQUIRED', 'H5 student login is not configured')
    const input = webStudentLoginInputSchema.safeParse(await context.req.json())
    if (!input.success) throw new ApiError('VALIDATION_ERROR', 'Invalid H5 student login input', input.error.flatten())
    const session = await config.createWebStudentSession(input.data.classId, input.data.displayName, input.data.studentNoLast4)
    setWebSessionCookie(context, session.token)
    return context.json({ userId: session.userId, displayName: session.displayName })
  })
  app.post('/api/v1/auth/admin/login', async (context) => {
    if (!config.adminLoginSecretHash || !config.createAdminWebSession) throw new ApiError('AUTHENTICATION_REQUIRED', 'Admin login is not configured')
    const input = adminLoginInputSchema.safeParse(await context.req.json())
    if (!input.success) throw new ApiError('VALIDATION_ERROR', 'Invalid admin login input', input.error.flatten())
    if (!verifyAdminPassword(input.data.password, config.adminLoginSecretHash)) throw new ApiError('UNAUTHORIZED', 'Invalid administrator password')
    const session = await config.createAdminWebSession()
    setWebSessionCookie(context, session.token)
    return context.json({ userId: session.userId, displayName: session.displayName })
  })
  app.get('/api/v1/me', async (context) => {
    const auth = await resolveAuth(context.req.raw, config.devAuthEnabled === true, config.resolveMiniProgramSession, config.resolveWebSession)
    if (!auth) throw new ApiError('UNAUTHORIZED', 'Authentication is required')
    return context.json(meResponseSchema.parse({ ...auth, userId: auth.userId, displayName: auth.displayName ?? '用户', identityProviders: await repository.listIdentityProviders(auth.userId) }))
  })
  app.get('/api/v1/projects', async (context) => context.json(projectsResponseSchema.parse({ items: await repository.listProjects() })))
  app.post('/api/v1/projects', async (context) => {
    const auth = await adminContext(context.req.raw, config.devAuthEnabled === true, config.resolveMiniProgramSession, config.resolveWebSession)
    const input = createProjectInputSchema.safeParse(await context.req.json())
    if (!input.success) throw new ApiError('VALIDATION_ERROR', 'Invalid project input', input.error.flatten())
    return context.json(await repository.createProject(input.data, auth), 201)
  })
  app.get('/api/v1/projects/:id', async (context) => {
    const project = await repository.getProject(context.req.param('id'))
    if (!project) throw new ApiError('PROJECT_NOT_FOUND', 'Project not found')
    return context.json(project)
  })
  app.patch('/api/v1/projects/:id', async (context) => {
    await adminContext(context.req.raw, config.devAuthEnabled === true, config.resolveMiniProgramSession, config.resolveWebSession)
    const input = updateProjectInputSchema.safeParse(await context.req.json())
    if (!input.success) throw new ApiError('VALIDATION_ERROR', 'Invalid project input', input.error.flatten())
    const project = await repository.updateProject(context.req.param('id'), input.data)
    if (!project) throw new ApiError('PROJECT_NOT_FOUND', 'Project not found')
    return context.json(project)
  })
  app.get('/api/v1/projects/:id/members', async (context) => {
    await adminContext(context.req.raw, config.devAuthEnabled === true, config.resolveMiniProgramSession, config.resolveWebSession)
    if (!(await repository.getProject(context.req.param('id')))) throw new ApiError('PROJECT_NOT_FOUND', 'Project not found')
    return context.json(projectMembersResponseSchema.parse({ items: await repository.listMembers(context.req.param('id')) }))
  })
  app.post('/api/v1/projects/:id/members', async (context) => {
    await adminContext(context.req.raw, config.devAuthEnabled === true, config.resolveMiniProgramSession, config.resolveWebSession)
    const projectId = context.req.param('id')
    if (!(await repository.getProject(projectId))) throw new ApiError('PROJECT_NOT_FOUND', 'Project not found')
    const input = createProjectMemberInputSchema.safeParse(await context.req.json())
    if (!input.success) throw new ApiError('VALIDATION_ERROR', 'Invalid project member input', input.error.flatten())
    return context.json(await repository.createMember(projectId, input.data), 201)
  })
  app.get('/api/v1/projects/:id/schedule-rules', async (context) => {
    if (!(await repository.getProject(context.req.param('id')))) throw new ApiError('PROJECT_NOT_FOUND', 'Project not found')
    return context.json({ items: (await repository.listScheduleRules(context.req.param('id'))).map((item) => scheduleRuleSchema.parse(item)) })
  })
  app.post('/api/v1/projects/:id/schedule-rules', async (context) => {
    await adminContext(context.req.raw, config.devAuthEnabled === true, config.resolveMiniProgramSession, config.resolveWebSession)
    const projectId = context.req.param('id')
    if (!(await repository.getProject(projectId))) throw new ApiError('PROJECT_NOT_FOUND', 'Project not found')
    const input = createScheduleRuleInputSchema.safeParse(await context.req.json())
    if (!input.success) throw new ApiError('VALIDATION_ERROR', 'Invalid schedule rule', input.error.flatten())
    return context.json(scheduleRuleSchema.parse(await repository.createScheduleRule(projectId, input.data)), 201)
  })
  app.patch('/api/v1/schedule-rules/:id', async (context) => {
    await adminContext(context.req.raw, config.devAuthEnabled === true, config.resolveMiniProgramSession, config.resolveWebSession)
    const input = updateScheduleRuleInputSchema.safeParse(await context.req.json())
    if (!input.success) throw new ApiError('VALIDATION_ERROR', 'Invalid schedule rule', input.error.flatten())
    const rule = await repository.updateScheduleRule(context.req.param('id'), input.data)
    if (!rule) throw new ApiError('SCHEDULE_RULE_NOT_FOUND', 'Schedule rule not found')
    return context.json(scheduleRuleSchema.parse(rule))
  })
  app.post('/api/v1/projects/:id/attendance-policy', async (context) => {
    await adminContext(context.req.raw, config.devAuthEnabled === true, config.resolveMiniProgramSession, config.resolveWebSession)
    const input = createAttendancePolicyInputSchema.safeParse(await context.req.json())
    if (!input.success) throw new ApiError('VALIDATION_ERROR', 'Invalid attendance policy', input.error.flatten())
    return context.json(attendancePolicySchema.parse(await repository.upsertAttendancePolicy(context.req.param('id'), input.data)), 201)
  })
  app.get('/api/v1/projects/:id/sessions', async (context) => {
    if (!(await repository.getProject(context.req.param('id')))) throw new ApiError('PROJECT_NOT_FOUND', 'Project not found')
    return context.json(sessionsResponseSchema.parse({ items: await repository.listSessions(context.req.param('id')) }))
  })
  app.post('/api/v1/projects/:id/sessions/generate', async (context) => {
    await adminContext(context.req.raw, config.devAuthEnabled === true, config.resolveMiniProgramSession, config.resolveWebSession)
    const projectId = context.req.param('id')
    if (!(await repository.getProject(projectId))) throw new ApiError('PROJECT_NOT_FOUND', 'Project not found')
    const input = generateSessionsInputSchema.safeParse(await context.req.json())
    if (!input.success) throw new ApiError('VALIDATION_ERROR', 'Invalid session generation input', input.error.flatten())
    return context.json(sessionsResponseSchema.parse({ items: await repository.generateSessions(projectId, input.data) }), 201)
  })
  app.get('/api/v1/sessions/:id', async (context) => {
    const value = await repository.getSession(context.req.param('id'))
    if (!value) throw new ApiError('SESSION_NOT_FOUND', 'Session not found')
    return context.json(value)
  })
  app.post('/api/v1/sessions/:id/check-in', async (context) => {
    const auth = await resolveAuth(context.req.raw, config.devAuthEnabled === true, config.resolveMiniProgramSession, config.resolveWebSession)
    if (!auth) throw new ApiError('UNAUTHORIZED', 'Authentication is required')
    const input = checkInInputSchema.safeParse(await context.req.json())
    if (!input.success) throw new ApiError('VALIDATION_ERROR', 'Invalid check-in input', input.error.flatten())
    return context.json(attendanceRecordSchema.parse(await repository.checkIn(context.req.param('id'), auth.userId, input.data)), 201)
  })
  app.post('/api/v1/sessions/:id/attendance/start', async (context) => {
    const auth = await adminContext(context.req.raw, config.devAuthEnabled === true, config.resolveMiniProgramSession, config.resolveWebSession)
    const input = startAttendanceInputSchema.safeParse(await context.req.json().catch(() => ({})))
    if (!input.success) throw new ApiError('VALIDATION_ERROR', 'Invalid attendance start input', input.error.flatten())
    const session = await repository.startAttendance(context.req.param('id'), input.data.durationMinutes, auth)
    return context.json(session)
  })
  app.get('/api/v1/sessions/:id/attendance', async (context) => {
    const auth = await resolveAuth(context.req.raw, config.devAuthEnabled === true, config.resolveMiniProgramSession, config.resolveWebSession)
    if (!auth) throw new ApiError('UNAUTHORIZED', 'Authentication is required')
    const session = await repository.getSession(context.req.param('id'))
    if (!session) throw new ApiError('SESSION_NOT_FOUND', 'Session not found')
    const records = await repository.listAttendance(session.id)
    const visible = auth.capabilities.canManageProjects ? records : records.filter((record) => record.userId === auth.userId)
    return context.json(attendanceRecordsResponseSchema.parse({ items: visible }))
  })
  app.get('/api/v1/sessions/:id/attendance/live', async (context) => {
    await adminContext(context.req.raw, config.devAuthEnabled === true, config.resolveMiniProgramSession, config.resolveWebSession)
    return context.json(attendanceLiveResponseSchema.parse(await repository.getLiveAttendance(context.req.param('id'))))
  })
  app.patch('/api/v1/sessions/:id/attendance', async (context) => {
    const auth = await adminContext(context.req.raw, config.devAuthEnabled === true, config.resolveMiniProgramSession, config.resolveWebSession)
    const input = attendanceAdminActionInputSchema.safeParse(await context.req.json())
    if (!input.success) throw new ApiError('VALIDATION_ERROR', 'Invalid attendance action', input.error.flatten())
    return context.json(attendanceRecordSchema.parse(await repository.updateAttendance(context.req.param('id'), input.data, auth)))
  })
  app.post('/api/v1/sessions/:id/attendance/finalize', async (context) => {
    const auth = await adminContext(context.req.raw, config.devAuthEnabled === true, config.resolveMiniProgramSession, config.resolveWebSession)
    return context.json(attendanceLiveResponseSchema.parse(await repository.finalizeAttendance(context.req.param('id'), auth)))
  })
  app.get('/api/v1/sessions/:id/attendance.csv', async (context) => {
    await adminContext(context.req.raw, config.devAuthEnabled === true, config.resolveMiniProgramSession, config.resolveWebSession)
    const csv = await repository.exportAttendanceCsv(context.req.param('id'))
    return new Response(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="attendance-${context.req.param('id')}.csv"` } })
  })
  app.post('/api/v1/admin/semester-config', async (context) => {
    const auth = await adminContext(context.req.raw, config.devAuthEnabled === true, config.resolveMiniProgramSession, config.resolveWebSession)
    const input = semesterConfigInputSchema.safeParse(await context.req.json())
    if (!input.success) throw new ApiError('VALIDATION_ERROR', 'Invalid semester configuration', input.error.flatten())
    return context.json(semesterConfigResponseSchema.parse(await repository.syncSemesterConfig(input.data, auth)), 201)
  })
  app.post('/api/v1/admin/roster', async (context) => {
    const auth = await adminContext(context.req.raw, config.devAuthEnabled === true, config.resolveMiniProgramSession, config.resolveWebSession)
    const input = rosterImportInputSchema.safeParse(await context.req.json())
    if (!input.success) throw new ApiError('VALIDATION_ERROR', 'Invalid roster import', input.error.flatten())
    return context.json(await repository.importRoster(input.data.semesterCode, input.data.entries, auth), 201)
  })
  app.get('/api/v1/me/onboarding', async (context) => {
    const auth = await resolveAuth(context.req.raw, config.devAuthEnabled === true, config.resolveMiniProgramSession, config.resolveWebSession)
    if (!auth) throw new ApiError('UNAUTHORIZED', 'Authentication is required')
    return context.json(await repository.getOnboarding(auth.userId))
  })
  app.post('/api/v1/me/onboarding/class', async (context) => {
    const auth = await resolveAuth(context.req.raw, config.devAuthEnabled === true, config.resolveMiniProgramSession, config.resolveWebSession)
    if (!auth) throw new ApiError('UNAUTHORIZED', 'Authentication is required')
    const input = chooseClassInputSchema.safeParse(await context.req.json())
    if (!input.success) throw new ApiError('VALIDATION_ERROR', 'Invalid class selection', input.error.flatten())
    return context.json(await repository.getOnboarding(auth.userId))
  })
  app.post('/api/v1/me/onboarding/verify', async (context) => {
    const auth = await resolveAuth(context.req.raw, config.devAuthEnabled === true, config.resolveMiniProgramSession, config.resolveWebSession)
    if (!auth) throw new ApiError('UNAUTHORIZED', 'Authentication is required')
    const input = verifyStudentInputSchema.safeParse(await context.req.json())
    if (!input.success) throw new ApiError('VALIDATION_ERROR', 'Invalid student verification', input.error.flatten())
    if (!allowRate(`onboarding:${auth.userId}`, 5, 60_000)) throw new ApiError('RATE_LIMITED', 'Too many attempts')
    return context.json(await repository.verifyStudent(auth.userId, input.data.classId, input.data.displayName, input.data.studentNoLast4))
  })
  app.post('/api/v1/me/onboarding/electives', async (context) => {
    const auth = await resolveAuth(context.req.raw, config.devAuthEnabled === true, config.resolveMiniProgramSession, config.resolveWebSession)
    if (!auth) throw new ApiError('UNAUTHORIZED', 'Authentication is required')
    const input = enrollElectivesInputSchema.safeParse(await context.req.json())
    if (!input.success) throw new ApiError('VALIDATION_ERROR', 'Invalid elective selection', input.error.flatten())
    return context.json(await repository.enrollElectives(auth.userId, input.data.courseIds))
  })
  app.get('/api/v1/me/today', async (context) => {
    const auth = await resolveAuth(context.req.raw, config.devAuthEnabled === true, config.resolveMiniProgramSession, config.resolveWebSession)
    if (!auth) throw new ApiError('UNAUTHORIZED', 'Authentication is required')
    return context.json(todayResponseSchema.parse(await repository.getToday(auth.userId)))
  })
  app.get('/api/v1/me/timetable', async (context) => {
    const auth = await resolveAuth(context.req.raw, config.devAuthEnabled === true, config.resolveMiniProgramSession, config.resolveWebSession)
    if (!auth) throw new ApiError('UNAUTHORIZED', 'Authentication is required')
    return context.json(timetableResponseSchema.parse(await repository.getTimetable(auth.userId)))
  })
  app.notFound((context) => context.json({ error: { code: 'NOT_FOUND', message: 'Resource not found', requestId: context.get('requestId') } }, 404))
  app.onError((error, context) => {
    const requestId = context.get('requestId') || crypto.randomUUID()
    const apiError = error instanceof ApiError ? error : error instanceof RepositoryError ? new ApiError(error.code === 'CONFLICT' ? 'ACCOUNT_BINDING_CONFLICT' : error.code === 'RATE_LIMITED' ? 'RATE_LIMITED' : error.code, error.message) : error instanceof DomainError ? new ApiError(error.code, error.message) : error instanceof Error && error.name === 'AuthDomainError' ? new ApiError(error.message.includes('Authentication') ? 'UNAUTHORIZED' : 'FORBIDDEN', error.message) : new ApiError('INTERNAL_ERROR', 'Internal server error')
    console.error(JSON.stringify({ level: 'error', event: 'request_error', requestId, code: apiError.code }))
    return context.json({ error: { code: apiError.code, message: apiError.message, requestId, ...(apiError.details === undefined ? {} : { details: apiError.details }) } }, errorStatus(apiError.code))
  })
  return app
}

export type ApiApp = ReturnType<typeof createApp>
