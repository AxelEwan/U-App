# Production Core E2E

本流程只用于人工批准后的 `u_app` bootstrap 和 NORMAL 签到验收。不会自动执行 migration，也不会自动签到。真实 academic JSON、roster CSV 和所有 secret 只放服务器私有路径。

## 0. 受控环境

在服务器受控 shell 中注入 `/etc/u-app/api-production.env`，不要把该文件内容复制到仓库或终端日志。确认环境至少包含：

```text
NODE_ENV=production
APP_ENV=production
REPOSITORY_MODE=mysql
DEV_AUTH_ENABLED=false
```

## 1. 只读 preflight

```bash
cd /www/wwwroot/u-app
pnpm db:production-preflight
```

确认输出目标为 `u_app`、`127.0.0.1:3306`。若状态为 `UNKNOWN`，停止操作。

## 2. 备份并人工 migration

```bash
mkdir -p /var/backups/u-app
mysqldump --defaults-extra-file=/etc/u-app/mysql-backup.cnf \
  --single-transaction --routines --events --triggers u_app \
  > /var/backups/u-app/u_app-before-migration-$(date +%F-%H%M%S).sql

MIGRATION_CONFIRM=u_app-production pnpm db:migrate
```

再次运行 `pnpm db:production-preflight`，确认状态为 `MANAGED`。

## 3. 导入 academic config

```bash
ACADEMIC_IMPORT_CONFIRM=u_app-production \
  pnpm db:import-academic \
  --file /etc/u-app/private/2026-fall.academic.json
```

重复执行同一文件应只产生 updated/existing 结果，不应增加重复 semester、class、course、timetable、project 或 policy。

## 4. 导入私有 roster

```bash
ROSTER_IMPORT_CONFIRM=u_app-production \
  pnpm db:import-roster \
  --file /etc/u-app/private/2026-fall.roster.csv \
  --semester 2026-fall
```

CSV 只允许 `class_code,student_no,display_name`，不得进入 GitHub。

## 5. 生成真实 EventSession

```bash
SESSION_MATERIALIZE_CONFIRM=u_app-production \
  pnpm db:materialize-sessions --semester 2026-fall
```

## 6. 验证核心数据

```bash
pnpm db:verify-core --semester 2026-fall
```

成功标志为 `CORE_DATA_READY`。失败时只根据缺失项排查，不绕过检查。

## 7. 人工 NORMAL 验收

1. 重启宝塔 `u_app` Node 项目。
2. 在微信小程序点击微信登录。
3. 未绑定用户完成班级、姓名、学号后四位验证。
4. 选择 ELECTIVE 课程并打开个人课表。
5. Admin 登录并对当前 EventSession 发起 NORMAL 签到。
6. 学生首页确认出现 active check-in，执行一次签到。
7. Admin 在 5 秒内刷新/轮询看到学生状态。
8. 学生再次点击签到，确认收到重复签到冲突。
9. Admin 修改一次状态，确认 audit 保留。
10. Admin finalize，确认未签到学生变为 ABSENT。
11. 下载 CSV，确认 UTF-8 BOM 和中文字段正常。
12. 重启 API，再刷新学生和 Admin 页面，确认签到记录仍存在。

本流程不包含 PASSCODE、LOCATION、动态 QR 或任何自动 production migration。
