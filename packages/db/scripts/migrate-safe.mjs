/* global process, URL, console */

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import mysql from 'mysql2/promise'
import { drizzle } from 'drizzle-orm/mysql2'
import { migrate } from 'drizzle-orm/mysql2/migrator'

const root = process.cwd()
const envPath = resolve(root, 'apps/api/.env.local')

function readEnvFile(path) {
  if (!existsSync(path)) return {}
  return Object.fromEntries(readFileSync(path, 'utf8').split(/\r?\n/).flatMap((line) => {
    const match = /^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line)
    return match ? [[match[1], match[2].replace(/^['"]|['"]$/g, '')]] : []
  }))
}

const env = { ...readEnvFile(envPath), ...process.env }
const databaseUrl = env.DATABASE_URL
const appEnv = env.APP_ENV

if (!databaseUrl) throw new Error('DATABASE_URL is required in the process environment or apps/api/.env.local')
if (!appEnv) throw new Error('APP_ENV must be explicitly set before running database migration')

let url
try {
  url = new URL(databaseUrl)
} catch {
  throw new Error('DATABASE_URL must be a valid MySQL URL')
}

if (url.protocol !== 'mysql:') throw new Error('DATABASE_URL must use the mysql protocol')

let databaseName
try {
  databaseName = decodeURIComponent(url.pathname.split('/').filter(Boolean).at(-1) ?? '')
} catch {
  throw new Error('DATABASE_URL must target the u_app database')
}

const host = url.hostname.toLowerCase()
const isLoopback = host === '127.0.0.1' || host === 'localhost'

if (appEnv === 'development') {
  if (!isLoopback || url.port !== '13306' || databaseName !== 'u_app') {
    throw new Error('Development migration requires u_app through the local SSH tunnel at 127.0.0.1:13306')
  }
} else if (appEnv === 'production') {
  if (env.NODE_ENV !== 'production') {
    throw new Error('Production migration requires NODE_ENV=production')
  }
  if (!isLoopback || (url.port !== '' && url.port !== '3306') || databaseName !== 'u_app') {
    throw new Error('Production migration requires same-server u_app MySQL at 127.0.0.1:3306')
  }
  if (env.MIGRATION_CONFIRM !== 'u_app-production') {
    throw new Error('Production migration requires MIGRATION_CONFIRM=u_app-production')
  }
} else if (appEnv === 'staging') {
  throw new Error('Staging migration is not configured')
} else {
  throw new Error(`Unsupported APP_ENV for migration: ${appEnv}`)
}

const pool = mysql.createPool({ uri: databaseUrl, connectionLimit: 2, timezone: 'Z' })
const allowedTables = new Set([
  '__drizzle_migrations',
  'users',
  'user_identities',
  'web_auth_sessions',
  'mini_program_auth_sessions',
  'web_login_challenges',
  'projects',
  'project_admins',
  'project_groups',
  'project_members',
  'schedule_rules',
  'event_sessions',
  'attendance_policies',
  'attendance_records',
  'custom_field_definitions',
  'attendance_field_values',
])

try {
  const [[database]] = await pool.query('SELECT DATABASE() AS database_name')
  if (database.database_name !== 'u_app') throw new Error('Migration target is not u_app')

  const [rows] = await pool.query('SHOW TABLES')
  const tables = rows.map((row) => Object.values(row)[0]).filter((value) => typeof value === 'string')
  const unknown = tables.filter((table) => !allowedTables.has(table))
  if (unknown.length) throw new Error(`Migration stopped: unknown tables exist (${unknown.join(', ')})`)
  if (tables.some((table) => table !== '__drizzle_migrations') && !tables.includes('__drizzle_migrations')) {
    throw new Error('Migration stopped: existing business tables have no Drizzle migration history')
  }

  console.log(JSON.stringify({ event: 'migration_preflight_ok', appEnv, database: 'u_app', tableCount: tables.length }))
  await migrate(drizzle(pool), { migrationsFolder: resolve(root, 'packages/db/migrations') })
  console.log(JSON.stringify({ event: 'migration_complete', appEnv, database: 'u_app' }))
} finally {
  await pool.end()
}
