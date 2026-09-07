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
export const attendanceMethodSchema = z.enum(['MANUAL', 'PASSCODE', 'LOCATION', 'COMBINED'])
export const sessionLifecycleStatusSchema = z.enum([
  'UPCOMING',
  'CHECKIN_OPEN',
  'IN_PROGRESS',
  'CHECKIN_CLOSED',
  'ENDED',
])
export const semesterPeriodSchema = z.object({ period: z.number().int().positive(), startTime: z.string().regex(/^\d{2}:\d{2}$/), endTime: z.string().regex(/^\d{2}:\d{2}$/) })
export const semesterConfigSchema = z.object({ id: z.uuid(), code: z.string().min(1).max(32), name: z.string().min(1).max(120), startDate: z.iso.date(), endDate: z.iso.date(), standardPeriods: z.array(semesterPeriodSchema), active: z.boolean() })
export const classSchema = z.object({ id: z.uuid(), semesterId: z.uuid(), classCode: z.string().min(1).max(64), name: z.string().min(1).max(120) })
export const courseKindSchema = z.enum(['REQUIRED', 'ELECTIVE'])
export const courseSchema = z.object({ id: z.uuid(), semesterId: z.uuid(), projectId: z.uuid().nullable(), courseCode: z.string().min(1).max(64), name: z.string().min(1).max(160), kind: courseKindSchema, teacher: z.string().nullable() })
export const classTimetableSchema = z.object({ id: z.uuid(), classId: z.uuid(), courseId: z.uuid(), weekday: z.number().int().min(1).max(7), startPeriod: z.number().int().positive(), endPeriod: z.number().int().positive(), classroom: z.string().nullable(), teacher: z.string().nullable(), startWeek: z.number().int().positive(), endWeek: z.number().int().positive(), weekPattern: z.enum(['ALL', 'ODD', 'EVEN']), specifiedWeeks: z.array(z.number().int().positive()).nullable() })
export const semesterConfigResponseSchema = z.object({ semester: semesterConfigSchema, classes: z.array(classSchema), courses: z.array(courseSchema), timetable: z.array(classTimetableSchema) })
export const semesterConfigInputSchema = z.object({
  code: z.string().trim().min(1).max(32),
  name: z.string().trim().min(1).max(120),
  startDate: z.iso.date(),
  endDate: z.iso.date(),
  standardPeriods: z.array(semesterPeriodSchema).min(1),
  active: z.boolean().default(true),
  classes: z.array(z.object({ classCode: z.string().trim().min(1).max(64), name: z.string().trim().min(1).max(120) })).min(1),
  courses: z.array(z.object({ courseCode: z.string().trim().min(1).max(64), name: z.string().trim().min(1).max(160), kind: courseKindSchema, teacher: z.string().trim().max(120).nullable().optional() })).min(1),
  timetable: z.array(z.object({ classCode: z.string().trim().min(1).max(64), courseCode: z.string().trim().min(1).max(64), weekday: z.number().int().min(1).max(7), startPeriod: z.number().int().positive(), endPeriod: z.number().int().positive(), classroom: z.string().trim().max(160).nullable().optional(), teacher: z.string().trim().max(120).nullable().optional(), startWeek: z.number().int().positive(), endWeek: z.number().int().positive(), weekPattern: z.enum(['ALL', 'ODD', 'EVEN']).default('ALL'), specifiedWeeks: z.array(z.number().int().positive()).nullable().optional() })).min(1),
})
export const onboardingStatusSchema = z.enum(['NEEDS_BINDING', 'NEEDS_ELECTIVES', 'READY'])
export const onboardingResponseSchema = z.object({ status: onboardingStatusSchema, classOptions: z.array(classSchema), student: z.object({ id: z.uuid(), displayName: z.string(), classId: z.uuid() }).nullable(), electiveCourses: z.array(courseSchema), selectedCourseIds: z.array(z.uuid()) })
export const chooseClassInputSchema = z.object({ classId: z.uuid() })
export const verifyStudentInputSchema = z.object({ classId: z.uuid(), displayName: z.string().trim().min(1).max(120), studentNoLast4: z.string().regex(/^\d{4}$/) })
export const enrollElectivesInputSchema = z.object({ courseIds: z.array(z.uuid()).max(20) })
export const rosterEntrySchema = z.object({ classCode: z.string().trim().min(1).max(64), studentNo: z.string().trim().min(1).max(64), displayName: z.string().trim().min(1).max(120) })
export const rosterImportInputSchema = z.object({ semesterCode: z.string().trim().min(1).max(32), entries: z.array(rosterEntrySchema).min(1).max(10_000) })
export const wechatLoginInputSchema = z.object({ code: z.string().trim().min(1).max(512) })
export const webStudentLoginInputSchema = verifyStudentInputSchema
export const adminLoginInputSchema = z.object({ password: z.string().min(1).max(256) })
export const webStudentClassOptionSchema = z.object({ id: z.uuid(), classCode: z.string(), name: z.string(), studentNames: z.array(z.string()) })
export const webStudentLoginOptionsResponseSchema = z.object({ classes: z.array(webStudentClassOptionSchema) })
export const startAttendanceInputSchema = z.object({ durationMinutes: z.number().int().min(1).max(180).default(10) })
export const attendanceAdminActionSchema = z.enum(['PRESENT', 'LATE', 'LEAVE', 'ABSENT', 'VOID'])
export const attendanceAdminActionInputSchema = z.object({ projectMemberId: z.uuid(), status: attendanceAdminActionSchema })

export const attendanceRecordSchema = z.object({
  id: z.uuid(),
  sessionId: z.uuid(),
  projectMemberId: z.uuid(),
  userId: z.uuid().nullable(),
  checkedInAt: z.iso.datetime().nullable(),
  method: attendanceMethodSchema,
  source: attendanceSourceSchema,
  status: attendanceStatusSchema,
  distanceMeters: z.number().nullable(),
  accuracyMeters: z.number().nullable(),
  locationPassed: z.boolean().nullable(),
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

export const projectMemberSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  userId: z.uuid().nullable(),
  displayName: z.string().min(1).max(120),
  externalCode: z.string().max(120).nullable(),
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
export const projectMembersResponseSchema = z.object({ items: z.array(projectMemberSchema) })
export const sessionsResponseSchema = z.object({ items: z.array(sessionSummarySchema) })
export const timetableResponseSchema = z.object({ serverTime: z.iso.datetime(), items: z.array(sessionSummarySchema) })
export const attendanceRecordsResponseSchema = z.object({ items: z.array(attendanceRecordSchema) })
export const todayResponseSchema = z.object({
  serverTime: z.iso.datetime(),
  activeCheckin: sessionSummarySchema.nullable(),
  nextSession: sessionSummarySchema.nullable(),
  todaySessions: z.array(sessionSummarySchema),
})
export const attendanceLiveMemberSchema = z.object({ projectMemberId: z.uuid(), userId: z.uuid().nullable(), displayName: z.string(), externalCode: z.string().nullable(), status: z.enum(['PRESENT', 'LATE', 'LEAVE', 'ABSENT', 'PENDING']), checkedInAt: z.iso.datetime().nullable() })
export const attendanceLiveResponseSchema = z.object({ session: sessionSummarySchema, total: z.number().int().nonnegative(), present: z.number().int().nonnegative(), late: z.number().int().nonnegative(), leave: z.number().int().nonnegative(), absent: z.number().int().nonnegative(), pending: z.number().int().nonnegative(), records: z.array(attendanceRecordSchema), members: z.array(attendanceLiveMemberSchema) })

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

export const createProjectMemberInputSchema = z.object({
  userId: z.uuid().nullable().optional(),
  displayName: z.string().trim().min(1).max(120),
  externalCode: z.string().trim().max(120).nullable().optional(),
})

export const meResponseSchema = z.object({
  userId: z.uuid(),
  displayName: z.string().min(1),
  sessionType: z.enum(['WEB', 'MINI_PROGRAM', 'DEV']),
  identityProvider: z.enum(['WECHAT_MINIPROGRAM', 'CASDOOR', 'H5_WEB', 'ADMIN_PASSWORD', 'DEV']),
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
export type ProjectMember = z.infer<typeof projectMemberSchema>
export type CreateProjectMemberInput = z.infer<typeof createProjectMemberInputSchema>
export type TimetableResponse = z.infer<typeof timetableResponseSchema>
export type SemesterPeriod = z.infer<typeof semesterPeriodSchema>
export type SemesterConfig = z.infer<typeof semesterConfigSchema>
export type ClassSummary = z.infer<typeof classSchema>
export type Course = z.infer<typeof courseSchema>
export type ClassTimetable = z.infer<typeof classTimetableSchema>
export type SemesterConfigResponse = z.infer<typeof semesterConfigResponseSchema>
export type SemesterConfigInput = z.infer<typeof semesterConfigInputSchema>
export type OnboardingResponse = z.infer<typeof onboardingResponseSchema>
export type ChooseClassInput = z.infer<typeof chooseClassInputSchema>
export type VerifyStudentInput = z.infer<typeof verifyStudentInputSchema>
export type EnrollElectivesInput = z.infer<typeof enrollElectivesInputSchema>
export type RosterEntry = z.infer<typeof rosterEntrySchema>
export type RosterImportInput = z.infer<typeof rosterImportInputSchema>
export type WechatLoginInput = z.infer<typeof wechatLoginInputSchema>
export type WebStudentLoginInput = z.infer<typeof webStudentLoginInputSchema>
export type AdminLoginInput = z.infer<typeof adminLoginInputSchema>
export type WebStudentClassOption = z.infer<typeof webStudentClassOptionSchema>
export type WebStudentLoginOptionsResponse = z.infer<typeof webStudentLoginOptionsResponseSchema>
export type StartAttendanceInput = z.infer<typeof startAttendanceInputSchema>
export type AttendanceAdminActionInput = z.infer<typeof attendanceAdminActionInputSchema>
export type AttendanceLiveResponse = z.infer<typeof attendanceLiveResponseSchema>
