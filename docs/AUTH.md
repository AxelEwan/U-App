# Authentication and authorization

## Identity model

`users` is the stable business identity. `user_identities` maps provider subjects from `WECHAT_MINIPROGRAM` and `CASDOOR` with a unique `(provider, providerSubject)` constraint. One user may link multiple identities.

## Admin / Casdoor

Casdoor is used only for Admin Web and must be integrated as a standard OpenID Connect provider through issuer discovery at `${CASDOOR_ISSUER}/.well-known/openid-configuration`. The future implementation must use Authorization Code flow (PKCE S256 where supported) and validate signature, issuer, audience, expiry, state, and nonce as applicable. Client secrets remain exclusively in the API process.

The API owns start/callback/session handling. Callback targets are `/api/v1/auth/casdoor/callback`; return URLs are restricted to explicitly configured Admin origins. `CASDOOR_ADMIN_MODE=all_authenticated` is an explicit deployment policy for the currently closed-registration Casdoor application. It is never inferred in production and is hidden behind `requireAdmin`, allowing later role/allowlist policies without endpoint rewrites.

No real Client ID/Secret is present. The OIDC adapter is an architecture boundary only in M1; production Casdoor login is not claimed as complete.

## Mini Program

`wx.login()` yields a temporary code sent to the API. A future `WechatAuthProvider` exchanges it server-side via code2Session and maps the OpenID to an internal identity. `WECHAT_APP_SECRET` is API-only. M1 provides provider contracts and a development provider, not real WeChat login.

Mini-program sessions may use high-entropy bearer tokens with expiry/revocation; the database stores only token hashes. Logs never contain the token or OpenID.

## H5 user login

Ordinary H5 users do not need Casdoor accounts. The designed flow creates a short-lived, browser-bound, one-use challenge. The H5 displays only a random challenge identifier/deep-link payload. A logged-in mini-program user explicitly approves or cancels it. Approval binds that internal user; successful H5 exchange consumes the challenge and creates an HttpOnly web session. Challenges expire, resist replay, never contain OpenID/token/personal data, and cannot authenticate before explicit approval. UI and endpoints are deferred.

## Web sessions and cookies

Opaque random tokens are hashed before persistence. Cookies are `HttpOnly`, `Path=/`, `SameSite=Lax`, and `Secure` in production. Browser API calls use `credentials: include`. Production CORS is an exact allowlist and never `*` with credentials.

## Development auth

`DEV_AUTH_ENABLED=true` may select the fictional `Dev Student` or `Dev Admin` identities only in development or explicit staging. Environment validation rejects startup if dev auth is enabled with `APP_ENV=production` or `NODE_ENV=production`.

M3 local API integration resolves the non-production-only `X-Dev-User: student|admin` header into an `AuthContext` with capabilities. `requireAdmin` checks `capabilities.canManageProjects`; it does not trust client role flags. This is a test seam, not a replacement for Casdoor or WeChat authentication.
