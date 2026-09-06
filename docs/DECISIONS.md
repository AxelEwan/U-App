# Architecture decisions

## ADR-001: pnpm workspace without a task orchestrator

The repository uses native pnpm filters and per-workspace strict TypeScript checks. Turborepo adds no current value at this scale.

## ADR-002: One Taro client for H5 and Weapp

H5 and WeChat Mini Program share components and domain-facing adapters. PWA is a later enhancement of H5, not another app.

## ADR-003: API-owned business rules and auth sessions

Hono is the sole business source of truth. Next Server Actions and Taro pages do not make attendance decisions. Browser sessions are API-managed opaque cookies rather than long-lived localStorage access tokens.

## ADR-004: Separate user and external identity records

Internal UUIDs are stable business keys. WeChat OpenID, Casdoor subject, email, and username remain replaceable provider attributes.

## ADR-005: Casdoor for Admin only

Casdoor closed registration supports current trusted administrators. `all_authenticated` is an explicit, replaceable authorization policy, never a permanent identity assumption. Ordinary H5 login will use mini-program confirmation.

## ADR-006: Privacy-minimal location evidence

The API receives latitude/longitude only to calculate distance and pass/fail. Attendance stores distance, accuracy, and result; raw coordinates are discarded and never logged.

## ADR-007: No local infrastructure services

Development does not install MySQL, Redis, Docker, or Kubernetes. Known development MySQL is reached through an SSH tunnel. Migration SQL is generated without applying it when `DATABASE_URL` is absent/unconfirmed.

## ADR-008: Redis deferred

Phase 1 uses no Redis. Rate-limiting can begin in-process or with MySQL constraints; a shared Redis limiter is a later multi-instance concern.

## ADR-009: Materialized event sessions

Schedule rules express recurrence in project-local civil time. Concrete event sessions store UTC instants and can be changed/cancelled/added independently without mutating the rule.

## ADR-010: Compatibility-pinned tooling

The initial machine runs Node 22.2. pnpm 10 and Vitest 3 are pinned because current pnpm 11 and Vitest 5 require newer Node 22 minors. Taro 4.2 is paired with React 18 according to its peer dependency.

## ADR-011: M1.5 client information architecture and capability navigation

The member client has three primary destinations: Home, Schedule, and Profile. Publish is a fourth destination only when the abstract capability `currentUser.capabilities.canManageProjects` is true. WeChat uses Taro custom-tab-bar because the number of standard tabs is capability-dependent; H5 uses a matching React bottom navigation. The route and capability definition is shared while platform rendering remains separate.

M1.5 uses a centralized in-memory Mock Repository with fictional Student/Admin users so both capability states can be inspected without authentication or API dependencies. The repository is an adapter boundary, not a second business source of truth. The visible administrator destination is named `工作台`.

## ADR-012: Auditable attendance statuses and revocation

Attendance business statuses are `PRESENT`, `LATE`, `LEAVE`, and `ABSENT`; source is `SELF_CHECKIN` or `ADMIN`. Admin changes retain an attendance record and write actor/timestamp audit fields. Cancellation is modeled as a revoke/void (`voidedAt`, `voidedByUserId`) rather than physical deletion. Missing records remain a UI-derived not-checked-in state until a later confirmed business policy decides whether an absence record should be created.

## ADR-013: Repository adapters and development database guard

Client and API consumers depend on repository interfaces rather than calling HTTP or SQL from UI components. `ApiRepository` can replace the fictional Mock Repository without changing the product UI. The API uses memory data only with `REPOSITORY_MODE=memory`; MySQL mode uses an environment-specific `u_app` target: the local SSH tunnel in development and same-server loopback MySQL in production. Migrations remain generated artifacts until the guarded preflight confirms the target and existing tables.

## ADR-014: Explicit M3 persistence mode

`REPOSITORY_MODE=mysql` is the only production-like path. Database connection failure maps to `DATABASE_UNAVAILABLE`; there is no fallback to memory. Production configuration rejects memory mode and development auth. Local secrets live only in `apps/api/.env.local`.

## ADR-015: Guarded migration preflight

`pnpm db:migrate:safe` parses the local URL, requires database `u_app` over `127.0.0.1:13306`, runs `SELECT DATABASE()` and `SHOW TABLES`, and stops on unexplained tables before invoking Drizzle. The schema changes remain in `0000`, `0001`, and generated `0002`; no remote database has been migrated by this milestone.

## ADR-016: Materialized session idempotency

Schedule Rules remain editable definitions while Event Sessions are independent instances. M3 generation uses a transaction and unique `(schedule_rule_id, scheduled_start_at)` constraint, so rerunning generation does not duplicate sessions.

## ADR-017: Server clock contract

Today responses expose `serverTime`. The client computes `serverTime - Date.now()` once per response and uses the adjusted clock for countdown/status presentation; eligibility remains a future API-only decision.

## ADR-018: Environment-specific database target guards

`REPOSITORY_MODE=mysql` is protected by an explicit `APP_ENV` target policy. Development accepts only database `u_app` through `127.0.0.1` or `localhost:13306`, which is the developer SSH Tunnel. Production accepts only database `u_app` through `127.0.0.1` or `localhost:3306` (or an omitted MySQL default port), because the Baota-hosted API and MySQL run on the same server. Public database hosts are rejected.

There is no approved independent staging database in the current architecture. `APP_ENV=staging` with MySQL therefore fails closed with an explicit configuration error rather than inheriting development or production rules. A future staging target requires a new reviewed decision and tests before it can be enabled. Production still rejects `REPOSITORY_MODE=memory`, development auth, or a missing `AUTH_SESSION_SECRET` through the existing configuration invariants.
