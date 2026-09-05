# QZU Project & Attendance Platform

Production-oriented foundation for project enrolment, course/activity sessions, and attendance. It is a pnpm monorepo with a Hono API, Next.js admin, and one Taro React client compiled to H5 and WeChat Mini Program.

## Prerequisites

- Node.js 22+ (this repository currently pins pnpm 10 for Node 22.2 compatibility)
- Corepack (`corepack enable` if `pnpm` is not already available)
- Browser; WeChat DevTools for mini-program development

No local MySQL, Redis, Docker, or Kubernetes is required.

## Start locally (Windows)

```bash
corepack enable
corepack prepare pnpm@10.34.5 --activate
pnpm install --frozen-lockfile
pnpm dev:api          # http://localhost:3004
pnpm dev:admin        # http://localhost:3000
pnpm dev:client:h5    # http://localhost:10086
pnpm dev:client:weapp # watch-builds apps/client/dist
```

For Weapp, run `pnpm dev:client:weapp`, then open **`apps/client/dist`** in WeChat DevTools. Taro writes the compiled mini-program and a generated tool config there. The checked-in `touristappid` is a development placeholder, not a real AppID.

If DevTools reports that `app.json` is missing, run the Weapp build first and verify that `apps/client/dist/app.json` exists. The repository root and `apps/client` are source/config directories, not the simulator project directory.

## Database (M3)

Application code reads only `DATABASE_URL`. Start the SSH tunnel separately, forwarding local `127.0.0.1:13306` to the development MySQL service's `127.0.0.1:3306`; the tunnel host/user/password are never part of this repository. Put the real server-only values in **`F:\U-app\apps\api\.env.local`**, which is ignored by Git. Set `REPOSITORY_MODE=mysql` there to opt into persistence. Use the local tunnel URL with database name `u_app`; do not use a public MySQL endpoint.

`pnpm db:generate` generates SQL migrations from the Drizzle schema. It does not connect to or migrate a database.
`pnpm db:migrate:safe` is the only migration entry point. It refuses missing credentials, non-`u_app` databases, non-tunnel URLs, and unexplained existing tables. Review the SQL and preflight output before applying it.

The API reads `apps/api/.env.local` automatically. Start it with `pnpm dev:api`; Admin is `pnpm dev:admin`; H5 is `pnpm dev:client:h5`; Weapp is `pnpm dev:client:weapp`, then open **`F:\U-app\apps\client\dist`** in WeChat DevTools.

## Verification

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

See `docs/` for product, architecture, authentication, API, decisions, and roadmap context.
