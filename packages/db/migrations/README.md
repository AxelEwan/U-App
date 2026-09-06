# Generated migrations

Run `pnpm db:generate` to derive SQL from `src/schema.ts`. Generation does not require `DATABASE_URL` and does not apply changes to any database. The current chain was reset to the clean `0000_clean_baseline.sql` because the former `0002` repeated DDL already present in `0001`; the former files were never applied to a confirmed production database.

`pnpm db:migrate` is a guarded manual apply path. It accepts `DATABASE_URL` from the process environment or `apps/api/.env.local`, requires `APP_ENV`, validates the database name and loopback target, prints the preflight result, and refuses unexplained tables. Development uses the SSH tunnel at `127.0.0.1:13306`; production requires `NODE_ENV=production`, `APP_ENV=production`, and `MIGRATION_CONFIRM=u_app-production` before using same-server MySQL at `127.0.0.1:3306`.
