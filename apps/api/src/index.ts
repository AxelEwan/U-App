import { serve } from '@hono/node-server'
import { loadApiEnv, parseCorsOrigins } from '@qzu/config'

import { createApp } from './app'
import { assertSafeDatabaseTarget } from './database-target'
import { loadApiLocalEnv } from './env'
import { createDatabase } from '@qzu/db'
import { MySqlBusinessRepository } from './mysql-repository'
import { createCasdoorClient } from './casdoor'

loadApiLocalEnv()
const env = loadApiEnv()
assertSafeDatabaseTarget(env)

const database = env.REPOSITORY_MODE === 'mysql' ? createDatabase(env.DATABASE_URL!) : undefined
const repository = database ? new MySqlBusinessRepository(database.db) : undefined
const casdoor = env.CASDOOR_CLIENT_ID && env.CASDOOR_CLIENT_SECRET
  ? createCasdoorClient({ issuer: env.CASDOOR_ISSUER, clientId: env.CASDOOR_CLIENT_ID, clientSecret: env.CASDOOR_CLIENT_SECRET, redirectUri: env.CASDOOR_REDIRECT_URI })
  : undefined
const wechatConfigured = Boolean(env.WECHAT_APP_ID && env.WECHAT_APP_SECRET)
const app = createApp({
  corsOrigins: parseCorsOrigins(env.CORS_ORIGINS),
  devAuthEnabled: env.DEV_AUTH_ENABLED,
  ...(repository ? {
    resolveMiniProgramSession: (token: string) => repository.resolveMiniProgramSession(token),
    createMiniProgramSession: (providerSubject: string) => repository.createMiniProgramSession(providerSubject),
    resolveWebSession: (token: string) => repository.resolveWebSession(token),
    createWebStudentSession: (classId: string, displayName: string, studentNoLast4: string) => repository.createWebStudentSession(classId, displayName, studentNoLast4),
    createAdminWebSession: () => repository.createAdminWebSession(),
    createProviderSession: (provider, providerSubject, displayName) => repository.createProviderSession(provider, providerSubject, displayName),
    linkProviderIdentity: (userId, provider, providerSubject) => repository.linkProviderIdentity(userId, provider, providerSubject),
  } : {}),
  ...(casdoor ? { casdoorAuthorizationUrl: (returnUrl: string, targetUserId?: string) => casdoor.createAuthorizationUrl(returnUrl, targetUserId), handleCasdoorCallback: (url: string) => casdoor.handleCallback(url) } : {}),
  ...(env.ADMIN_LOGIN_SECRET_HASH ? { adminLoginSecretHash: env.ADMIN_LOGIN_SECRET_HASH } : {}),
  ...(wechatConfigured ? {
    exchangeWechatCode: async (code: string) => {
      const params = new URLSearchParams({ appid: env.WECHAT_APP_ID!, secret: env.WECHAT_APP_SECRET!, js_code: code, grant_type: 'authorization_code' })
      const response = await fetch(`https://api.weixin.qq.com/sns/jscode2session?${params.toString()}`)
      const value = await response.json() as { openid?: unknown; errcode?: unknown }
      if (!response.ok || typeof value.openid !== 'string' || value.errcode) throw new Error('WeChat authentication failed')
      return value.openid
    },
  } : {}),
  ...(repository ? { repository } : {}),
  publicH5Url: env.PUBLIC_H5_URL,
  publicAdminUrl: env.PUBLIC_ADMIN_URL,
  repositoryMode: env.REPOSITORY_MODE,
  ...(database ? { checkDatabaseReadiness: database.checkReadiness } : {}),
})

serve({ fetch: app.fetch, port: env.API_PORT }, (info) => {
  console.log(
    JSON.stringify({
      level: 'info',
      event: 'server_started',
      service: 'qzu-api',
      port: info.port,
      appEnv: env.APP_ENV,
      repository: env.REPOSITORY_MODE,
      auth: {
        wechat: wechatConfigured,
        casdoor: Boolean(casdoor),
        adminPassword: Boolean(env.ADMIN_LOGIN_SECRET_HASH),
      },
    }),
  )
})
