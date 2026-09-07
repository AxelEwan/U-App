import {
  boolean,
  char,
  date,
  decimal,
  foreignKey,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  time,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core'

const uuid = (name: string) =>
  varchar(name, { length: 36 }).$defaultFn(() => crypto.randomUUID())

const createdAt = timestamp('created_at', { mode: 'date', fsp: 3 }).defaultNow().notNull()
const updatedAt = timestamp('updated_at', { mode: 'date', fsp: 3 })
  .defaultNow()
  .$onUpdate(() => new Date())
  .notNull()

export const users = mysqlTable('users', {
  id: uuid('id').primaryKey(),
  displayName: varchar('display_name', { length: 120 }).notNull(),
  avatarUrl: varchar('avatar_url', { length: 500 }),
  createdAt,
  updatedAt,
})

export const userIdentities = mysqlTable(
  'user_identities',
  {
    id: uuid('id').primaryKey(),
    userId: varchar('user_id', { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: mysqlEnum('provider', ['WECHAT_MINIPROGRAM', 'CASDOOR']).notNull(),
    providerSubject: varchar('provider_subject', { length: 255 }).notNull(),
    createdAt,
  },
  (table) => [
    uniqueIndex('user_identities_provider_subject_uq').on(table.provider, table.providerSubject),
    index('user_identities_user_idx').on(table.userId),
  ],
)

export const webAuthSessions = mysqlTable(
  'web_auth_sessions',
  {
    id: uuid('id').primaryKey(),
    userId: varchar('user_id', { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: char('token_hash', { length: 64 }).notNull(),
    authMethod: mysqlEnum('auth_method', ['CASDOOR', 'WECHAT_CONFIRMATION', 'H5_STUDENT', 'ADMIN_PASSWORD', 'DEV']).notNull(),
    createdAt,
    expiresAt: timestamp('expires_at', { mode: 'date', fsp: 3 }).notNull(),
    revokedAt: timestamp('revoked_at', { mode: 'date', fsp: 3 }),
    lastSeenAt: timestamp('last_seen_at', { mode: 'date', fsp: 3 }),
  },
  (table) => [
    uniqueIndex('web_auth_sessions_token_hash_uq').on(table.tokenHash),
    index('web_auth_sessions_user_expiry_idx').on(table.userId, table.expiresAt),
  ],
)

export const miniProgramAuthSessions = mysqlTable(
  'mini_program_auth_sessions',
  {
    id: uuid('id').primaryKey(),
    userId: varchar('user_id', { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: char('token_hash', { length: 64 }).notNull(),
    createdAt,
    expiresAt: timestamp('expires_at', { mode: 'date', fsp: 3 }).notNull(),
    revokedAt: timestamp('revoked_at', { mode: 'date', fsp: 3 }),
    lastSeenAt: timestamp('last_seen_at', { mode: 'date', fsp: 3 }),
  },
  (table) => [
    uniqueIndex('mini_program_auth_sessions_token_hash_uq').on(table.tokenHash),
    index('mini_program_auth_sessions_user_expiry_idx').on(table.userId, table.expiresAt),
  ],
)

export const webLoginChallenges = mysqlTable(
  'web_login_challenges',
  {
    id: uuid('id').primaryKey(),
    challengeHash: char('challenge_hash', { length: 64 }).notNull(),
    shortCodeHash: char('short_code_hash', { length: 64 }).notNull(),
    browserBindingHash: char('browser_binding_hash', { length: 64 }).notNull(),
    status: mysqlEnum('status', ['PENDING', 'APPROVED', 'DENIED', 'CONSUMED', 'EXPIRED'])
      .default('PENDING')
      .notNull(),
    approvedUserId: varchar('approved_user_id', { length: 36 }).references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt,
    expiresAt: timestamp('expires_at', { mode: 'date', fsp: 3 }).notNull(),
    approvedAt: timestamp('approved_at', { mode: 'date', fsp: 3 }),
    consumedAt: timestamp('consumed_at', { mode: 'date', fsp: 3 }),
  },
  (table) => [
    uniqueIndex('web_login_challenges_hash_uq').on(table.challengeHash),
    index('web_login_challenges_short_code_idx').on(table.shortCodeHash, table.status),
    index('web_login_challenges_expiry_idx').on(table.expiresAt),
  ],
)

export const projects = mysqlTable(
  'projects',
  {
    id: uuid('id').primaryKey(),
    name: varchar('name', { length: 160 }).notNull(),
    description: text('description'),
    type: mysqlEnum('type', ['COURSE', 'ACTIVITY']).notNull(),
    timezone: varchar('timezone', { length: 64 }).default('Asia/Shanghai').notNull(),
    effectiveStartDate: date('effective_start_date', { mode: 'string' }).notNull(),
    effectiveEndDate: date('effective_end_date', { mode: 'string' }),
    status: mysqlEnum('status', ['DRAFT', 'ACTIVE', 'ARCHIVED']).default('DRAFT').notNull(),
    createdBy: varchar('created_by', { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt,
    updatedAt,
  },
  (table) => [index('projects_status_start_idx').on(table.status, table.effectiveStartDate)],
)

export const projectAdmins = mysqlTable(
  'project_admins',
  {
    id: uuid('id').primaryKey(),
    projectId: varchar('project_id', { length: 36 })
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: varchar('user_id', { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: mysqlEnum('role', ['OWNER', 'MANAGER']).default('MANAGER').notNull(),
    createdAt,
  },
  (table) => [
    uniqueIndex('project_admins_project_user_uq').on(table.projectId, table.userId),
    index('project_admins_user_idx').on(table.userId),
  ],
)

export const projectGroups = mysqlTable(
  'project_groups',
  {
    id: uuid('id').primaryKey(),
    projectId: varchar('project_id', { length: 36 })
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 120 }).notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [uniqueIndex('project_groups_project_name_uq').on(table.projectId, table.name)],
)

export const projectMembers = mysqlTable(
  'project_members',
  {
    id: uuid('id').primaryKey(),
    projectId: varchar('project_id', { length: 36 })
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    groupId: varchar('group_id', { length: 36 }).references(() => projectGroups.id, {
      onDelete: 'set null',
    }),
    displayName: varchar('display_name', { length: 120 }).notNull(),
    externalCode: varchar('external_code', { length: 120 }),
    userId: varchar('user_id', { length: 36 }).references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex('project_members_project_user_uq').on(table.projectId, table.userId),
    index('project_members_project_group_idx').on(table.projectId, table.groupId),
    index('project_members_external_code_idx').on(table.projectId, table.externalCode),
  ],
)

export const scheduleRules = mysqlTable(
  'schedule_rules',
  {
    id: uuid('id').primaryKey(),
    projectId: varchar('project_id', { length: 36 })
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    weekdays: json('weekdays').$type<number[]>().notNull(),
    localStartTime: time('local_start_time').notNull(),
    localEndTime: time('local_end_time').notNull(),
    startDate: date('start_date', { mode: 'string' }).notNull(),
    endDate: date('end_date', { mode: 'string' }).notNull(),
    intervalWeeks: int('interval_weeks', { unsigned: true }).default(1).notNull(),
    timezone: varchar('timezone', { length: 64 }).notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [index('schedule_rules_project_dates_idx').on(table.projectId, table.startDate, table.endDate)],
)

export const eventSessions = mysqlTable(
  'event_sessions',
  {
    id: uuid('id').primaryKey(),
    projectId: varchar('project_id', { length: 36 })
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    scheduleRuleId: varchar('schedule_rule_id', { length: 36 }).references(() => scheduleRules.id, {
      onDelete: 'set null',
    }),
    courseId: varchar('course_id', { length: 36 }),
    scheduledStartAt: timestamp('scheduled_start_at', { mode: 'date', fsp: 3 }).notNull(),
    scheduledEndAt: timestamp('scheduled_end_at', { mode: 'date', fsp: 3 }).notNull(),
    checkinOpenAt: timestamp('checkin_open_at', { mode: 'date', fsp: 3 }).notNull(),
    checkinCloseAt: timestamp('checkin_close_at', { mode: 'date', fsp: 3 }).notNull(),
    attendanceStartedAt: timestamp('attendance_started_at', { mode: 'date', fsp: 3 }),
    attendanceFinalizedAt: timestamp('attendance_finalized_at', { mode: 'date', fsp: 3 }),
    locationName: varchar('location_name', { length: 255 }),
    status: mysqlEnum('status', ['SCHEDULED', 'CANCELLED', 'COMPLETED'])
      .default('SCHEDULED')
      .notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [
    index('event_sessions_project_start_idx').on(table.projectId, table.scheduledStartAt),
    index('event_sessions_course_start_idx').on(table.courseId, table.scheduledStartAt),
    index('event_sessions_rule_idx').on(table.scheduleRuleId),
    uniqueIndex('event_sessions_rule_start_uq').on(table.scheduleRuleId, table.scheduledStartAt),
  ],
)

export const attendancePolicies = mysqlTable(
  'attendance_policies',
  {
    id: uuid('id').primaryKey(),
    projectId: varchar('project_id', { length: 36 })
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    rosterMode: mysqlEnum('roster_mode', ['ROSTER', 'FREE_FORM', 'MIXED'])
      .default('ROSTER')
      .notNull(),
    checkInOpenMinutesBefore: int('check_in_open_minutes_before', { unsigned: true }).default(15).notNull(),
    checkInCloseMinutesAfter: int('check_in_close_minutes_after', { unsigned: true }).default(15).notNull(),
    requireLocation: boolean('require_location').default(false).notNull(),
    requirePasscode: boolean('require_passcode').default(false).notNull(),
    locationName: varchar('location_name', { length: 255 }),
    centerLatitude: decimal('center_latitude', { precision: 10, scale: 7 }),
    centerLongitude: decimal('center_longitude', { precision: 10, scale: 7 }),
    radiusMeters: int('radius_meters', { unsigned: true }),
    passcodeHash: varchar('passcode_hash', { length: 255 }),
    createdAt,
    updatedAt,
  },
  (table) => [uniqueIndex('attendance_policies_project_uq').on(table.projectId)],
)

export const attendanceRecords = mysqlTable(
  'attendance_records',
  {
    id: uuid('id').primaryKey(),
    sessionId: varchar('session_id', { length: 36 })
      .notNull()
      .references(() => eventSessions.id, { onDelete: 'cascade' }),
    projectMemberId: varchar('project_member_id', { length: 36 })
      .notNull()
      .references(() => projectMembers.id, { onDelete: 'restrict' }),
    userId: varchar('user_id', { length: 36 }).references(() => users.id, {
      onDelete: 'set null',
    }),
    checkedInAt: timestamp('checked_in_at', { mode: 'date', fsp: 3 }),
    method: mysqlEnum('method', ['MANUAL', 'PASSCODE', 'LOCATION', 'COMBINED']).notNull(),
    source: mysqlEnum('source', ['SELF_CHECKIN', 'ADMIN']).notNull(),
    status: mysqlEnum('status', ['PRESENT', 'LATE', 'LEAVE', 'ABSENT']).default('PRESENT').notNull(),
    distanceMeters: decimal('distance_meters', { precision: 10, scale: 2 }),
    accuracyMeters: decimal('accuracy_meters', { precision: 10, scale: 2 }),
    locationPassed: boolean('location_passed'),
    createdAt,
    createdByUserId: varchar('created_by_user_id', { length: 36 }).references(() => users.id, {
      onDelete: 'set null',
    }),
    voidedAt: timestamp('voided_at', { mode: 'date', fsp: 3 }),
    voidedByUserId: varchar('voided_by_user_id', { length: 36 }).references(() => users.id, {
      onDelete: 'set null',
    }),
    updatedAt,
  },
  (table) => [
    uniqueIndex('attendance_records_session_member_uq').on(table.sessionId, table.projectMemberId),
    index('attendance_records_user_checked_idx').on(table.userId, table.checkedInAt),
  ],
)

export const customFieldDefinitions = mysqlTable(
  'custom_field_definitions',
  {
    id: uuid('id').primaryKey(),
    projectId: varchar('project_id', { length: 36 })
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 120 }).notNull(),
    type: mysqlEnum('type', ['TEXT', 'SINGLE_SELECT', 'MULTI_SELECT']).notNull(),
    required: boolean('required').default(false).notNull(),
    options: json('options').$type<string[]>(),
    sortOrder: int('sort_order').default(0).notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex('custom_field_definitions_project_name_uq').on(table.projectId, table.name),
  ],
)

export const attendanceFieldValues = mysqlTable(
  'attendance_field_values',
  {
    id: uuid('id').primaryKey(),
    attendanceRecordId: varchar('attendance_record_id', { length: 36 })
      .notNull(),
    fieldDefinitionId: varchar('field_definition_id', { length: 36 })
      .notNull(),
    textValue: text('text_value'),
    selectedValues: json('selected_values').$type<string[]>(),
    createdAt,
  },
  (table) => [
    foreignKey({
      columns: [table.attendanceRecordId],
      foreignColumns: [attendanceRecords.id],
      name: 'afv_attendance_record_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.fieldDefinitionId],
      foreignColumns: [customFieldDefinitions.id],
      name: 'afv_field_definition_fk',
    }).onDelete('restrict'),
    uniqueIndex('attendance_field_values_record_definition_uq').on(
      table.attendanceRecordId,
      table.fieldDefinitionId,
    ),
  ],
)

export const semesterConfigs = mysqlTable(
  'semester_configs',
  {
    id: uuid('id').primaryKey(),
    code: varchar('code', { length: 32 }).notNull(),
    name: varchar('name', { length: 120 }).notNull(),
    startDate: date('start_date', { mode: 'string' }).notNull(),
    endDate: date('end_date', { mode: 'string' }).notNull(),
    standardPeriods: json('standard_periods').$type<readonly { period: number; startTime: string; endTime: string }[]>().notNull(),
    active: boolean('active').default(false).notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [uniqueIndex('semester_configs_code_uq').on(table.code)],
)

export const classes = mysqlTable(
  'classes',
  {
    id: uuid('id').primaryKey(),
    semesterId: varchar('semester_id', { length: 36 }).notNull().references(() => semesterConfigs.id, { onDelete: 'cascade' }),
    classCode: varchar('class_code', { length: 64 }).notNull(),
    name: varchar('name', { length: 120 }).notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [uniqueIndex('classes_semester_code_uq').on(table.semesterId, table.classCode)],
)

export const courses = mysqlTable(
  'courses',
  {
    id: uuid('id').primaryKey(),
    semesterId: varchar('semester_id', { length: 36 }).notNull().references(() => semesterConfigs.id, { onDelete: 'cascade' }),
    projectId: varchar('project_id', { length: 36 }).references(() => projects.id, { onDelete: 'set null' }),
    courseCode: varchar('course_code', { length: 64 }).notNull(),
    name: varchar('name', { length: 160 }).notNull(),
    kind: mysqlEnum('kind', ['REQUIRED', 'ELECTIVE']).notNull(),
    teacher: varchar('teacher', { length: 120 }),
    createdAt,
    updatedAt,
  },
  (table) => [uniqueIndex('courses_semester_code_uq').on(table.semesterId, table.courseCode)],
)

export const classTimetable = mysqlTable(
  'class_timetable',
  {
    id: uuid('id').primaryKey(),
    classId: varchar('class_id', { length: 36 }).notNull().references(() => classes.id, { onDelete: 'cascade' }),
    courseId: varchar('course_id', { length: 36 }).notNull().references(() => courses.id, { onDelete: 'cascade' }),
    weekday: int('weekday', { unsigned: true }).notNull(),
    startPeriod: int('start_period', { unsigned: true }).notNull(),
    endPeriod: int('end_period', { unsigned: true }).notNull(),
    classroom: varchar('classroom', { length: 160 }),
    teacher: varchar('teacher', { length: 120 }),
    startWeek: int('start_week', { unsigned: true }).notNull(),
    endWeek: int('end_week', { unsigned: true }).notNull(),
    weekPattern: mysqlEnum('week_pattern', ['ALL', 'ODD', 'EVEN']).default('ALL').notNull(),
    specifiedWeeks: json('specified_weeks').$type<readonly number[] | null>(),
    createdAt,
    updatedAt,
  },
  (table) => [index('class_timetable_class_weekday_idx').on(table.classId, table.weekday)],
)

export const students = mysqlTable(
  'students',
  {
    id: uuid('id').primaryKey(),
    studentNo: varchar('student_no', { length: 64 }).notNull(),
    displayName: varchar('display_name', { length: 120 }).notNull(),
    classId: varchar('class_id', { length: 36 }).notNull().references(() => classes.id, { onDelete: 'restrict' }),
    active: boolean('active').default(true).notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [uniqueIndex('students_student_no_uq').on(table.studentNo), index('students_class_active_idx').on(table.classId, table.active)],
)

export const studentBindings = mysqlTable(
  'student_bindings',
  {
    id: uuid('id').primaryKey(),
    studentId: varchar('student_id', { length: 36 }).notNull().references(() => students.id, { onDelete: 'cascade' }),
    userId: varchar('user_id', { length: 36 }).notNull().references(() => users.id, { onDelete: 'cascade' }),
    createdAt,
    updatedAt,
  },
  (table) => [uniqueIndex('student_bindings_student_uq').on(table.studentId), uniqueIndex('student_bindings_user_uq').on(table.userId)],
)

export const studentCourseEnrollments = mysqlTable(
  'student_course_enrollments',
  {
    id: uuid('id').primaryKey(),
    studentId: varchar('student_id', { length: 36 }).notNull().references(() => students.id, { onDelete: 'cascade' }),
    courseId: varchar('course_id', { length: 36 }).notNull().references(() => courses.id, { onDelete: 'cascade' }),
    createdAt,
  },
  (table) => [uniqueIndex('student_course_enrollments_student_course_uq').on(table.studentId, table.courseId)],
)

export const attendanceAuditLogs = mysqlTable(
  'attendance_audit_logs',
  {
    id: uuid('id').primaryKey(),
    attendanceRecordId: varchar('attendance_record_id', { length: 36 })
      .notNull(),
    operatorUserId: varchar('operator_user_id', { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    previousStatus: mysqlEnum('previous_status', ['PRESENT', 'LATE', 'LEAVE', 'ABSENT']),
    newStatus: mysqlEnum('new_status', ['PRESENT', 'LATE', 'LEAVE', 'ABSENT']).notNull(),
    createdAt,
  },
  (table) => [
    foreignKey({
      columns: [table.attendanceRecordId],
      foreignColumns: [attendanceRecords.id],
      name: 'aal_attendance_record_fk',
    }).onDelete('cascade'),
    index('attendance_audit_record_created_idx').on(table.attendanceRecordId, table.createdAt),
  ],
)
