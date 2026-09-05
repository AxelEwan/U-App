# Product

QZU is a privacy-conscious campus attendance tool whose primary business object is a `Project`. A project is either a `COURSE` or an `ACTIVITY`. The member-facing product is organized around a daily dashboard, a weekly schedule, and a personal profile; administrators additionally receive a mobile publishing workspace.

## Actors and access

- Administrators manage projects, schedules, rosters, attendance, statistics, and future exports.
- Members use H5 or the WeChat Mini Program to see relevant projects and their own attendance.
- Ordinary members must not receive a class-wide name/absence matrix. Administrators may access the complete matrix.
- The member navigation is `首页 / 课程表 / 我的`; users with `currentUser.capabilities.canManageProjects` additionally see `工作台`.

## Current scope

M0, M1, M1.5 and M1.5.1 + M2 provide the application shells, product IA, contracts, schema/migrations, authentication boundaries, and API foundation. M3 adds real MySQL persistence and project authoring; Casdoor, WeChat, location upload, passcode verification, QR, Excel, and real check-in POST remain deferred.

## Product invariants

- Attendance is online and evaluated with server time.
- Generated event sessions store UTC instants; schedule rules use a project's IANA timezone and local date/time.
- Raw check-in latitude/longitude is processed transiently and not persisted or logged.
- External login identities never become core business primary keys.
- Demo and seed data is fictional.

## M1.5: Product IA & UI Foundation

M1.5 establishes the user-facing product skeleton. M1.5.1 removes scenario tabs from the Dashboard: `HomeDashboard` renders active check-in, next session, today's schedule, or empty state from data. The single Taro client has shared route/navigation definitions, a WeChat custom TabBar, an H5 bottom navigation, a mobile-first weekly schedule, a management workspace, profile/settings skeletons, and repository adapters.

The dashboard Mock Repository supports active check-in, next class countdown, multiple courses, and no-course states. All countdowns are calculated from the current clock; no scenario is represented only by a hard-coded label. Mock roles are fictional `STUDENT` and `ADMIN` users and contain no real student names.

M1.5.1 + M2 add the single dynamic Dashboard and read-oriented APIs. M3 keeps the same repository interface while selecting `memory` explicitly for review/tests or `mysql` for a local `u_app` database reached through `127.0.0.1:13306`. Admin project authoring persists Project, Schedule Rule, Attendance Policy, and generated Event Sessions. API responses contain timestamps/statuses, never preformatted Chinese countdown text.
