import mysql from 'mysql2/promise'

import { generateTimetableOccurrences, type AcademicSemesterInput, type AcademicTimetableInput } from '../../core/src/academic.ts'
import { stableUuid, timetableKey } from './academic-ids.mjs'
import { openProductionPool, parseOption } from './production-db-guard.mjs'

const semesterCode = parseOption('--semester')
if (!semesterCode) throw new Error('Usage: pnpm db:materialize-sessions --semester 2026-fall')

const { pool } = await openProductionPool({ confirmation: { name: 'SESSION_MATERIALIZE_CONFIRM', value: 'u_app-production' } })

async function one(connection: mysql.PoolConnection, sql: string, values: unknown[] = []) {
  const [rows] = await connection.execute(sql, values)
  return (rows as Record<string, unknown>[])[0]
}

async function many(connection: mysql.PoolConnection, sql: string, values: unknown[] = []) {
  const [rows] = await connection.execute(sql, values)
  return rows as Record<string, unknown>[]
}

let sessionsInserted = 0
let sessionsUpdated = 0
let sessionsExisting = 0

try {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const semesterRow = await one(connection, 'SELECT id, code, name, start_date, end_date, standard_periods, active FROM semester_configs WHERE code = ? LIMIT 1', [semesterCode])
    if (!semesterRow) throw new Error(`Semester not found: ${semesterCode}`)
    const standardPeriods = typeof semesterRow.standard_periods === 'string' ? JSON.parse(semesterRow.standard_periods) : semesterRow.standard_periods
    const semester: AcademicSemesterInput = { code: String(semesterRow.code), name: String(semesterRow.name), startDate: String(semesterRow.start_date), endDate: String(semesterRow.end_date), active: Boolean(semesterRow.active), standardPeriods }
    const rows = await many(connection, 'SELECT ct.id, ct.class_id, ct.course_id, ct.weekday, ct.start_period, ct.end_period, ct.classroom, ct.teacher, ct.start_week, ct.end_week, ct.week_pattern, ct.specified_weeks, c.class_code, co.course_code, co.project_id FROM class_timetable ct JOIN classes c ON c.id = ct.class_id JOIN courses co ON co.id = ct.course_id WHERE c.semester_id = ? ORDER BY ct.id', [semesterRow.id])
    if (!rows.length) throw new Error(`No timetable rows found for semester: ${semesterCode}`)

    for (const row of rows) {
      if (!row.project_id) throw new Error(`Course ${String(row.course_code)} has no attendance project`)
      const specifiedWeeks = row.specified_weeks === null || row.specified_weeks === undefined ? null : typeof row.specified_weeks === 'string' ? JSON.parse(row.specified_weeks) : row.specified_weeks
      const timetable: AcademicTimetableInput = {
        classCode: String(row.class_code),
        courseCode: String(row.course_code),
        weekday: Number(row.weekday),
        startPeriod: Number(row.start_period),
        endPeriod: Number(row.end_period),
        classroom: row.classroom === null ? null : String(row.classroom),
        teacher: row.teacher === null ? null : String(row.teacher),
        startWeek: Number(row.start_week),
        endWeek: Number(row.end_week),
        weekPattern: row.week_pattern as AcademicTimetableInput['weekPattern'],
        specifiedWeeks,
      }
      const startPeriod = semester.standardPeriods.find((period) => period.period === timetable.startPeriod)
      const endPeriod = semester.standardPeriods.find((period) => period.period === timetable.endPeriod)
      if (!startPeriod || !endPeriod) throw new Error(`Timetable ${String(row.id)} references an unknown standard period`)
      const policy = await one(connection, 'SELECT check_in_open_minutes_before, check_in_close_minutes_after FROM attendance_policies WHERE project_id = ? LIMIT 1', [row.project_id])
      if (!policy) throw new Error(`Course ${String(row.course_code)} has no attendance policy`)
      const occurrences = generateTimetableOccurrences(semester, timetable, startPeriod.startTime, endPeriod.endTime)
      const scheduleRuleId = stableUuid(`u-app:schedule-rule:${semesterCode}:${timetableKey(timetable)}`)
      for (const occurrence of occurrences) {
        const startAt = occurrence.scheduledStartAt
        const endAt = occurrence.scheduledEndAt
        const openAt = new Date(startAt.getTime() - Number(policy.check_in_open_minutes_before) * 60_000)
        const closeAt = new Date(endAt.getTime() + Number(policy.check_in_close_minutes_after) * 60_000)
        const existing = await one(connection, 'SELECT id, attendance_started_at FROM event_sessions WHERE project_id = ? AND course_id = ? AND scheduled_start_at = ? LIMIT 1', [row.project_id, row.course_id, startAt])
        if (!existing) {
          await connection.execute('INSERT INTO event_sessions (id, project_id, schedule_rule_id, course_id, scheduled_start_at, scheduled_end_at, checkin_open_at, checkin_close_at, location_name, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, \'SCHEDULED\')', [stableUuid(`u-app:event-session:${semesterCode}:${timetableKey(timetable)}:${occurrence.localDate}`), row.project_id, scheduleRuleId, row.course_id, startAt, endAt, openAt, closeAt, row.classroom])
          sessionsInserted += 1
        } else if (existing.attendance_started_at === null) {
          await connection.execute('UPDATE event_sessions SET scheduled_end_at = ?, checkin_open_at = ?, checkin_close_at = ?, location_name = ? WHERE id = ?', [endAt, openAt, closeAt, row.classroom, existing.id])
          sessionsUpdated += 1
        } else {
          sessionsExisting += 1
        }
      }
    }
    await connection.commit()
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
} finally {
  await pool.end()
}

console.log(JSON.stringify({ event: 'session_materialize_complete', semester: semesterCode, sessionsInserted, sessionsUpdated, sessionsExisting }))
