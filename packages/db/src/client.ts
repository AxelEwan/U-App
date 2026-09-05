import { drizzle } from 'drizzle-orm/mysql2'
import { createPool } from 'mysql2/promise'

import * as schema from './schema'

export function createDatabase(databaseUrl: string) {
  if (!databaseUrl) throw new Error('DATABASE_URL is required to create a database client')
  const pool = createPool({ uri: databaseUrl, connectionLimit: 10, timezone: 'Z' })
  return {
    db: drizzle(pool, { schema, mode: 'default' }),
    close: () => pool.end(),
  }
}

export type Database = ReturnType<typeof createDatabase>['db']
