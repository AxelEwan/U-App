# Architecture

## Workspace

- `apps/api`: Hono on Node.js, port 3004, sole business source of truth.
- `apps/admin`: Next.js admin shell, port 3000.
- `apps/client`: one Taro/React source tree targeting H5 (port 10086) and Weapp.
- `packages/core`: framework-free domain logic.
- `packages/db`: Drizzle MySQL schema, client factory, migrations, fictional seed definitions.
- `packages/contracts`: Zod wire contracts and stable error codes.
- `packages/auth`: authentication domain types and authorization policies.
- `packages/config`: environment parsing and fail-closed production invariants.

## Client product foundation

`apps/client` keeps one Taro/React source tree for H5 and Weapp. `src/navigation/definitions.ts` is the shared source for route, label, icon semantics, and capability requirements. H5 renders a React bottom navigation; Weapp uses Taro `custom-tab-bar`. Both filter the same definitions by `currentUser.capabilities.canManageProjects`, so ordinary members never see a disabled management tab.

The client UI uses repository interfaces for projects, sessions, today data, Schedule Rules, Attendance Policy, and authoring. `ApiRepository` is the runtime adapter; the centralized fictional Mock Repository remains available for development scenarios (`CHECKIN_ACTIVE`, `NEXT_SESSION`, `TODAY_ONLY`, `EMPTY`) but is not exposed as Dashboard tabs. Pages do not call `fetch` directly. The repository is presentation-only: attendance eligibility and future server-side decisions remain API/domain responsibilities.

## Data and time

MySQL 8 is reached locally only through a developer-established SSH tunnel at `127.0.0.1:13306`. The repository never knows SSH host credentials. Schedule rules contain local dates/times and an IANA timezone. Materialization uses a timezone library and stores generated event session instants as UTC.

The database separates `web_auth_sessions` and `mini_program_auth_sessions` from business `event_sessions`. Opaque session tokens are returned only once; only their SHA-256 hashes are stored. UUIDs are internal identifiers.

`REPOSITORY_MODE=memory` is explicit review/test mode. `REPOSITORY_MODE=mysql` requires `DATABASE_URL` and accepts only the local `u_app` SSH tunnel; a MySQL error becomes `DATABASE_UNAVAILABLE` and never falls back to memory. `apps/api/.env.local` is loaded server-side and ignored by Git.

## Request boundary

API requests receive a request ID, strict-origin CORS handling, schema validation, and a central JSON error envelope. Authentication produces an `AuthContext`; authorization is a separate policy decision. Structured logs contain operational metadata only and must exclude credentials, identity subjects, tokens, passcodes, and raw GPS.

## Deployment compatibility

The H5 and admin builds are compatible with later Vercel deployment. The bundled Node API is compatible with Nginx -> `127.0.0.1:3004` -> systemd. CI verifies but does not deploy. Redis is intentionally absent from Phase 1.

## M3 API surface

Hono exposes `GET /api/v1/me`, project CRUD, Schedule Rule CRUD, Attendance Policy upsert, Session list/generation/read, and `GET /api/v1/me/today`. Wire responses contain timestamps and lifecycle status; Chinese display text and countdown formatting stay in shared client/domain presentation code. Session generation uses a transaction and the unique `(schedule_rule_id, scheduled_start_at)` key for idempotency.

## Attendance record lifecycle

Attendance records use `PRESENT`, `LATE`, `LEAVE`, or `ABSENT` as business statuses. `SELF_CHECKIN` and `ADMIN` identify the source. A revoke is audit-friendly: it retains the record and sets `voidedAt`/`voidedByUserId`, with `createdByUserId` and `updatedAt` available for future audit trails. A session without a record is still interpreted as pending/not checked in by product views; the system does not permanently write `ABSENT` merely because a session ended.
