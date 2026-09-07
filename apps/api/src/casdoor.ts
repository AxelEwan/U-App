import { createHash, createPublicKey, randomBytes, randomUUID, verify } from 'node:crypto'

type Discovery = { authorization_endpoint: string; token_endpoint: string; jwks_uri: string; issuer: string }
type State = { verifier: string; nonce: string; returnUrl: string; targetUserId?: string; expiresAt: number }

const base64url = (value: Buffer): string => value.toString('base64url')
const decodeJson = <T>(value: string): T => JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as T

export interface CasdoorCallbackResult {
  readonly providerSubject: string
  readonly displayName: string
  readonly targetUserId?: string
  readonly returnUrl: string
}

export function createCasdoorClient(input: { issuer: string; clientId: string; clientSecret: string; redirectUri: string }) {
  const states = new Map<string, State>()
  let discovery: Discovery | null = null
  let jwks: { keys: readonly Record<string, unknown>[]; expiresAt: number } | null = null

  const getDiscovery = async (): Promise<Discovery> => {
    if (discovery) return discovery
    const response = await fetch(`${input.issuer.replace(/\/$/, '')}/.well-known/openid-configuration`)
    if (!response.ok) throw new Error('Casdoor discovery failed')
    discovery = await response.json() as Discovery
    return discovery
  }

  const createAuthorizationUrl = async (returnUrl: string, targetUserId?: string): Promise<string> => {
    const metadata = await getDiscovery()
    const verifier = base64url(randomBytes(32))
    const challenge = base64url(createHash('sha256').update(verifier).digest())
    const nonce = randomUUID()
    const state = base64url(randomBytes(32))
    states.set(state, { verifier, nonce, returnUrl, ...(targetUserId ? { targetUserId } : {}), expiresAt: Date.now() + 5 * 60_000 })
    const url = new URL(metadata.authorization_endpoint)
    url.search = new URLSearchParams({ client_id: input.clientId, redirect_uri: input.redirectUri, response_type: 'code', scope: 'openid profile email', state, nonce, code_challenge: challenge, code_challenge_method: 'S256' }).toString()
    return url.toString()
  }

  const getJwks = async (metadata: Discovery): Promise<readonly Record<string, unknown>[]> => {
    if (jwks && jwks.expiresAt > Date.now()) return jwks.keys
    const response = await fetch(metadata.jwks_uri)
    if (!response.ok) throw new Error('Casdoor JWKS fetch failed')
    const value = await response.json() as { keys?: readonly Record<string, unknown>[] }
    jwks = { keys: value.keys ?? [], expiresAt: Date.now() + 10 * 60_000 }
    return jwks.keys
  }

  const validateIdToken = async (token: string, metadata: Discovery, nonce: string): Promise<Record<string, unknown>> => {
    const parts = token.split('.')
    if (parts.length !== 3) throw new Error('Invalid Casdoor ID token')
    const header = decodeJson<{ alg?: string; kid?: string }>(parts[0]!)
    const claims = decodeJson<Record<string, unknown>>(parts[1]!)
    if (header.alg !== 'RS256' || typeof header.kid !== 'string') throw new Error('Unsupported Casdoor ID token')
    const jwk = (await getJwks(metadata)).find((key) => key.kid === header.kid)
    if (!jwk) throw new Error('Casdoor signing key not found')
    const valid = verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), createPublicKey({ key: jwk, format: 'jwk' }), Buffer.from(parts[2]!, 'base64url'))
    const audience = Array.isArray(claims.aud) ? claims.aud.filter((value): value is string => typeof value === 'string') : typeof claims.aud === 'string' ? [claims.aud] : []
    if (!valid || claims.iss !== metadata.issuer || !audience.includes(input.clientId) || typeof claims.sub !== 'string' || typeof claims.exp !== 'number' || claims.exp <= Math.floor(Date.now() / 1000) || claims.nonce !== nonce) throw new Error('Invalid Casdoor ID token claims')
    return claims
  }

  const handleCallback = async (urlValue: string): Promise<CasdoorCallbackResult> => {
    const url = new URL(urlValue)
    const stateValue = url.searchParams.get('state')
    const code = url.searchParams.get('code')
    const state = stateValue ? states.get(stateValue) : undefined
    if (!state || state.expiresAt <= Date.now() || !code) throw new Error('Invalid Casdoor callback state')
    states.delete(stateValue!)
    const metadata = await getDiscovery()
    const response = await fetch(metadata.token_endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', client_id: input.clientId, client_secret: input.clientSecret, redirect_uri: input.redirectUri, code, code_verifier: state.verifier }) })
    if (!response.ok) throw new Error('Casdoor token exchange failed')
    const tokens = await response.json() as { id_token?: unknown }
    if (typeof tokens.id_token !== 'string') throw new Error('Casdoor ID token missing')
    const claims = await validateIdToken(tokens.id_token, metadata, state.nonce)
    const displayName = typeof claims.name === 'string' ? claims.name : typeof claims.preferred_username === 'string' ? claims.preferred_username : typeof claims.email === 'string' ? claims.email : 'X-Lab 用户'
    return { providerSubject: claims.sub as string, displayName, ...(state.targetUserId ? { targetUserId: state.targetUserId } : {}), returnUrl: state.returnUrl }
  }

  return { createAuthorizationUrl, handleCallback }
}
