import {
  attendancePolicySchema,
  createAttendancePolicyInputSchema,
  createProjectInputSchema,
  createScheduleRuleInputSchema,
  generateSessionsInputSchema,
  healthResponseSchema,
  meResponseSchema,
  projectsResponseSchema,
  scheduleRuleSchema,
  sessionsResponseSchema,
  todayResponseSchema,
  updateProjectInputSchema,
  updateScheduleRuleInputSchema,
  type ApiErrorCode,
} from '@qzu/contracts'
import { requireAdmin, type AuthContext } from '@qzu/auth'
import { Hono } from 'hono'
import { cors } from 'hono/cors'

import { MemoryBusinessRepository, RepositoryError, type BusinessRepository } from './repository'

export interface ApiRuntimeConfig {
  readonly corsOrigins: readonly string[]
  readonly repository?: BusinessRepository
  readonly devAuthEnabled?: boolean
}
type ApiVariables = { requestId: string }
type ApiEnv = { Variables: ApiVariables }

function errorStatus(code: ApiErrorCode): 400 | 401 | 403 | 404 | 409 | 429 | 500 {
  if (code === 'UNAUTHORIZED' || code === 'AUTHENTICATION_REQUIRED') return 401
  if (code === 'FORBIDDEN' || code === 'ADMIN_REQUIRED') return 403
  if (code.endsWith('_NOT_FOUND') || code === 'NOT_FOUND') return 404
  if (code === 'ALREADY_CHECKED_IN' || code === 'DATABASE_UNAVAILABLE') return code === 'DATABASE_UNAVAILABLE' ? 500 : 409
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

function resolveAuth(request: Request, enabled: boolean): AuthContext | null {
  if (!enabled) return null
  const key = request.headers.get('X-Dev-User') as keyof typeof DEV_USERS | null
  const user = key ? DEV_USERS[key] : undefined
  return user ? { userId: user.userId, displayName: user.displayName, identityProvider: 'DEV', sessionType: 'DEV', capabilities: { canManageProjects: user.canManageProjects } } : null
}

function adminContext(request: Request, enabled: boolean): Promise<AuthContext> {
  const context = resolveAuth(request, enabled)
  return requireAdmin({ context, mode: 'all_authenticated', policy: { isProjectAdmin: () => Promise.resolve(false), isSystemAdmin: () => Promise.resolve(false) } })
}

export function createApp(config: ApiRuntimeConfig) {
  const allowedOrigins = new Set(config.corsOrigins)
  const repository = config.repository ?? new MemoryBusinessRepository()
  const app = new Hono<ApiEnv>()
  app.use('*', async (context, next) => { const requestId = context.req.header('X-Request-Id')?.slice(0, 128) || crypto.randomUUID(); context.set('requestId', requestId); context.header('X-Request-Id', requestId); await next() })
  app.use('*', cors({ origin: (origin) => allowedOrigins.has(origin) ? origin : undefined, allowMethods: ['GET', 'POST', 'PATCH', 'OPTIONS'], allowHeaders: ['Content-Type', 'X-Request-Id', 'Authorization', 'X-Dev-User'], credentials: true, maxAge: 600 }))
  app.use('*', async (context, next) => { const startedAt = performance.now(); await next(); console.log(JSON.stringify({ level: 'info', event: 'http_request', requestId: context.get('requestId'), method: context.req.method, path: context.req.path, status: context.res.status, durationMs: Math.round((performance.now() - startedAt) * 100) / 100 })) })

  app.get('/health', (context) => context.json(healthResponseSchema.parse({ status: 'ok', service: 'qzu-api', timestamp: new Date().toISOString() })))
  app.get('/api/v1/me', (context) => {
    const auth = resolveAuth(context.req.raw, config.devAuthEnabled === true)
    if (!auth) throw new ApiError('UNAUTHORIZED', 'Authentication is required')
    const user = Object.values(DEV_USERS).find((item) => item.userId === auth.userId)!
    return context.json(meResponseSchema.parse({ ...auth, userId: auth.userId, displayName: user.displayName }))
  })
  app.get('/api/v1/projects', async (context) => context.json(projectsResponseSchema.parse({ items: await repository.listProjects() })))
  app.post('/api/v1/projects', async (context) => {
    const auth = await adminContext(context.req.raw, config.devAuthEnabled === true)
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
    await adminContext(context.req.raw, config.devAuthEnabled === true)
    const input = updateProjectInputSchema.safeParse(await context.req.json())
    if (!input.success) throw new ApiError('VALIDATION_ERROR', 'Invalid project input', input.error.flatten())
    const project = await repository.updateProject(context.req.param('id'), input.data)
    if (!project) throw new ApiError('PROJECT_NOT_FOUND', 'Project not found')
    return context.json(project)
  })
  app.get('/api/v1/projects/:id/schedule-rules', async (context) => {
    if (!(await repository.getProject(context.req.param('id')))) throw new ApiError('PROJECT_NOT_FOUND', 'Project not found')
    return context.json({ items: (await repository.listScheduleRules(context.req.param('id'))).map((item) => scheduleRuleSchema.parse(item)) })
  })
  app.post('/api/v1/projects/:id/schedule-rules', async (context) => {
    await adminContext(context.req.raw, config.devAuthEnabled === true)
    const projectId = context.req.param('id')
    if (!(await repository.getProject(projectId))) throw new ApiError('PROJECT_NOT_FOUND', 'Project not found')
    const input = createScheduleRuleInputSchema.safeParse(await context.req.json())
    if (!input.success) throw new ApiError('VALIDATION_ERROR', 'Invalid schedule rule', input.error.flatten())
    return context.json(scheduleRuleSchema.parse(await repository.createScheduleRule(projectId, input.data)), 201)
  })
  app.patch('/api/v1/schedule-rules/:id', async (context) => {
    await adminContext(context.req.raw, config.devAuthEnabled === true)
    const input = updateScheduleRuleInputSchema.safeParse(await context.req.json())
    if (!input.success) throw new ApiError('VALIDATION_ERROR', 'Invalid schedule rule', input.error.flatten())
    const rule = await repository.updateScheduleRule(context.req.param('id'), input.data)
    if (!rule) throw new ApiError('SCHEDULE_RULE_NOT_FOUND', 'Schedule rule not found')
    return context.json(scheduleRuleSchema.parse(rule))
  })
  app.post('/api/v1/projects/:id/attendance-policy', async (context) => {
    await adminContext(context.req.raw, config.devAuthEnabled === true)
    const input = createAttendancePolicyInputSchema.safeParse(await context.req.json())
    if (!input.success) throw new ApiError('VALIDATION_ERROR', 'Invalid attendance policy', input.error.flatten())
    return context.json(attendancePolicySchema.parse(await repository.upsertAttendancePolicy(context.req.param('id'), input.data)), 201)
  })
  app.get('/api/v1/projects/:id/sessions', async (context) => {
    if (!(await repository.getProject(context.req.param('id')))) throw new ApiError('PROJECT_NOT_FOUND', 'Project not found')
    return context.json(sessionsResponseSchema.parse({ items: await repository.listSessions(context.req.param('id')) }))
  })
  app.post('/api/v1/projects/:id/sessions/generate', async (context) => {
    await adminContext(context.req.raw, config.devAuthEnabled === true)
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
  app.get('/api/v1/me/today', async (context) => {
    const auth = resolveAuth(context.req.raw, config.devAuthEnabled === true)
    if (!auth) throw new ApiError('UNAUTHORIZED', 'Authentication is required')
    return context.json(todayResponseSchema.parse(await repository.getToday(auth.userId)))
  })
  app.notFound((context) => context.json({ error: { code: 'NOT_FOUND', message: 'Resource not found', requestId: context.get('requestId') } }, 404))
  app.onError((error, context) => {
    const requestId = context.get('requestId') || crypto.randomUUID()
    const apiError = error instanceof ApiError ? error : error instanceof RepositoryError ? new ApiError(error.code, error.message) : error instanceof Error && error.name === 'AuthDomainError' ? new ApiError(error.message.includes('Authentication') ? 'UNAUTHORIZED' : 'FORBIDDEN', error.message) : new ApiError('INTERNAL_ERROR', 'Internal server error')
    console.error(JSON.stringify({ level: 'error', event: 'request_error', requestId, code: apiError.code }))
    return context.json({ error: { code: apiError.code, message: apiError.message, requestId, ...(apiError.details === undefined ? {} : { details: apiError.details }) } }, errorStatus(apiError.code))
  })
  return app
}

export type ApiApp = ReturnType<typeof createApp>
