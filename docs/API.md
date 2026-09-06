# API

Base path: `/api/v1`. Health is intentionally outside the versioned business namespace.

## Implemented in M0/M1/M2/M3

### `GET /health`

Returns `200` with a validated payload:

```json
{"status":"ok","service":"qzu-api","timestamp":"2026-01-01T00:00:00.000Z"}
```

Every response includes `X-Request-Id`. Failures use stable codes:

```json
{"error":{"code":"INTERNAL_ERROR","message":"Internal server error","requestId":"..."}}
```

## Project and schedule reads

### `GET /api/v1/projects`

Returns `{ "items": ProjectSummary[] }`.

### `GET /api/v1/me`

Requires development auth in local mode and returns the internal user ID, fictional display info, session type, identity provider, and capability map.

### `POST /api/v1/projects`

Accepts project fields validated by the shared contract. Local dev requests require `X-Dev-User: admin` with dev auth enabled and return `201`; `createdBy` is always taken from `AuthContext`.

### `GET /api/v1/projects/:id`

Returns one `ProjectSummary` or `NOT_FOUND`.

### `GET /api/v1/projects/:id/sessions`

Returns `{ "items": SessionSummary[] }`, including timestamp fields and derived lifecycle status.

### Schedule Rules

`GET|POST /api/v1/projects/:id/schedule-rules` and `PATCH /api/v1/schedule-rules/:id` persist local weekly recurrence fields. Recurrence materialization is delegated to `packages/core`.

### `POST /api/v1/projects/:id/attendance-policy`

Upserts roster mode, time-window offsets, location configuration, and the passcode-enabled flag. Plaintext passcodes are not accepted or stored.

### `POST /api/v1/projects/:id/sessions/generate`

Accepts `{ "scheduleRuleId": "..." }`, runs generation in a transaction, and returns the project's timestamped sessions. Repeating the request is idempotent because the database enforces `(schedule_rule_id, scheduled_start_at)` uniqueness.

### `GET /api/v1/sessions/:id`

Returns one timestamped session summary.

### `GET /api/v1/me/today`

Returns `{ serverTime, activeCheckin, nextSession, todaySessions }`. The API returns raw timestamps and status; clients derive the clock offset and countdown display.

## Fixed semester and attendance flow

### `POST /api/v1/auth/wechat/login`

Exchanges a WeChat mini-program login code server-side and sets an HttpOnly session cookie. It is enabled only when the API has server-only WeChat credentials; Dev Auth is never used in production.

### `POST /api/v1/admin/semester-config`

Admin-only. Stores a versioned semester, classes, courses, standard periods, and fixed timetable, then materializes timetable entries into the existing Project/EventSession engine.

### `POST /api/v1/admin/roster`

Admin-only. Imports `{ semesterCode, entries: [{ classCode, studentNo, displayName }] }` into MySQL. The API returns only an import count.

### `GET /api/v1/me/onboarding`, `POST /api/v1/me/onboarding/verify`, `POST /api/v1/me/onboarding/electives`

Returns binding state and elective choices without exposing full student numbers. Verification requires class, display name, and the last four digits of the student number; the provider subject comes from `AuthContext`.

### `POST /api/v1/sessions/:id/attendance/start`

Admin-only. Starts NORMAL attendance for a materialized session and sets the server-owned window; default duration is 10 minutes.

### `GET /api/v1/sessions/:id/attendance/live`

Admin-only. Returns roster members, current statuses, and counts. The admin UI polls this endpoint while a session is open.

### `PATCH /api/v1/sessions/:id/attendance`, `POST /api/v1/sessions/:id/attendance/finalize`, `GET /api/v1/sessions/:id/attendance.csv`

Admin-only status override, finalize-to-ABSENT, and CSV export. Overrides and revocations retain the record and write audit data; records are never physically deleted.

## Stable error codes

Clients may branch on `UNAUTHORIZED`, `FORBIDDEN`, `PROJECT_NOT_FOUND`, `SCHEDULE_RULE_NOT_FOUND`, `SESSION_NOT_FOUND`, `VALIDATION_ERROR`, and `DATABASE_UNAVAILABLE`; they must not depend on localized messages.

## Planned boundaries

- Auth: `GET/POST /api/v1/auth/...`
- Projects: list/create/read/update under `/api/v1/projects`
- Event sessions: list/generate/read under project/session routes
- Members: `/api/v1/projects/:id/members`
- Attendance: `POST /api/v1/sessions/:id/check-in`, `GET /api/v1/sessions/:id/attendance`

Protected handlers must authenticate into `AuthContext`, authorize separately, validate all inputs with shared Zod contracts, and leave check-in eligibility to server domain/application logic.
