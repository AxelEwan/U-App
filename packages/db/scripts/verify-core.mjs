/* global console, process */

import { openProductionPool, parseOption } from './production-db-guard.mjs'

const semesterCode = parseOption('--semester')
if (!semesterCode) throw new Error('Usage: pnpm db:verify-core --semester 2026-fall')

const { pool } = await openProductionPool({ readOnly: true })
const failures = []
try {
  const [[semester]] = await pool.query('SELECT id FROM semester_configs WHERE code = ? AND active = 1 LIMIT 1', [semesterCode])
  if (!semester) failures.push('active semester')
  const semesterId = semester?.id
  if (semesterId) {
    const [[classes]] = await pool.query('SELECT COUNT(*) AS count FROM classes WHERE semester_id = ?', [semesterId])
    const [[courses]] = await pool.query('SELECT COUNT(*) AS count FROM courses WHERE semester_id = ?', [semesterId])
    const [[timetable]] = await pool.query('SELECT COUNT(*) AS count FROM class_timetable JOIN classes ON classes.id = class_timetable.class_id WHERE classes.semester_id = ?', [semesterId])
    const [[students]] = await pool.query('SELECT COUNT(*) AS count FROM students JOIN classes ON classes.id = students.class_id WHERE classes.semester_id = ? AND students.active = 1', [semesterId])
    const [[sessions]] = await pool.query('SELECT COUNT(*) AS count FROM event_sessions JOIN courses ON courses.id = event_sessions.course_id WHERE courses.semester_id = ?', [semesterId])
    const [[projects]] = await pool.query('SELECT COUNT(*) AS count FROM courses JOIN projects ON projects.id = courses.project_id WHERE courses.semester_id = ? AND courses.kind = \'REQUIRED\' AND projects.status = \'ACTIVE\'', [semesterId])
    const [[policies]] = await pool.query('SELECT COUNT(*) AS count FROM courses JOIN attendance_policies ON attendance_policies.project_id = courses.project_id WHERE courses.semester_id = ? AND courses.kind = \'REQUIRED\'', [semesterId])
    if (Number(classes.count) === 0) failures.push('class')
    if (Number(courses.count) === 0) failures.push('course')
    if (Number(timetable.count) === 0) failures.push('class timetable')
    if (Number(students.count) === 0) failures.push('student')
    if (Number(projects.count) === 0) failures.push('required course project')
    if (Number(policies.count) === 0) failures.push('attendance policy')
    if (Number(sessions.count) === 0) failures.push('event session')
    if (failures.length === 0) console.log(JSON.stringify({ event: 'CORE_DATA_READY', semester: semesterCode, classes: Number(classes.count), courses: Number(courses.count), timetableRows: Number(timetable.count), students: Number(students.count), sessions: Number(sessions.count) }))
  }
} finally {
  await pool.end()
}

if (failures.length) {
  console.error(JSON.stringify({ event: 'CORE_DATA_NOT_READY', semester: semesterCode, missing: failures }))
  process.exitCode = 1
}
