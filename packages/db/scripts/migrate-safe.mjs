/* global process, URL, console */

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import mysql from 'mysql2/promise'
import { drizzle } from 'drizzle-orm/mysql2'
import { migrate } from 'drizzle-orm/mysql2/migrator'

const envPath = resolve(process.cwd(), 'apps/api/.env.local')
if (!existsSync(envPath)) throw new Error('apps/api/.env.local is missing; fill it locally before migrating')
const env = Object.fromEntries(readFileSync(envPath, 'utf8').split(/\r?\n/).flatMap((line) => {
  const match = /^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line)
  return match ? [[match[1], match[2].replace(/^['"]|['"]$/g, '')]] : []
}))
if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required in apps/api/.env.local')
const url = new URL(env.DATABASE_URL)
const databaseName = url.pathname.replace(/^\//, '').split('/').pop()
if (databaseName !== 'u_app' || !['127.0.0.1', 'localhost'].includes(url.hostname) || url.port !== '13306') throw new Error('Migration requires the local u_app SSH tunnel at 127.0.0.1:13306')

const pool = mysql.createPool({ uri: env.DATABASE_URL, connectionLimit: 2, timezone: 'Z' })
try {
  const [[database]] = await pool.query('SELECT DATABASE() AS database_name')
  if (database.database_name !== 'u_app') throw new Error('Migration target is not u_app')
  const [rows] = await pool.query('SHOW TABLES')
  const allowed = new Set(['__drizzle_migrations', 'users', 'user_identities', 'web_auth_sessions', 'mini_program_auth_sessions', 'web_login_challenges', 'projects', 'project_admins', 'project_groups', 'project_members', 'schedule_rules', 'event_sessions', 'attendance_policies', 'attendance_records', 'custom_field_definitions', 'attendance_field_values'])
  const tables = rows.map((row) => Object.values(row)[0])
  const unknown = tables.filter((table) => !allowed.has(table))
  if (unknown.length) throw new Error(`Migration stopped: unknown tables exist (${unknown.length})`)
  console.log(JSON.stringify({ event: 'migration_preflight_ok', database: 'u_app', tableCount: tables.length }))
  await migrate(drizzle(pool), { migrationsFolder: resolve(process.cwd(), 'packages/db/migrations') })
  console.log(JSON.stringify({ event: 'migration_complete', database: 'u_app' }))
} finally {
  await pool.end()
}
