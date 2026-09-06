import { serve } from '@hono/node-server'
import { loadApiEnv, parseCorsOrigins } from '@qzu/config'

import { createApp } from './app'
import { assertSafeDatabaseTarget } from './database-target'
import { loadApiLocalEnv } from './env'
import { createMySqlRepository } from './mysql-repository'

loadApiLocalEnv()
const env = loadApiEnv()
assertSafeDatabaseTarget(env)

const repository = env.REPOSITORY_MODE === 'mysql'
  ? createMySqlRepository(env.DATABASE_URL!)
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
