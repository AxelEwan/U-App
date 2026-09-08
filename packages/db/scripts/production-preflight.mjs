/* global console */

import { openProductionPool } from './production-db-guard.mjs'

const { pool } = await openProductionPool({ readOnly: true })
const requiredTables = ['semester_configs', 'classes', 'courses', 'class_timetable', 'students', 'event_sessions']

try {
  const [tableRows] = await pool.query('SHOW TABLES')
  const tables = tableRows.map((row) => Object.values(row)[0]).filter((value) => typeof value === 'string')
  const migrationState = tables.length === 0 ? 'EMPTY' : tables.includes('__drizzle_migrations') ? 'MANAGED' : 'UNKNOWN'
  const counts = {}
  for (const table of requiredTables) {
    if (tables.includes(table)) {
      const [[row]] = await pool.query(`SELECT COUNT(*) AS count FROM \`${table}\``)
      counts[table] = Number(row.count)
    } else counts[table] = 0
  }
  console.log(JSON.stringify({
    database: 'u_app',
    host: '127.0.0.1',
    port: 3306,
    migrationState,
    tables: tables.length,
    academicData: {
      semesters: counts.semester_configs,
      classes: counts.classes,
      courses: counts.courses,
      timetableRows: counts.class_timetable,
      students: counts.students,
      sessions: counts.event_sessions,
    },
    unknownTables: tables.filter((table) => !['__drizzle_migrations', 'users', 'user_identities', 'web_auth_sessions', 'mini_program_auth_sessions', 'web_login_challenges', 'projects', 'project_admins', 'project_groups', 'project_members', 'schedule_rules', 'event_sessions', 'attendance_policies', 'attendance_records', 'custom_field_definitions', 'attendance_field_values', 'semester_configs', 'classes', 'courses', 'class_timetable', 'students', 'student_bindings', 'student_course_enrollments', 'attendance_audit_logs'].includes(table)),
  }))
} finally {
  await pool.end()
}
