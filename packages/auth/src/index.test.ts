import { describe, expect, it } from 'vitest'

import { AuthDomainError, requireAdmin, type AdminAuthorizationPolicy } from './index'

const denyPolicy: AdminAuthorizationPolicy = {
  isProjectAdmin: () => Promise.resolve(false),
  isSystemAdmin: () => Promise.resolve(false),
}

describe('requireAdmin', () => {
  it('accepts Casdoor context only when all_authenticated is explicit', async () => {
    const context = { userId: 'user-a', identityProvider: 'CASDOOR', sessionType: 'WEB', capabilities: { canManageProjects: true } } as const
    await expect(
      requireAdmin({ context, policy: denyPolicy, mode: 'all_authenticated' }),
    ).resolves.toBe(context)
    await expect(
      requireAdmin({ context, policy: denyPolicy, mode: 'project_roles' }),
    ).rejects.toBeInstanceOf(AuthDomainError)
  })

  it('does not treat WeChat authentication as admin authentication', async () => {
    await expect(
      requireAdmin({
        context: {
          userId: 'user-a',
          identityProvider: 'WECHAT_MINIPROGRAM',
          sessionType: 'MINI_PROGRAM',
          capabilities: { canManageProjects: false },
        },
        policy: denyPolicy,
        mode: 'all_authenticated',
      }),
    ).rejects.toMatchObject({ code: 'ADMIN_REQUIRED' })
  })
})
