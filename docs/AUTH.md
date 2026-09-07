# Authentication and authorization

## Identity model

`users` is the stable business identity. `user_identities` maps provider subjects from `WECHAT_MINIPROGRAM` and `CASDOOR` with a unique `(provider, providerSubject)` constraint. One user may link multiple identities.

## Admin / Casdoor

Casdoor is used only for Admin Web and must be integrated as a standard OpenID Connect provider through issuer discovery at `${CASDOOR_ISSUER}/.well-known/openid-configuration`. The future implementation must use Authorization Code flow (PKCE S256 where supported) and validate signature, issuer, audience, expiry, state, and nonce as applicable. Client secrets remain exclusively in the API process.

The API owns start/callback/session handling. Callback targets are `/api/v1/auth/casdoor/callback`; return URLs are restricted to explicitly configured Admin origins. `CASDOOR_ADMIN_MODE=all_authenticated` is an explicit deployment policy for the currently closed-registration Casdoor application. It is never inferred in production and is hidden behind `requireAdmin`, allowing later role/allowlist policies without endpoint rewrites.

No real Client ID/Secret is present. The OIDC adapter is an architecture boundary only in M1; production Casdoor login is not claimed as complete.

## Mini Program

`wx.login()` yields a temporary code sent to the API. The API exchanges it server-side via code2Session and maps the OpenID to an internal identity when the server-only credentials are configured. `WECHAT_APP_SECRET` is API-only. Live production credentials and a real mini-program login still require deployment verification.

Mini-program sessions may use high-entropy bearer tokens with expiry/revocation; the database stores only token hashes. Logs never contain the token or OpenID.

## H5 user login

The current Web MVP uses a temporary roster-bound login: the student selects a configured class and roster name, then submits the last four digits of the student number. The API verifies these values against MySQL, reuses or creates the internal student/user binding, and issues only an opaque `qzu_web_session` cookie. The browser never submits a `userId` or `studentId`, and no `X-Dev-User` header is accepted in production. WeChat OpenID can later be linked to the same student without changing attendance records.

## Web sessions and cookies

Opaque random tokens are hashed before persistence. Cookies are `HttpOnly`, `Path=/`, `SameSite=Lax`, and `Secure` in production. Browser API calls use `credentials: include`. Production CORS is an exact allowlist and never `*` with credentials.

## Development auth

`DEV_AUTH_ENABLED=true` may select the fictional `Dev Student` or `Dev Admin` identities only in development or explicit staging. Environment validation rejects startup if dev auth is enabled with `APP_ENV=production` or `NODE_ENV=production`. The temporary Admin Web login uses a server-only `ADMIN_LOGIN_SECRET_HASH`; the cleartext password and hash never enter the Admin bundle or `NEXT_PUBLIC_*` variables.

M3 local API integration resolves the non-production-only `X-Dev-User: student|admin` header into an `AuthContext` with capabilities. `requireAdmin` checks `capabilities.canManageProjects`; it does not trust client role flags. This is a test seam, not a replacement for Casdoor or WeChat authentication.
