# Roadmap

## Completed

- Repository baseline inspection and architecture decisions.
- M0: pnpm workspace, strict TypeScript/lint/test/build tooling, Hono health API, Next admin shell, shared Taro H5/Weapp client, environment foundation, CI, and long-lived documentation.
- M1: 15-table Drizzle schema and generated migration, fictional seed definition, tested geospatial/time-window/recurrence/eligibility logic, Zod API contracts, auth/authorization boundaries, request middleware, and client provider adapters.
- M1.5: Product IA & UI Foundation — capability-based Home/Schedule/Profile navigation, WeChat custom TabBar, H5 bottom navigation, mobile weekly schedule, workspace flows, profile/settings skeletons, centralized Mock Repository, lightweight design tokens, and auditable attendance status/source model updates.
- M1.5.1 + M2: Dashboard correction and API foundation — single dynamic HomeDashboard, timestamp-driven shared session status/countdown logic, Workbench naming, Project/Session/Today Hono routes, repository adapters, Admin API reads, Client API reads, and integration tests.
- M3: Real Persistence & Project Authoring — explicit memory/MySQL repository modes, guarded local/production-aware migration command, server-side Dev Auth capability context, Project CRUD, Schedule Rule CRUD, Attendance Policy persistence, idempotent Event Session generation, server-clock Today/timetable APIs, member-bound NORMAL check-in, and Admin/Client authoring/read flows.

## Current

- M0, M1, M1.5, M1.5.1, M2, and the code portion of M3 are complete. `apps/api/.env.local` is absent in this workspace, so no database preflight or migration was executed; MySQL persistence is implemented but awaits local developer credentials and tunnel confirmation. The migration audit found the former `0002` duplicate DDL and replaced the unapplied chain with `0000_clean_baseline.sql`. NORMAL check-in is implemented with roster membership, server-side time-window validation, late calculation, duplicate protection, and auditable records.

## Next

- M4: PASSCODE and LOCATION attendance, beginning with hashed passcodes, Haversine validation, and privacy-minimal location evidence. Keep QR, admin attendance overrides, and export as separately scoped slices.

## Deferred

- Production Casdoor OIDC and WeChat code2Session until credentials/application configuration exist.
- H5 mini-program-confirmed QR login UI/flow.
- Provider-backed user login, admin attendance overrides, PASSCODE/LOCATION/QR attendance, import/export, full PWA/offline caching, notifications, native apps, Live Activity, Redis, advanced RBAC, billing, multi-tenancy, and production deployment hardening.

M3 verification intentionally did not connect MySQL, apply migrations, connect Casdoor, or call `wx.login`. The clean baseline is local SQL only and must pass the guarded preflight before manual apply.
