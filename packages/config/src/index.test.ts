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

  it('allows production startup when optional auth providers are not configured', () => {
    expect(loadApiEnv({
      NODE_ENV: 'production',
      APP_ENV: 'production',
      REPOSITORY_MODE: 'mysql',
      DATABASE_URL: 'mysql://user:password@127.0.0.1:3306/u_app',
      DEV_AUTH_ENABLED: 'false',
      AUTH_SESSION_SECRET: 'a-secure-production-value-with-32-chars',
    })).toMatchObject({ NODE_ENV: 'production', APP_ENV: 'production', REPOSITORY_MODE: 'mysql' })
  })

  it('rejects wildcard CORS configuration', () => {
    expect(() => parseCorsOrigins('https://qzu.x-lab.top,*')).toThrow(
      'Wildcard CORS origins are not allowed',
    )
  })
})
