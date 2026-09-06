# Generated migrations

Run `pnpm db:generate` to derive SQL from `src/schema.ts`. Generation does not require `DATABASE_URL` and does not apply changes to any database. The chain starts with clean `0000_clean_baseline.sql`, followed by additive fixed-semester/attendance foundations in `0001_exotic_earthquake.sql`, `0002_orange_santa_claus.sql`, and `0003_deep_doctor_faustus.sql`; the former pre-baseline files were never applied to a confirmed production database.

`pnpm db:migrate` is a guarded manual apply path. It accepts `DATABASE_URL` from the process environment or `apps/api/.env.local`, requires `APP_ENV`, validates the database name and loopback target, prints the preflight result, and refuses unexplained tables. Development uses the SSH tunnel at `127.0.0.1:13306`; production requires `NODE_ENV=production`, `APP_ENV=production`, and `MIGRATION_CONFIRM=u_app-production` before using same-server MySQL at `127.0.0.1:3306`.
