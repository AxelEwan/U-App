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

  it('rejects wildcard CORS configuration', () => {
    expect(() => parseCorsOrigins('https://qzu.x-lab.top,*')).toThrow(
      'Wildcard CORS origins are not allowed',
    )
  })
})
