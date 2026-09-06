export type IdentityProvider = 'WECHAT_MINIPROGRAM' | 'CASDOOR' | 'DEV'
export type SessionType = 'WEB' | 'MINI_PROGRAM' | 'DEV'

export interface AuthCapabilities {
  readonly canManageProjects: boolean
}

export interface AuthContext {
  readonly userId: string
  readonly displayName?: string
  readonly avatarUrl?: string | null
  readonly identityProvider: IdentityProvider
  readonly sessionType: SessionType
  readonly capabilities: AuthCapabilities
}

export type AdminMode = 'all_authenticated' | 'project_roles'

export class AuthDomainError extends Error {
  public constructor(
    public readonly code: 'AUTHENTICATION_REQUIRED' | 'ADMIN_REQUIRED',
    message: string,
  ) {
    super(message)
    this.name = 'AuthDomainError'
  }
}

export interface AdminAuthorizationPolicy {
  isSystemAdmin(context: AuthContext): Promise<boolean>
  isProjectAdmin(context: AuthContext, projectId: string): Promise<boolean>
}

export interface RequireAdminInput {
  readonly context: AuthContext | null
  readonly policy: AdminAuthorizationPolicy
  readonly mode: AdminMode
  readonly projectId?: string
}

export async function requireAdmin(input: RequireAdminInput): Promise<AuthContext> {
  const { context, mode, policy, projectId } = input
  if (!context) {
    throw new AuthDomainError('AUTHENTICATION_REQUIRED', 'Authentication is required')
  }

  if (mode === 'all_authenticated') {
    if (!context.capabilities.canManageProjects) {
      throw new AuthDomainError('ADMIN_REQUIRED', 'Administrator access is required')
    }
    return context
  }

  const allowed = projectId
    ? await policy.isProjectAdmin(context, projectId)
    : await policy.isSystemAdmin(context)
  if (!allowed) {
    throw new AuthDomainError('ADMIN_REQUIRED', 'Administrator access is required')
  }
  return context
}

export interface OidcAdminProvider {
  createAuthorizationUrl(input: { returnUrl: string }): Promise<string>
  handleCallback(input: { url: string }): Promise<{ providerSubject: string }>
}

export interface WechatAuthProvider {
  exchangeCode(code: string): Promise<{ providerSubject: string }>
}
