import { describe, expect, it } from 'vitest'

import { loadApiEnv, parseCorsOrigins } from './index'

describe('API environment', () => {
  it('fails closed when dev auth is enabled in production', () => {
    expect(() =>
      loadApiEnv({
        NODE_ENV: 'production',
        APP_ENV: 'production',
        DEV_AUTH_ENABLED: 'true',
        AUTH_SESSION_SECRET: 'a-secure-production-value-with-32-chars',
      }),
    ).toThrow()
  })

  it('fails closed when production selects the memory repository', () => {
    expect(() =>
      loadApiEnv({
        NODE_ENV: 'production',
        APP_ENV: 'production',
        REPOSITORY_MODE: 'memory',
        DEV_AUTH_ENABLED: 'false',
        AUTH_SESSION_SECRET: 'a-secure-production-value-with-32-chars',
      }),
    ).toThrow('Production must use the MySQL repository')
  })

  it('allows production core API startup before optional auth providers are configured', () => {
    const env = loadApiEnv({
      NODE_ENV: 'production',
      APP_ENV: 'production',
      REPOSITORY_MODE: 'mysql',
      DATABASE_URL: 'mysql://u_app:test@127.0.0.1:3306/u_app',
      DEV_AUTH_ENABLED: 'false',
      AUTH_SESSION_SECRET: 'a-secure-production-value-with-32-chars',
      CORS_ORIGINS: 'https://u.x-lab.top,https://qzu-admin.x-lab.top',
    })

    expect(env.ADMIN_LOGIN_SECRET_HASH).toBeUndefined()
    expect(env.CASDOOR_CLIENT_SECRET).toBeUndefined()
    expect(env.WECHAT_APP_SECRET).toBeUndefined()
  })

  it('rejects wildcard CORS configuration', () => {
    expect(() => parseCorsOrigins('https://qzu.x-lab.top,*')).toThrow(
      'Wildcard CORS origins are not allowed',
    )
  })
})
