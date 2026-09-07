/* global process, URL, console */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import mysql from 'mysql2/promise'

const args = new Map()
for (let index = 2; index < process.argv.length; index += 2) args.set(process.argv[index], process.argv[index + 1])
const file = args.get('--file')
const semesterCode = args.get('--semester')
if (!file || !semesterCode) throw new Error('Usage: pnpm db:import-roster --file private-data/class.roster.csv --semester 2026-fall')
if (!existsSync(resolve(file))) throw new Error('Roster file does not exist')
const env = process.env
const databaseUrl = env.DATABASE_URL
if (!databaseUrl) throw new Error('DATABASE_URL is required')
const url = new URL(databaseUrl)
const database = decodeURIComponent(url.pathname.split('/').filter(Boolean).at(-1) ?? '')
const host = url.hostname.toLowerCase()
const loopback = host === '127.0.0.1' || host === 'localhost'
if (database !== 'u_app' || !loopback) throw new Error('Roster import only allows the loopback u_app database')
if (env.APP_ENV === 'development' && url.port !== '13306') throw new Error('Development roster import requires the local SSH tunnel at port 13306')
if (env.APP_ENV === 'production' && (env.NODE_ENV !== 'production' || (url.port && url.port !== '3306') || env.ROSTER_IMPORT_CONFIRM !== 'u_app-production')) throw new Error('Production roster import requires NODE_ENV=production and ROSTER_IMPORT_CONFIRM=u_app-production')
if (!['development', 'production'].includes(env.APP_ENV)) throw new Error('APP_ENV must be development or production')

function parseCsv(value) {
  const rows = []; let row = []; let cell = ''; let quoted = false
  for (let index = 0; index < value.length; index += 1) { const char = value[index]; const next = value[index + 1]; if (char === '"' && quoted && next === '"') { cell += '"'; index += 1 } else if (char === '"') quoted = !quoted; else if (char === ',' && !quoted) { row.push(cell); cell = '' } else if ((char === '\n' || char === '\r') && !quoted) { if (char === '\r' && next === '\n') index += 1; row.push(cell); if (row.some((item) => item !== '')) rows.push(row); row = []; cell = '' } else cell += char }
  if (cell || row.length) { row.push(cell); rows.push(row) }
  const [header, ...data] = rows
  const required = ['class_code', 'student_no', 'display_name']
  if (!header || required.some((name) => header.indexOf(name) < 0)) throw new Error('CSV header must be class_code,student_no,display_name')
  return data.map((values) => Object.fromEntries(required.map((name) => [name, String(values[header.indexOf(name)] ?? '').trim()]))).filter((item) => item.class_code && item.student_no && item.display_name)
}

const rows = parseCsv(readFileSync(resolve(file), 'utf8'))
if (!rows.length) throw new Error('Roster CSV is empty')
const pool = mysql.createPool({ uri: databaseUrl, connectionLimit: 2, timezone: 'Z' })
try {
  const [[databaseRow]] = await pool.query('SELECT DATABASE() AS database_name')
  if (databaseRow.database_name !== 'u_app') throw new Error('Roster import target is not u_app')
  const [tables] = await pool.query('SHOW TABLES')
  const tableNames = tables.map((row) => Object.values(row)[0])
  for (const name of ['semester_configs', 'classes', 'students', 'courses', 'class_timetable', 'project_members']) if (!tableNames.includes(name)) throw new Error(`Missing required table: ${name}`)
  let imported = 0
  let skipped = 0
  let conflicts = 0
  await pool.query('START TRANSACTION')
  try {
    const [semesters] = await pool.query('SELECT id FROM semester_configs WHERE code = ? LIMIT 1', [semesterCode])
    if (!semesters[0]) throw new Error('Semester configuration not found')
    for (const row of rows) {
      const [classes] = await pool.query('SELECT id FROM classes WHERE semester_id = ? AND class_code = ? LIMIT 1', [semesters[0].id, row.class_code])
      if (!classes[0]) throw new Error('Roster references an unknown class')
      const [existingStudents] = await pool.query('SELECT display_name, class_id FROM students WHERE student_no = ? LIMIT 1', [row.student_no])
      if (existingStudents[0] && existingStudents[0].class_id === classes[0].id && existingStudents[0].display_name === row.display_name) { skipped += 1; continue }
      if (existingStudents[0]) { conflicts += 1; continue }
      await pool.query('INSERT INTO students (id, student_no, display_name, class_id, active) VALUES (UUID(), ?, ?, ?, 1)', [row.student_no, row.display_name, classes[0].id])
      const [projects] = await pool.query('SELECT DISTINCT courses.project_id FROM class_timetable JOIN courses ON courses.id = class_timetable.course_id WHERE class_timetable.class_id = ? AND courses.kind = \'REQUIRED\' AND courses.project_id IS NOT NULL', [classes[0].id])
      for (const project of projects) { const [members] = await pool.query('SELECT id FROM project_members WHERE project_id = ? AND external_code = ? LIMIT 1', [project.project_id, row.student_no]); if (!members[0]) await pool.query('INSERT INTO project_members (id, project_id, user_id, display_name, external_code) VALUES (UUID(), ?, NULL, ?, ?)', [project.project_id, row.display_name, row.student_no]) }
      imported += 1
    }
    await pool.query('COMMIT')
  } catch (error) { await pool.query('ROLLBACK'); throw error }
  console.log(JSON.stringify({ event: 'roster_import_complete', semesterCode, imported, skipped, conflicts }))
} finally { await pool.end() }
