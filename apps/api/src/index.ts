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
  ...(repository ? {
    resolveMiniProgramSession: (token: string) => repository.resolveMiniProgramSession(token),
    createMiniProgramSession: (providerSubject: string) => repository.createMiniProgramSession(providerSubject),
  } : {}),
  ...(env.WECHAT_APP_ID && env.WECHAT_APP_SECRET ? {
    exchangeWechatCode: async (code: string) => {
      const params = new URLSearchParams({ appid: env.WECHAT_APP_ID!, secret: env.WECHAT_APP_SECRET!, js_code: code, grant_type: 'authorization_code' })
      const response = await fetch(`https://api.weixin.qq.com/sns/jscode2session?${params.toString()}`)
      const value = await response.json() as { openid?: unknown; errcode?: unknown }
      if (!response.ok || typeof value.openid !== 'string' || value.errcode) throw new Error('WeChat authentication failed')
      return value.openid
    },
  } : {}),
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
