export interface ClientAuthSession {
  readonly userId: string
  readonly method: 'WECHAT_MINIPROGRAM' | 'DEV'
}

export interface AuthProvider {
  signIn(): Promise<ClientAuthSession>
  signOut(): Promise<void>
  currentSession(): Promise<ClientAuthSession | null>
}

export interface LocationEvidence {
  readonly latitude: number
  readonly longitude: number
  readonly accuracy: number
}

export interface LocationProvider {
  getCurrentLocation(): Promise<LocationEvidence>
}

export interface ShareProvider {
  share(input: { title: string; path: string }): Promise<void>
}
