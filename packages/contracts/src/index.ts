import { z } from 'zod'

export const apiErrorCodeSchema = z.enum([
  'UNAUTHORIZED',
  'FORBIDDEN',
  'PROJECT_NOT_FOUND',
  'SCHEDULE_RULE_NOT_FOUND',
  'SESSION_NOT_FOUND',
  'DATABASE_UNAVAILABLE',
  'AUTHENTICATION_REQUIRED',
  'ADMIN_REQUIRED',
  'VALIDATION_ERROR',
  'NOT_FOUND',
  'CHECKIN_NOT_OPEN',
  'CHECKIN_CLOSED',
  'MEMBER_NOT_ELIGIBLE',
  'ALREADY_CHECKED_IN',
  'LOCATION_REQUIRED',
  'LOCATION_OUT_OF_RANGE',
  'PASSCODE_INVALID',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
])

export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>

export const apiErrorResponseSchema = z.object({
  error: z.object({
    code: apiErrorCodeSchema,
    message: z.string(),
    requestId: z.string().min(1),
    details: z.unknown().optional(),
  }),
})

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.literal('qzu-api'),
  timestamp: z.iso.datetime(),
})

export const projectTypeSchema = z.enum(['COURSE', 'ACTIVITY'])
export const projectStatusSchema = z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED'])
export const rosterModeSchema = z.enum(['ROSTER', 'FREE_FORM', 'MIXED'])
export const attendanceStatusSchema = z.enum(['PRESENT', 'LATE', 'LEAVE', 'ABSENT'])
export const attendanceSourceSchema = z.enum(['SELF_CHECKIN', 'ADMIN'])
export const sessionLifecycleStatusSchema = z.enum([
  'UPCOMING',
  'CHECKIN_OPEN',
  'IN_PROGRESS',
  'CHECKIN_CLOSED',
  'ENDED',
])

export const attendanceRecordSchema = z.object({
  id: z.uuid(),
  sessionId: z.uuid(),
  projectMemberId: z.uuid(),
  userId: z.uuid().nullable(),
  checkedInAt: z.iso.datetime().nullable(),
  source: attendanceSourceSchema,
  status: attendanceStatusSchema,
  createdByUserId: z.uuid().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  voidedAt: z.iso.datetime().nullable(),
  voidedByUserId: z.uuid().nullable(),
})

export const projectSummarySchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(160),
  description: z.string().nullable(),
  type: projectTypeSchema,
  timezone: z.string().min(1).max(64),
  effectiveStartDate: z.iso.date(),
  effectiveEndDate: z.iso.date().nullable(),
  status: projectStatusSchema,
})

export const sessionSummarySchema = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  projectName: z.string().min(1),
  scheduledStartAt: z.iso.datetime(),
  scheduledEndAt: z.iso.datetime(),
  checkInOpenAt: z.iso.datetime(),
  checkInCloseAt: z.iso.datetime(),
  locationName: z.string().nullable(),
  status: sessionLifecycleStatusSchema,
})

export const projectsResponseSchema = z.object({ items: z.array(projectSummarySchema) })
export const sessionsResponseSchema = z.object({ items: z.array(sessionSummarySchema) })
export const todayResponseSchema = z.object({
  serverTime: z.iso.datetime(),
  activeCheckin: sessionSummarySchema.nullable(),
  nextSession: sessionSummarySchema.nullable(),
  todaySessions: z.array(sessionSummarySchema),
})

export const scheduleRuleSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  weekdays: z.array(z.number().int().min(1).max(7)),
  everyNWeeks: z.number().int().min(1),
  localStartTime: z.string().regex(/^\d{2}:\d{2}$/),
  localEndTime: z.string().regex(/^\d{2}:\d{2}$/),
  effectiveStartDate: z.iso.date(),
  effectiveEndDate: z.iso.date(),
  timezone: z.string().min(1),
})

export const createScheduleRuleInputSchema = scheduleRuleSchema.omit({ id: true, projectId: true })
export const updateScheduleRuleInputSchema = createScheduleRuleInputSchema.partial()

export const attendancePolicySchema = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  rosterMode: rosterModeSchema,
  checkInOpenMinutesBefore: z.number().int().min(0).max(24 * 60),
  checkInCloseMinutesAfter: z.number().int().min(0).max(24 * 60),
  locationEnabled: z.boolean(),
  locationName: z.string().nullable(),
  centerLatitude: z.number().nullable(),
  centerLongitude: z.number().nullable(),
  radiusMeters: z.number().int().nullable(),
  passcodeEnabled: z.boolean(),
})

export const createAttendancePolicyInputSchema = attendancePolicySchema.omit({ id: true, projectId: true })

export const meResponseSchema = z.object({
  userId: z.uuid(),
  displayName: z.string().min(1),
  sessionType: z.enum(['WEB', 'MINI_PROGRAM', 'DEV']),
  identityProvider: z.enum(['WECHAT_MINIPROGRAM', 'CASDOOR', 'DEV']),
  capabilities: z.object({ canManageProjects: z.boolean() }),
})

export const createProjectInputSchema = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(10_000).nullable().optional(),
  type: projectTypeSchema,
  timezone: z.string().min(1).max(64).default('Asia/Shanghai'),
  effectiveStartDate: z.iso.date(),
  effectiveEndDate: z.iso.date().nullable().optional(),
})
export const updateProjectInputSchema = createProjectInputSchema.partial()

export const generateSessionsInputSchema = z.object({ scheduleRuleId: z.uuid() })

export const checkInInputSchema = z.object({
  passcode: z.string().min(1).max(128).optional(),
  location: z
    .object({
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
      accuracy: z.number().nonnegative().max(100_000),
    })
    .optional(),
  idempotencyKey: z.string().min(16).max(128).optional(),
})

export const webLoginChallengeStatusSchema = z.enum([
  'PENDING',
  'APPROVED',
  'DENIED',
  'CONSUMED',
  'EXPIRED',
])

export const createWebLoginChallengeOutputSchema = z.object({
  challengeId: z.string().min(32),
  shortCode: z.string().min(4).max(12),
  expiresAt: z.iso.datetime(),
  status: z.literal('PENDING'),
})

export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>
export type CheckInInput = z.infer<typeof checkInInputSchema>
export type ProjectSummary = z.infer<typeof projectSummarySchema>
export type SessionSummary = z.infer<typeof sessionSummarySchema>
export type TodayResponse = z.infer<typeof todayResponseSchema>
export type ScheduleRule = z.infer<typeof scheduleRuleSchema>
export type CreateScheduleRuleInput = z.infer<typeof createScheduleRuleInputSchema>
export type UpdateScheduleRuleInput = z.infer<typeof updateScheduleRuleInputSchema>
export type AttendancePolicy = z.infer<typeof attendancePolicySchema>
export type CreateAttendancePolicyInput = z.infer<typeof createAttendancePolicyInputSchema>
export type MeResponse = z.infer<typeof meResponseSchema>
export type CreateProjectInput = z.infer<typeof createProjectInputSchema>
export type UpdateProjectInput = z.infer<typeof updateProjectInputSchema>
export type GenerateSessionsInput = z.infer<typeof generateSessionsInputSchema>
export type AttendanceRecord = z.infer<typeof attendanceRecordSchema>
