import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import mysql from 'mysql2/promise'

import { scheduleRuleDateRange, timetableNaturalKey, validateAcademicConfig, type AcademicConfigInput } from '../../core/src/academic.ts'
import { stableUuid, timetableKey } from './academic-ids.mjs'
import { openProductionPool, parseOption } from './production-db-guard.mjs'

const file = parseOption('--file')
if (!file) throw new Error('Usage: pnpm db:import-academic --file /etc/u-app/private/2026-fall.academic.json')
const inputPath = resolve(file)
if (!existsSync(inputPath)) throw new Error('Academic config file does not exist')

let input: AcademicConfigInput
try {
  input = validateAcademicConfig(JSON.parse(readFileSync(inputPath, 'utf8')))
} catch (error) {
  throw new Error(`Academic config validation failed: ${error instanceof Error ? error.message : 'invalid JSON'}`)
}

const { pool } = await openProductionPool({ confirmation: { name: 'ACADEMIC_IMPORT_CONFIRM', value: 'u_app-production' } })
const actorUserId = stableUuid('u-app:academic-import-actor')
let classesInserted = 0
let classesUpdated = 0
let coursesInserted = 0
let coursesUpdated = 0
let timetableInserted = 0
let timetableUpdated = 0

async function one(connection: mysql.PoolConnection, sql: string, values: unknown[] = []) {
  const [rows] = await connection.execute(sql, values)
  return (rows as Record<string, unknown>[])[0]
}

async function many(connection: mysql.PoolConnection, sql: string, values: unknown[] = []) {
  const [rows] = await connection.execute(sql, values)
  return rows as Record<string, unknown>[]
}

try {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const semester = input.semester
    await connection.execute(
      'INSERT INTO users (id, display_name, avatar_url) VALUES (?, ?, NULL) ON DUPLICATE KEY UPDATE display_name = VALUES(display_name)',
      [actorUserId, 'U-App Academic Import'],
    )
    let semesterRow = await one(connection, 'SELECT id FROM semester_configs WHERE code = ? LIMIT 1', [semester.code])
    if (!semesterRow) {
      const semesterId = stableUuid(`u-app:semester:${semester.code}`)
      await connection.execute('INSERT INTO semester_configs (id, code, name, start_date, end_date, standard_periods, active) VALUES (?, ?, ?, ?, ?, ?, ?)', [semesterId, semester.code, semester.name, semester.startDate, semester.endDate, JSON.stringify(semester.standardPeriods), semester.active ? 1 : 0])
      semesterRow = { id: semesterId }
    } else {
      await connection.execute('UPDATE semester_configs SET name = ?, start_date = ?, end_date = ?, standard_periods = ?, active = ? WHERE id = ?', [semester.name, semester.startDate, semester.endDate, JSON.stringify(semester.standardPeriods), semester.active ? 1 : 0, semesterRow.id])
    }
    const semesterId = String(semesterRow.id)
    if (semester.active) await connection.execute('UPDATE semester_configs SET active = 0 WHERE id <> ?', [semesterId])

    const classIds = new Map<string, string>()
    for (const item of input.classes) {
      const existing = await one(connection, 'SELECT id FROM classes WHERE semester_id = ? AND class_code = ? LIMIT 1', [semesterId, item.classCode])
      const id = String(existing?.id ?? stableUuid(`u-app:class:${semester.code}:${item.classCode}`))
      if (existing) {
        await connection.execute('UPDATE classes SET name = ? WHERE id = ?', [item.name, id])
        classesUpdated += 1
      } else {
        await connection.execute('INSERT INTO classes (id, semester_id, class_code, name) VALUES (?, ?, ?, ?)', [id, semesterId, item.classCode, item.name])
        classesInserted += 1
      }
      classIds.set(item.classCode, id)
    }

    const courseIds = new Map<string, { id: string; projectId: string }>()
    for (const item of input.courses) {
      const existing = await one(connection, 'SELECT id, project_id FROM courses WHERE semester_id = ? AND course_code = ? LIMIT 1', [semesterId, item.courseCode])
      const courseId = String(existing?.id ?? stableUuid(`u-app:course:${semester.code}:${item.courseCode}`))
      const projectId = String(existing?.project_id ?? stableUuid(`u-app:project:${semester.code}:${item.courseCode}`))
      await connection.execute(
        'INSERT INTO projects (id, name, description, type, timezone, effective_start_date, effective_end_date, status, created_by) VALUES (?, ?, ?, \'COURSE\', \'Asia/Shanghai\', ?, ?, \'ACTIVE\', ?) ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description), timezone = VALUES(timezone), effective_start_date = VALUES(effective_start_date), effective_end_date = VALUES(effective_end_date), status = \'ACTIVE\'',
        [projectId, item.name, item.teacher, semester.startDate, semester.endDate, actorUserId],
      )
      await connection.execute('INSERT INTO project_admins (id, project_id, user_id, role) VALUES (?, ?, ?, \'OWNER\') ON DUPLICATE KEY UPDATE role = \'OWNER\'', [stableUuid(`u-app:project-admin:${projectId}:${actorUserId}`), projectId, actorUserId])
      await connection.execute(
        'INSERT INTO attendance_policies (id, project_id, roster_mode, check_in_open_minutes_before, check_in_close_minutes_after, require_location, require_passcode) VALUES (?, ?, \'ROSTER\', 15, 15, 0, 0) ON DUPLICATE KEY UPDATE roster_mode = \'ROSTER\', check_in_open_minutes_before = 15, check_in_close_minutes_after = 15, require_location = 0, require_passcode = 0',
        [stableUuid(`u-app:attendance-policy:${projectId}`), projectId],
      )
      if (existing) {
        await connection.execute('UPDATE courses SET project_id = ?, name = ?, kind = ?, teacher = ? WHERE id = ?', [projectId, item.name, item.kind, item.teacher, courseId])
        coursesUpdated += 1
      } else {
        await connection.execute('INSERT INTO courses (id, semester_id, project_id, course_code, name, kind, teacher) VALUES (?, ?, ?, ?, ?, ?, ?)', [courseId, semesterId, projectId, item.courseCode, item.name, item.kind, item.teacher])
        coursesInserted += 1
      }
      courseIds.set(item.courseCode, { id: courseId, projectId })
    }

    const periods = new Map(semester.standardPeriods.map((period) => [period.period, period]))
    for (const item of input.timetable) {
      const classId = classIds.get(item.classCode)
      const course = courseIds.get(item.courseCode)
      if (!classId || !course) throw new Error('Academic config references an unknown class or course')
      const periodStart = periods.get(item.startPeriod)
      const periodEnd = periods.get(item.endPeriod)
      if (!periodStart || !periodEnd) throw new Error('Academic config references an unknown period')
      const key = timetableNaturalKey(item)
      const existingRows = await many(connection, 'SELECT id FROM class_timetable WHERE class_id = ? AND course_id = ? AND weekday = ? AND start_period = ? AND end_period = ? AND start_week = ? AND end_week = ? AND week_pattern = ?', [classId, course.id, item.weekday, item.startPeriod, item.endPeriod, item.startWeek, item.endWeek, item.weekPattern])
      if (existingRows.length > 1) throw new Error(`Conflicting timetable rows already exist for ${key}`)
      const timetableId = String(existingRows[0]?.id ?? stableUuid(`u-app:timetable:${semester.code}:${timetableKey(item)}`))
      if (existingRows[0]) {
        await connection.execute('UPDATE class_timetable SET classroom = ?, teacher = ?, specified_weeks = ? WHERE id = ?', [item.classroom, item.teacher, item.specifiedWeeks ? JSON.stringify(item.specifiedWeeks) : null, timetableId])
        timetableUpdated += 1
      } else {
        await connection.execute('INSERT INTO class_timetable (id, class_id, course_id, weekday, start_period, end_period, classroom, teacher, start_week, end_week, week_pattern, specified_weeks) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [timetableId, classId, course.id, item.weekday, item.startPeriod, item.endPeriod, item.classroom, item.teacher, item.startWeek, item.endWeek, item.weekPattern, item.specifiedWeeks ? JSON.stringify(item.specifiedWeeks) : null])
        timetableInserted += 1
      }
      const ruleId = stableUuid(`u-app:schedule-rule:${semester.code}:${timetableKey(item)}`)
      const dates = scheduleRuleDateRange(semester, item)
      await connection.execute('INSERT INTO schedule_rules (id, project_id, weekdays, local_start_time, local_end_time, start_date, end_date, interval_weeks, timezone) VALUES (?, ?, ?, ?, ?, ?, ?, 1, \'Asia/Shanghai\') ON DUPLICATE KEY UPDATE project_id = VALUES(project_id), weekdays = VALUES(weekdays), local_start_time = VALUES(local_start_time), local_end_time = VALUES(local_end_time), start_date = VALUES(start_date), end_date = VALUES(end_date), interval_weeks = 1, timezone = \'Asia/Shanghai\'', [ruleId, course.projectId, JSON.stringify([item.weekday]), periodStart.startTime, periodEnd.endTime, dates.startDate, dates.endDate])
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

console.log(JSON.stringify({ event: 'academic_import_complete', semester: input.semester.code, classesInserted, classesUpdated, coursesInserted, coursesUpdated, timetableInserted, timetableUpdated }))
