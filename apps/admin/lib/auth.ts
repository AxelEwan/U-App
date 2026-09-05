export interface AdminSession {
  readonly userId: string
  readonly displayName: string
  readonly method: 'DEV' | 'CASDOOR'
}

export function getDevelopmentAdminSession(): AdminSession | null {
  if (process.env.NODE_ENV === 'production' || process.env.DEV_AUTH_ENABLED !== 'true') return null
  return { userId: '00000000-0000-4000-8000-000000000001', displayName: 'Admin A', method: 'DEV' }
}
