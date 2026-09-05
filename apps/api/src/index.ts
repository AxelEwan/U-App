import { serve } from '@hono/node-server'
import { loadApiEnv, parseCorsOrigins } from '@qzu/config'

import { createApp } from './app'
import { loadApiLocalEnv } from './env'

loadApiLocalEnv()
const env = loadApiEnv()
function assertSafeDevelopmentDatabase(databaseUrl: string): void {
  try {
    const url = new URL(databaseUrl)
    const databaseName = url.pathname.replace(/^\//, '').split('/').pop()
    if (databaseName !== 'u_app' || !['127.0.0.1', 'localhost'].includes(url.hostname) || url.port !== '13306') throw new Error('DATABASE_URL must target the local u_app SSH tunnel')
  } catch {
    throw new Error('DATABASE_URL must target the local u_app SSH tunnel')
  }
}

if (env.REPOSITORY_MODE === 'mysql' && env.DATABASE_URL) assertSafeDevelopmentDatabase(env.DATABASE_URL)

const repository = env.REPOSITORY_MODE === 'mysql' && env.DATABASE_URL
  ? (await import('./mysql-repository')).createMySqlRepository(env.DATABASE_URL)
  : undefined
const app = createApp({
  corsOrigins: parseCorsOrigins(env.CORS_ORIGINS),
  devAuthEnabled: env.DEV_AUTH_ENABLED,
  ...(repository ? { repository } : {}),
})

serve({ fetch: app.fetch, port: env.API_PORT }, (info) => {
  console.log(
    JSON.stringify({
      level: 'info',
      event: 'server_started',
      service: 'qzu-api',
      port: info.port,
      appEnv: env.APP_ENV,
    }),
  )
})
