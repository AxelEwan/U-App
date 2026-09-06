import type { ApiEnv } from '@qzu/config'

const LOCAL_DATABASE_HOSTS = new Set(['127.0.0.1', 'localhost'])

type DatabaseTargetEnv = Pick<ApiEnv, 'APP_ENV' | 'DATABASE_URL' | 'REPOSITORY_MODE'>

function readDatabaseName(url: URL): string | undefined {
  const segments = url.pathname.split('/').filter(Boolean)
  const databaseName = segments.at(-1)
  return databaseName ? decodeURIComponent(databaseName) : undefined
}

function invalidTarget(message: string): never {
  throw new Error(message)
}

export function assertSafeDatabaseTarget(env: DatabaseTargetEnv): void {
  if (env.REPOSITORY_MODE !== 'mysql') return
  if (!env.DATABASE_URL) invalidTarget('DATABASE_URL is required for MySQL repository mode')

  let url: URL
  try {
    url = new URL(env.DATABASE_URL)
  } catch {
    invalidTarget('DATABASE_URL must be a valid MySQL URL')
  }

  if (url.protocol !== 'mysql:') invalidTarget('DATABASE_URL must use the mysql protocol')

  const databaseName = readDatabaseName(url)
  const host = url.hostname.toLowerCase()

  if (env.APP_ENV === 'development') {
    if (databaseName !== 'u_app' || !LOCAL_DATABASE_HOSTS.has(host) || url.port !== '13306') {
      invalidTarget('DATABASE_URL must target the local u_app SSH tunnel')
    }
    return
  }

  if (env.APP_ENV === 'production') {
    if (databaseName !== 'u_app' || !LOCAL_DATABASE_HOSTS.has(host) || (url.port !== '' && url.port !== '3306')) {
      invalidTarget('DATABASE_URL must target the local production u_app MySQL instance')
    }
    return
  }

  if (env.APP_ENV === 'staging') {
    invalidTarget('MySQL staging database target is not configured')
  }

  invalidTarget(`Unsupported APP_ENV for MySQL repository mode: ${env.APP_ENV}`)
}
