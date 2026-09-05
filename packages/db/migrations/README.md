# Generated migrations

Run `pnpm db:generate` to derive SQL from `src/schema.ts`. Generation does not require `DATABASE_URL` and does not apply changes to any database. The guarded `pnpm db:migrate:safe` command is the only apply path; it requires `apps/api/.env.local`, the local `u_app` SSH tunnel, and a clean unknown-table preflight.

M1.5 generated `0001_certain_annihilus.sql` for the attendance status/source/audit fields. M3 generated `0002_ordinary_franklin_richards.sql` for the Event Session idempotency key and policy location name. Neither has been applied to any database in this workspace.
