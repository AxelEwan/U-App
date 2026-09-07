# Authentication and authorization

## Identity model

`users` is the stable internal account. `user_identities` maps provider subjects from `WECHAT_MINIPROGRAM` and `CASDOOR` with a unique `(provider, providerSubject)` constraint; one user may link multiple identities. `student_bindings` only maps one roster `students` row to one internal `users` row. It contains no provider subject and no H5 provider identity, with unique constraints on both `studentId` and `userId`.

## Admin / Casdoor

Casdoor is used for the Admin Web and optional account linking through issuer discovery at `${CASDOOR_ISSUER}/.well-known/openid-configuration`. The API uses Authorization Code flow with PKCE S256 and validates signature, issuer, audience, expiry, state, and nonce. Client secrets remain exclusively in the API process.

The API owns start/callback/session handling. Callback targets are `/api/v1/auth/casdoor/callback`; return URLs are restricted to explicitly configured Admin origins. `CASDOOR_ADMIN_MODE=all_authenticated` is an explicit deployment policy for the currently closed-registration Casdoor application. It is never inferred in production and is hidden behind `requireAdmin`, allowing later role/allowlist policies without endpoint rewrites.

Production still requires the operator to set `CASDOOR_CLIENT_SECRET` in the API environment. A Casdoor subject is either resolved to its existing identity row or creates a new User; linking from an already authenticated account adds the identity to that same User and rejects identities owned by another User.

## Mini Program

`wx.login()` yields a temporary code sent to the API. The API exchanges it server-side via code2Session and maps the OpenID to an internal identity when the server-only credentials are configured. `WECHAT_APP_SECRET` is API-only. Live production credentials and a real mini-program login still require deployment verification.

Mini-program sessions use high-entropy bearer tokens with expiry/revocation; the database stores only token hashes. Logs never contain the token or OpenID. Repeated login with the same OpenID resolves the same User.

## H5 user login

Production H5 login uses `web_login_challenges`: the browser receives a two-minute challenge and browser-binding cookie, then the authenticated mini program approves it by QR payload or four-digit code. The browser consumes the approved challenge and receives only an opaque `qzu_web_session` cookie. The roster-bound class/name/last-four form remains a controlled H5_STUDENT fallback for local/integration testing; it is not a provider identity. The browser never submits a `userId` or `studentId`, and no `X-Dev-User` header is accepted in production.

Challenge endpoints are `POST /api/v1/auth/web/challenges`, `GET /api/v1/auth/web/challenges/:id`, `POST /api/v1/auth/web/challenges/:id/approve`, `POST /api/v1/auth/web/challenges/code/:code/approve`, and `POST /api/v1/auth/web/challenges/:id/consume`. Only hashes of the long challenge, short code, and browser binding are persisted. Approval requires an authenticated WeChat mini-program session, is rate-limited, and consumption is one-time.

## Web sessions and cookies

Opaque random tokens are hashed before persistence. Cookies are `HttpOnly`, `Path=/`, `SameSite=Lax`, and `Secure` in production. Browser API calls use `credentials: include`. Production CORS is an exact allowlist and never `*` with credentials.

## Development auth

`DEV_AUTH_ENABLED=true` may select the fictional `Dev Student` or `Dev Admin` identities only in development or explicit staging. Environment validation rejects startup if dev auth is enabled with `APP_ENV=production` or `NODE_ENV=production`. The temporary Admin Web login uses a server-only `ADMIN_LOGIN_SECRET_HASH`; the cleartext password and hash never enter the Admin bundle or `NEXT_PUBLIC_*` variables.

M3 local API integration resolves the non-production-only `X-Dev-User: student|admin` header into an `AuthContext` with capabilities. `requireAdmin` checks `capabilities.canManageProjects`; it does not trust client role flags. This is a test seam, not a replacement for Casdoor or WeChat authentication.
