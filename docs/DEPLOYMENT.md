# U-App Production Foundation

This document describes the current deployment shape for U-App:

- API: Baota Node Project + PM2 on the VPS.
- H5 and Admin: Vercel projects.
- MySQL: an explicitly confirmed database only.
- No systemd and no Docker are used by this project.

The current milestone only prepares a stable build and process entry point. It does not execute migrations, enable Casdoor, enable WeChat login, or deploy the application.

## Repository layout

The repository is a pnpm workspace. The API production artifact is:

```text
apps/api/dist/server.cjs
```

The API package follows the same build shape as AEvents:

```text
dev    = tsx watch src/index.ts
build  = tsc -p tsconfig.build.json && esbuild ... --outfile=dist/server.cjs
start  = node dist/server.cjs
```

## First deployment

Use the actual server project directory in place of `/www/wwwroot/u-app`.

### 1. Prepare the source tree

```bash
cd /www/wwwroot
git clone https://github.com/AxelEwan/U-App.git u-app
cd /www/wwwroot/u-app
corepack enable
corepack prepare pnpm@10.34.5 --activate
pnpm install --frozen-lockfile
```

Do not clone a second project or create a replacement workspace. The GitHub repository is the source of truth.

### 2. Configure API environment

```bash
cp apps/api/.env.example apps/api/.env.local
chmod 600 apps/api/.env.local
```

Set the real server-only values in `apps/api/.env.local`. At minimum, a production API must use:

```dotenv
NODE_ENV=production
APP_ENV=production
API_PORT=3004
REPOSITORY_MODE=mysql
DATABASE_URL=the-confirmed-database-url
DEV_AUTH_ENABLED=false
AUTH_SESSION_SECRET=a-long-random-secret
CORS_ORIGINS=https://qzu.x-lab.top,https://qzu-admin.x-lab.top
```

Never commit this file, copy it into a Vercel project, or put credentials in a command-line argument.

### 3. Database migration gate

Migration is a manual, separately approved operation. It is not executed by PM2 and is intentionally not executed as part of this milestone.

The current guarded command is:

```bash
pnpm db:migrate:safe
```

It only accepts the repository's confirmed development target: database `u_app` through `127.0.0.1:13306`. Before running it, verify the target and inspect:

```sql
SELECT DATABASE();
SHOW TABLES;
```

If the production MySQL endpoint does not match this guard, stop. Do not bypass the guard or use an unknown database. M3.5 must define and review the production migration path first.

### 4. Build

Build the complete workspace:

```bash
pnpm build
```

Or build only the API:

```bash
pnpm --filter @qzu/api build
```

Confirm that the API artifact exists:

```bash
test -f apps/api/dist/server.cjs
```

### 5. Start with PM2

The repository root contains `ecosystem.config.cjs`:

```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 status
pm2 logs u-app-api
```

The process is named `u-app-api`, runs with `cwd=apps/api`, and starts `dist/server.cjs` with `NODE_ENV=production`. Do not use systemd, Docker, `nohup`, or a second manually maintained start command.

## Update deployment

From the existing checkout:

```bash
cd /www/wwwroot/u-app
git pull --ff-only origin main
corepack prepare pnpm@10.34.5 --activate
pnpm install --frozen-lockfile
pnpm build
pm2 restart u-app-api --update-env
pm2 status
```

If the build fails, do not restart the running process. If a migration is required, stop and complete the separately approved database procedure before restarting PM2.

## Baota Node configuration

Configure the Baota Node Project / PM2 process as follows:

| Setting | Value |
|---|---|
| Node.js | Node 22 or newer |
| Project root | `/www/wwwroot/u-app` |
| PM2 config | `/www/wwwroot/u-app/ecosystem.config.cjs` |
| Process name | `u-app-api` |
| Working directory | `/www/wwwroot/u-app/apps/api` |
| Start script | `dist/server.cjs` |
| API port | `3004` |
| Bind address | `127.0.0.1` where supported |
| Environment file | `/www/wwwroot/u-app/apps/api/.env.local` |
| Reverse proxy | `api-u.x-lab.top` → `127.0.0.1:3004` |

Install dependencies and build from the repository root so pnpm resolves the workspace correctly. Start or restart the API through the PM2 project; do not run a separate Node process in parallel.

After startup, verify locally and through the reverse proxy:

```bash
curl --fail http://127.0.0.1:3004/health
curl --fail https://api-u.x-lab.top/health
```

The API health endpoint is not a substitute for database verification.

## Environment variable ownership

### API environment

These values belong only in `apps/api/.env.local` on the API server:

- `NODE_ENV`, `APP_ENV`, `API_PORT`
- `REPOSITORY_MODE`, `DATABASE_URL`
- `CORS_ORIGINS`
- `AUTH_SESSION_SECRET`
- `DEV_AUTH_ENABLED`
- `CASDOOR_ISSUER`, `CASDOOR_ADMIN_MODE`, `CASDOOR_CLIENT_ID`, `CASDOOR_CLIENT_SECRET`
- `WECHAT_APP_ID`, `WECHAT_APP_SECRET`

### Vercel environment

Vercel projects contain public API endpoint configuration only:

| Vercel project | Variable | Production value |
|---|---|---|
| Admin | `NEXT_PUBLIC_API_BASE_URL` | `https://api-u.x-lab.top` |
| H5 client | `TARO_APP_API_BASE_URL` | `https://api-u.x-lab.top` |

Set these variables separately for Preview and Production when both environments are used. Do not put `DATABASE_URL`, `AUTH_SESSION_SECRET`, `CASDOOR_CLIENT_SECRET`, or `WECHAT_APP_SECRET` in Vercel frontend projects.

### WeChat environment

Real WeChat credentials are API-only:

- `WECHAT_APP_ID`
- `WECHAT_APP_SECRET`

WeChat login remains deferred. These values must not be exposed to Taro client bundles or committed project configuration.

### Casdoor environment

Casdoor is admin authentication only and remains deferred:

- `CASDOOR_ISSUER=https://auth.x-lab.top`
- `CASDOOR_ADMIN_MODE=all_authenticated`
- `CASDOOR_CLIENT_ID`
- `CASDOOR_CLIENT_SECRET`

The client secret belongs only to the API process. No real login flow is enabled by this deployment foundation.

## M3.5 database initialization plan

M3.5 should be completed before claiming production persistence:

1. Reconcile the migration chain. The current migration set contains repeated operations between `0001` and `0002`, and `0003` adds the attendance-window columns present in the current schema.
2. Compare `packages/db/src/schema.ts`, all migration SQL, and migration metadata on a clean disposable database. Do not alter the real database during this comparison.
3. Confirm the exact MySQL target, credentials, backup policy, and database name with the operator.
4. Add or adjust a guarded production migration command without weakening the existing unknown-database checks.
5. Run `SELECT DATABASE()` and `SHOW TABLES` before applying anything, then apply migrations once with an operator present.
6. Verify `users`, `projects`, `schedule_rules`, `event_sessions`, and the unique session-generation constraint.
7. Start the API in `REPOSITORY_MODE=mysql`, create one fictional project through the API, restart PM2, and verify the project remains.
8. Add MySQL integration coverage and document the final migration state in `docs/DECISIONS.md` and `docs/ROADMAP.md`.

Only after this is complete should the project move to authenticated attendance execution.
