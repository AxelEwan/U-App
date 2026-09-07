import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import mysql from 'mysql2/promise'
import { describe, expect, it } from 'vitest'

import { createDatabase } from './client'
import { MySqlBusinessRepository } from '../../../apps/api/src/mysql-repository'

const databaseUrl = process.env.MYSQL_INTEGRATION_DATABASE_URL
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const admin = {
  userId: '00000000-0000-4000-8000-000000000901',
  displayName: 'Integration Admin',
  identityProvider: 'CASDOOR' as const,
  sessionType: 'WEB' as const,
  capabilities: { canManageProjects: true },
}

async function applyCleanMigrations(url: string): Promise<mysql.Pool> {
  const parsed = new URL(url)
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ''))
  if (!database || database === 'u_app' || database === 'attendance_dev') throw new Error('MYSQL_INTEGRATION_DATABASE_URL must target a dedicated non-production database')
  const pool = mysql.createPool({ uri: url, connectionLimit: 2, timezone: 'Z' })
  const [currentRows] = await pool.query('SELECT DATABASE() AS database_name') as [{ database_name: string }[], unknown]
  const current = currentRows[0]
  if (!current || current.database_name !== database) throw new Error('MySQL integration database selection mismatch')
  const [existing] = await pool.query('SHOW TABLES') as [Record<string, unknown>[], unknown]
  if (existing.length) throw new Error('MySQL integration database must be empty before the test')
  for (const file of ['0000_clean_baseline.sql', '0001_exotic_earthquake.sql', '0002_orange_santa_claus.sql', '0003_deep_doctor_faustus.sql']) {
    const sql = await readFile(resolve(root, 'packages/db/migrations', file), 'utf8')
    for (const statement of sql.split(/--> statement-breakpoint\s*/).map((value) => value.trim()).filter(Boolean)) await pool.query(statement)
  }
  return pool
}

if (!databaseUrl) {
  if (process.env.MYSQL_INTEGRATION_REQUIRED === 'true') {
    describe('MySQL integration', () => { it('requires MYSQL_INTEGRATION_DATABASE_URL', () => { throw new Error('MYSQL_INTEGRATION_DATABASE_URL must target a dedicated empty non-production MySQL database') }) })
  } else {
    describe.skip('MySQL integration', () => { it('requires MYSQL_INTEGRATION_DATABASE_URL', () => undefined) })
  }
} else {
describe('MySQL integration', () => it('persists the class attendance flow in MySQL', async () => {
  const url = databaseUrl
  const pool = await applyCleanMigrations(url)
  const database = createDatabase(url)
  const repository = new MySqlBusinessRepository(database.db)
  try {
    const semester = await repository.syncSemesterConfig({
      code: 'integration-2026',
      name: 'Integration Semester',
      startDate: '2026-09-07',
      endDate: '2026-09-20',
      active: true,
      standardPeriods: [{ period: 1, startTime: '09:00', endTime: '10:00' }],
      classes: [{ classCode: 'TEST-01', name: 'Test Class' }],
      courses: [
        { courseCode: 'REQ-01', name: 'Required Test Course', kind: 'REQUIRED', teacher: null },
        { courseCode: 'ELE-01', name: 'Elective Test Course', kind: 'ELECTIVE', teacher: null },
      ],
      timetable: [
        { classCode: 'TEST-01', courseCode: 'REQ-01', weekday: 1, startPeriod: 1, endPeriod: 1, classroom: 'Test Room', teacher: null, startWeek: 1, endWeek: 2, weekPattern: 'ALL', specifiedWeeks: null },
        { classCode: 'TEST-01', courseCode: 'ELE-01', weekday: 2, startPeriod: 1, endPeriod: 1, classroom: 'Test Room 2', teacher: null, startWeek: 1, endWeek: 2, weekPattern: 'ALL', specifiedWeeks: null },
      ],
    }, admin)
    const imported = await repository.importRoster('integration-2026', [
      { classCode: 'TEST-01', studentNo: '20260042', displayName: 'Fictional Student A' },
      { classCode: 'TEST-01', studentNo: '20260043', displayName: 'Fictional Student B' },
    ], admin)
    expect(imported.imported).toBe(2)

    const classId = semester.classes[0]!.id
    const webSession = await repository.createWebStudentSession(classId, 'Fictional Student B', '0043')
    expect((await repository.resolveWebSession(webSession.token))?.identityProvider).toBe('H5_WEB')
    const adminWebSession = await repository.createAdminWebSession()
    expect((await repository.resolveWebSession(adminWebSession.token))?.capabilities.canManageProjects).toBe(true)
    const session = await repository.createMiniProgramSession('integration-openid-a')
    const onboarding = await repository.verifyStudent(session.userId, classId, 'Fictional Student A', '0042', 'integration-openid-a')
    expect(onboarding.status).toBe('NEEDS_ELECTIVES')
    await repository.enrollElectives(session.userId, [semester.courses.find((course) => course.kind === 'ELECTIVE')!.id])
    const timetable = await repository.getTimetable(session.userId)
    expect(timetable.items.length).toBeGreaterThan(0)

    const first = timetable.items[0]!
    const start = new Date(first.scheduledStartAt)
    await repository.startAttendance(first.id, 10, admin, new Date(start.getTime() - 60_000))
    const present = await repository.checkIn(first.id, session.userId, {}, start)
    expect(present.status).toBe('PRESENT')
    await expect(repository.checkIn(first.id, session.userId, {}, start)).rejects.toThrow('already')

    const lateSession = timetable.items.find((item) => item.id !== first.id)!
    const lateStart = new Date(lateSession.scheduledStartAt)
    const lateAt = new Date(lateStart.getTime() + 60_000)
    await repository.startAttendance(lateSession.id, 10, admin, new Date(lateStart.getTime() - 60_000))
    const late = await repository.checkIn(lateSession.id, session.userId, {}, lateAt)
    expect(late.status).toBe('LATE')

    const live = await repository.finalizeAttendance(first.id, admin, new Date(start.getTime() + 15 * 60_000))
    expect(live.records.length).toBeGreaterThanOrEqual(1)
    const member = live.members.find((item) => item.userId === session.userId)!
    const record = live.records.find((item) => item.projectMemberId === member.projectMemberId)!
    const changed = await repository.updateAttendance(first.id, { projectMemberId: member.projectMemberId, status: 'LEAVE' }, admin)
    expect(changed.status).toBe('LEAVE')
    const [auditRows] = await pool.query('SELECT COUNT(*) AS count FROM attendance_audit_logs WHERE attendance_record_id = ?', [record.id]) as [{ count: number }[], unknown]
    expect(Number(auditRows[0]?.count ?? 0)).toBeGreaterThan(0)
    const csv = await repository.exportAttendanceCsv(first.id)
    expect(csv.startsWith('\uFEFF')).toBe(true)
    expect(csv).toContain('Fictional Student A')
  } finally {
    await database.close()
    await pool.end()
  }
}))
}
