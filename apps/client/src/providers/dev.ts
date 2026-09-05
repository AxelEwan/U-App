import type { AuthProvider, ClientAuthSession } from './types'

const devSession: ClientAuthSession = {
  userId: '00000000-0000-4000-8000-000000000002',
  method: 'DEV',
}

export class DevAuthProvider implements AuthProvider {
  private session: ClientAuthSession | null = null

  public currentSession(): Promise<ClientAuthSession | null> {
    return Promise.resolve(this.session)
  }

  public signIn(): Promise<ClientAuthSession> {
    this.session = devSession
    return Promise.resolve(devSession)
  }

  public signOut(): Promise<void> {
    this.session = null
    return Promise.resolve()
  }
}
