import { describe, expect, it } from 'vitest'

import { assertSafeDatabaseTarget } from './database-target'

type DatabaseTargetEnv = Parameters<typeof assertSafeDatabaseTarget>[0]

function target(overrides: Partial<DatabaseTargetEnv> = {}): DatabaseTargetEnv {
  return {
    APP_ENV: 'development',
    REPOSITORY_MODE: 'mysql',
    DATABASE_URL: 'mysql://user:password@127.0.0.1:13306/u_app',
    ...overrides,
  }
}

describe('database target guard', () => {
  it('allows the development SSH tunnel target', () => {
    expect(() => assertSafeDatabaseTarget(target())).not.toThrow()
  })

  it('rejects the development MySQL port', () => {
    expect(() => assertSafeDatabaseTarget(target({ DATABASE_URL: 'mysql://user:password@127.0.0.1:3306/u_app' }))).toThrow(
      'local u_app SSH tunnel',
    )
  })

  it('allows the production MySQL target on loopback with an explicit port', () => {
    expect(() => assertSafeDatabaseTarget(target({
      APP_ENV: 'production',
      DATABASE_URL: 'mysql://user:password@127.0.0.1:3306/u_app',
    }))).not.toThrow()
  })

  it('allows localhost and the default production MySQL port', () => {
    expect(() => assertSafeDatabaseTarget(target({
      APP_ENV: 'production',
      DATABASE_URL: 'mysql://user:password@localhost:3306/u_app',
    }))).not.toThrow()
    expect(() => assertSafeDatabaseTarget(target({
      APP_ENV: 'production',
      DATABASE_URL: 'mysql://user:password@localhost/u_app',
    }))).not.toThrow()
  })

  it('rejects a production public address', () => {
    expect(() => assertSafeDatabaseTarget(target({
      APP_ENV: 'production',
      DATABASE_URL: 'mysql://user:password@203.0.113.10:3306/u_app',
    }))).toThrow('local production u_app MySQL instance')
  })

  it('rejects a production database with the wrong name', () => {
    expect(() => assertSafeDatabaseTarget(target({
      APP_ENV: 'production',
      DATABASE_URL: 'mysql://user:password@127.0.0.1:3306/other_database',
    }))).toThrow('local production u_app MySQL instance')
  })

  it('fails closed for an unconfigured staging MySQL target', () => {
    expect(() => assertSafeDatabaseTarget(target({ APP_ENV: 'staging' }))).toThrow(
      'MySQL staging database target is not configured',
    )
  })

  it('does not inspect a URL when memory mode is explicit', () => {
    expect(() => assertSafeDatabaseTarget(target({
      REPOSITORY_MODE: 'memory',
      DATABASE_URL: 'mysql://user:password@203.0.113.10:3306/other_database',
    }))).not.toThrow()
  })
})
