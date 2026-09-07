import { z } from 'zod'

const booleanFromString = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true')

const optionalSecret = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().min(1).optional(),
)

const apiEnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    APP_ENV: z.enum(['development', 'staging', 'production']).default('development'),
    API_PORT: z.coerce.number().int().min(1).max(65_535).default(3004),
    REPOSITORY_MODE: z.enum(['memory', 'mysql']).default('memory'),
    DATABASE_URL: optionalSecret.pipe(z.string().url().optional()),
    CORS_ORIGINS: z.string().default('http://localhost:3000,http://localhost:10086'),
    AUTH_SESSION_SECRET: optionalSecret,
    ADMIN_LOGIN_SECRET_HASH: optionalSecret,
    DEV_AUTH_ENABLED: booleanFromString,
    CASDOOR_ISSUER: z.string().url().default('https://auth.x-lab.top'),
    CASDOOR_CLIENT_ID: optionalSecret,
    CASDOOR_CLIENT_SECRET: optionalSecret,
    CASDOOR_REDIRECT_URI: z.string().url().default('https://api-u.x-lab.top/api/v1/auth/casdoor/callback'),
    CASDOOR_ADMIN_MODE: z.enum(['all_authenticated']).optional(),
    WECHAT_APP_ID: optionalSecret,
    WECHAT_APP_SECRET: optionalSecret,
    PUBLIC_H5_URL: z.string().url().default('https://u.x-lab.top'),
    PUBLIC_ADMIN_URL: z.string().url().default('https://qzu-admin.x-lab.top'),
    PUBLIC_API_URL: z.string().url().default('https://api-u.x-lab.top'),
  })
  .superRefine((env, context) => {
    const isProduction = env.NODE_ENV === 'production' || env.APP_ENV === 'production'
    if (isProduction && env.DEV_AUTH_ENABLED) {
      context.addIssue({
        code: 'custom',
        path: ['DEV_AUTH_ENABLED'],
        message: 'DEV_AUTH_ENABLED must be false in production',
      })
    }
    if (isProduction && !env.AUTH_SESSION_SECRET) {
      context.addIssue({
        code: 'custom',
        path: ['AUTH_SESSION_SECRET'],
        message: 'AUTH_SESSION_SECRET is required in production',
      })
    }
    if (isProduction && !env.ADMIN_LOGIN_SECRET_HASH) {
      context.addIssue({
        code: 'custom',
        path: ['ADMIN_LOGIN_SECRET_HASH'],
        message: 'ADMIN_LOGIN_SECRET_HASH is required in production',
      })
    }
    if (isProduction && env.REPOSITORY_MODE !== 'mysql') {
      context.addIssue({ code: 'custom', path: ['REPOSITORY_MODE'], message: 'Production must use the MySQL repository' })
    }
    if (env.REPOSITORY_MODE === 'mysql' && !env.DATABASE_URL) {
      context.addIssue({ code: 'custom', path: ['DATABASE_URL'], message: 'DATABASE_URL is required when REPOSITORY_MODE=mysql' })
    }
    if (isProduction && (!env.CASDOOR_CLIENT_ID || !env.CASDOOR_CLIENT_SECRET)) {
      context.addIssue({ code: 'custom', path: ['CASDOOR_CLIENT_ID'], message: 'Production Casdoor credentials are required' })
    }
  })

export type ApiEnv = z.infer<typeof apiEnvSchema>

export function loadApiEnv(input: Record<string, string | undefined> = process.env): ApiEnv {
  return apiEnvSchema.parse(input)
}

export function parseCorsOrigins(value: string): readonly string[] {
  const origins = value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)

  if (origins.some((origin) => origin === '*')) {
    throw new Error('Wildcard CORS origins are not allowed')
  }

  return Object.freeze(origins)
}
