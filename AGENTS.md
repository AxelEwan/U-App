# Agent operating guide

Before changing this repository, read these files in order:

1. `docs/PRODUCT.md`
2. `docs/ARCHITECTURE.md`
3. `docs/AUTH.md`
4. `docs/DECISIONS.md`
5. `docs/ROADMAP.md`

## Non-negotiable constraints

- Keep the pnpm workspace and the single Taro client that targets H5 and Weapp.
- The Hono API is the sole business source of truth. Keep domain logic out of Next.js and Taro UI code.
- Never commit credentials, raw auth/session tokens, OpenID values, passcodes, or raw student GPS coordinates.
- Business users and external identities remain separate. Never use an external identifier as a business primary key.
- Do not connect to an unknown database. Generate migrations without applying them unless the target and `DATABASE_URL` are explicitly confirmed.
- Do not add local MySQL, Redis, Docker, or Kubernetes requirements. Local MySQL access uses an SSH tunnel on `127.0.0.1:13306`.
- Casdoor is admin authentication only. User H5 authentication is designed around explicit confirmation from the logged-in WeChat mini program.
- Dev auth must fail closed in production. Authorization must go through policy abstractions such as `requireAdmin`.
- Development persistence uses `REPOSITORY_MODE=memory|mysql`; MySQL is only the local `u_app` database through the SSH tunnel at `127.0.0.1:13306`. Never silently fall back to memory after a MySQL failure.
- Server-side development identity is resolved into `AuthContext.capabilities`; clients must never submit or infer an `isAdmin` authorization flag.
- Attendance time, distance, roster, duplicate, and passcode decisions are made server-side. Never trust client-computed eligibility.
- Use fictional seed identities only. Update `docs/DECISIONS.md` and `docs/ROADMAP.md` when architecture or milestone status changes.

Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` before handing work off.
