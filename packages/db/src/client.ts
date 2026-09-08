import { drizzle } from 'drizzle-orm/mysql2'
import { createPool, type Pool } from 'mysql2/promise'

import * as schema from './schema'

export const requiredRuntimeTables = [
  'users',
  'user_identities',
  'web_auth_sessions',
  'mini_program_auth_sessions',
  'semester_configs',
  'classes',
  'courses',
  'class_timetable',
  'students',
  'student_bindings',
  'student_course_enrollments',
  'projects',
  'project_members',
  'event_sessions',
  'attendance_policies',
  'attendance_records',
] as const

export interface DatabaseReadiness {
  readonly database: 'ok' | 'unavailable'
  readonly schema: 'ok' | 'incomplete' | 'unavailable'
  readonly missingTables: readonly string[]
}

export async function checkPoolReadiness(pool: Pool, expectedDatabase = 'u_app'): Promise<DatabaseReadiness> {
  try {
    const [[databaseRow]] = await pool.query('SELECT DATABASE() AS database_name') as [{ database_name?: string | null }[], unknown]
    if (databaseRow?.database_name !== expectedDatabase) return { database: 'unavailable', schema: 'unavailable', missingTables: [] }
    const [tableRows] = await pool.query('SHOW TABLES') as [Record<string, unknown>[], unknown]
    const tables = new Set(tableRows.map((row) => Object.values(row)[0]).filter((value): value is string => typeof value === 'string'))
    const missingTables = requiredRuntimeTables.filter((table) => !tables.has(table))
    return { database: 'ok', schema: missingTables.length ? 'incomplete' : 'ok', missingTables }
  } catch {
    return { database: 'unavailable', schema: 'unavailable', missingTables: [] }
  }
}

export function createDatabase(databaseUrl: string) {
  if (!databaseUrl) throw new Error('DATABASE_URL is required to create a database client')
  const pool = createPool({ uri: databaseUrl, connectionLimit: 10, timezone: 'Z' })
  return {
    db: drizzle(pool, { schema, mode: 'default' }),
    close: () => pool.end(),
    checkReadiness: () => checkPoolReadiness(pool),
  }
}

export type Database = ReturnType<typeof createDatabase>['db']
