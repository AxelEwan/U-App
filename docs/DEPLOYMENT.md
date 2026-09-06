# U-App Production API Deployment

本文档描述 U-App 当前的生产部署基础：API 使用宝塔 Node 项目管理，由宝塔托管的 PM2 进程运行；H5 和管理员 Web 使用各自的 Vercel 项目。项目不使用 systemd、Docker 或自定义服务器守护脚本。

本部署基础不自动执行数据库 migration，不接入 Casdoor/微信登录；课程、课表和 NORMAL 签到由 API 业务阶段独立验证。

## 生产目录与构建产物

服务器目录固定为：

```text
/www/wwwroot/u-app
```

API Node 项目目录为：

```text
/www/wwwroot/u-app/apps/api
```

API 构建产物为：

```text
apps/api/dist/server.cjs
```

API package scripts 与 AEvents 保持同一生产形态：

```text
dev   = tsx watch src/index.ts
build = tsc -p tsconfig.build.json && esbuild src/index.ts --bundle --platform=node --format=cjs --target=node22 --outfile=dist/server.cjs
start = node dist/server.cjs
```

`apps/api/tsconfig.build.json` 是独立的生产 emit 配置。API 的开发型 `tsconfig.json` 保留 composite project；生产 build 配置关闭 `composite`，因此不会触发 TypeScript 对 declaration emit 的约束。

## 首次部署

### 1. 获取现有仓库

```bash
cd /www/wwwroot
git clone https://github.com/AxelEwan/U-App.git u-app
cd /www/wwwroot/u-app
corepack enable
corepack prepare pnpm@10.34.5 --activate
pnpm install --frozen-lockfile
```

不要重新初始化 monorepo，也不要创建替代项目目录。GitHub 仓库是生产源代码事实来源。

### 2. 配置 API 环境变量

生产 API 使用服务器专用文件：

```text
/etc/u-app/api-production.env
```

示例内容如下；真实值只写入服务器，不提交到 Git：

```dotenv
NODE_ENV=production
APP_ENV=production
API_PORT=3004
REPOSITORY_MODE=mysql
DATABASE_URL=mysql://user:password@127.0.0.1:3306/u_app
AUTH_SESSION_SECRET=replace-with-a-long-random-secret
CORS_ORIGINS=https://qzu.x-lab.top,https://qzu-admin.x-lab.top
DEV_AUTH_ENABLED=false
```

当前 API 配置模块读取的是 `API_PORT`，不是 `PORT`，所以生产端口应配置为 `API_PORT=3004`。宝塔界面中的监听端口仍填写 `3004`。不要把真实 `DATABASE_URL`、`AUTH_SESSION_SECRET` 或其他 secret 写入仓库、README、文档或前端环境变量。

建议限制文件权限：

```bash
chown www:www /etc/u-app/api-production.env
chmod 600 /etc/u-app/api-production.env
```

### 3. 数据库目标按环境区分

本地开发 API 通过 SSH Tunnel 访问服务器 MySQL：

```dotenv
APP_ENV=development
REPOSITORY_MODE=mysql
DATABASE_URL=mysql://user:password@127.0.0.1:13306/u_app
```

生产 API 与 MySQL 位于同一台服务器，不使用 SSH Tunnel：

```dotenv
NODE_ENV=production
APP_ENV=production
REPOSITORY_MODE=mysql
DATABASE_URL=mysql://user:password@127.0.0.1:3306/u_app
```

生产也可以使用 `localhost:3306`，或省略端口使用 MySQL 默认端口。生产禁止公网数据库地址。当前没有独立 staging 数据库目标，`APP_ENV=staging` 配置 MySQL 会 fail closed，不会静默套用 development 或 production 规则。

### 4. 数据库 migration 门禁

本阶段不执行 migration。数据库初始化必须作为下一阶段 M3.5 的独立、人工确认操作完成。

执行前必须确认 `DATABASE_URL` 指向已授权的目标数据库，并检查：

```sql
SELECT DATABASE();
SHOW TABLES;
```

如果数据库不存在、目标不明确或不是已确认的专用数据库，立即停止，不执行 migration。当前仓库的安全 migration 命令会根据 `APP_ENV` 校验目标：开发只允许 SSH Tunnel 的 `127.0.0.1:13306`，生产只允许同机 MySQL 的 loopback `3306`/默认端口。它还会拒绝未知表，或已有业务表但没有 Drizzle migration history 的状态。

在 disposable 或已获批准的目标上，人工确认 preflight 后才可运行：

```bash
# 开发：通过 SSH Tunnel，命令只在确认目标为 u_app 后执行
APP_ENV=development DATABASE_URL='mysql://user:password@127.0.0.1:13306/u_app' pnpm db:migrate

# 生产：仅在完成备份、SHOW TABLES 审核并获得批准后执行
NODE_ENV=production APP_ENV=production MIGRATION_CONFIRM=u_app-production \
DATABASE_URL='mysql://user:password@127.0.0.1:3306/u_app' pnpm db:migrate
```

生产发布 workflow 和服务器 deploy entry 均不会调用该命令。

### 5. 构建 API

在 workspace 根目录执行：

```bash
cd /www/wwwroot/u-app
pnpm --filter @qzu/api build
test -f apps/api/dist/server.cjs
```

需要构建整个 workspace 时再执行：

```bash
pnpm build
```

### 6. 配置并启动宝塔 Node 项目

在宝塔 Node 项目管理中创建或配置一个项目，使用以下值：

| 配置项 | 值 |
|---|---|
| Node.js | 22 |
| 项目目录 | `/www/wwwroot/u-app/apps/api` |
| 启动命令 | `node --env-file=/etc/u-app/api-production.env dist/server.cjs` |
| 监听端口 | `3004` |
| 进程托管 | 宝塔 Node 项目托管的 PM2 |
| 运行用户 | 按服务器现有 Node 项目权限配置，确保可读仓库与 env 文件 |
| 反向代理 | `api-u.x-lab.top` → `127.0.0.1:3004` |

宝塔负责 PM2 进程的启动、重启与日志查看。仓库不提供 ecosystem 配置，不使用 `pm2 ecosystem`，也不额外运行第二个 Node 进程。

生产启动命令是：

```bash
cd /www/wwwroot/u-app/apps/api
node --env-file=/etc/u-app/api-production.env dist/server.cjs
```

包内标准启动命令仍为：

```bash
pnpm --filter @qzu/api start
```

它适用于已经由宝塔注入环境变量的场景；宝塔生产配置应使用上面的 `--env-file` 启动命令。

启动后可检查：

```bash
curl --fail http://127.0.0.1:3004/health
curl --fail https://api-u.x-lab.top/health
```

## 自动更新流程

标准生产发布由 `.github/workflows/deploy-api.yml` 完成。向 `main` push 后，流程必须先等待同一次 push 对应的 `CI` 成功，再部署该次 CI 的完整 40 位 commit SHA：

```text
GitHub push main
    ↓
CI
    ↓
Deploy API Production
    ↓
checkout pinned release SHA
    ↓
上传 u-app-${RELEASE_SHA}.tar.gz
    ↓
服务器 deploy entry
    ↓
服务器安装依赖、构建 API、重启宝塔 u_app
    ↓
http://127.0.0.1:3004/health
    ↓
https://api-u.x-lab.top/health
```

workflow 使用以下 GitHub Actions secrets，不要把值写入仓库或文档：

- `UAPP_DEPLOY_HOST`
- `UAPP_DEPLOY_PORT`
- `UAPP_DEPLOY_USER`
- `UAPP_DEPLOY_SSH_KEY`
- `UAPP_DEPLOY_KNOWN_HOSTS`

服务器接收目标固定为 `/var/lib/u-app-deploy/incoming/${RELEASE_SHA}.tar.gz`，上传后只调用：

```bash
sudo /usr/local/sbin/u-app-deploy "$RELEASE_SHA" "/var/lib/u-app-deploy/incoming/${RELEASE_SHA}.tar.gz"
```

GitHub Actions 不直接执行 `git pull`、`pnpm install`、`pnpm build`、`pm2 restart` 或任何数据库修改；这些动作全部由服务器 `/usr/local/libexec/u-app/deploy-api-production.sh` 和宝塔 `u_app` Node 项目负责。当前发布流程禁止自动 migration，不能执行 `pnpm db:migrate`。

workflow 的 SSH 连接强制 `BatchMode=yes`、`StrictHostKeyChecking=yes` 和指定的 `UserKnownHostsFile`，不接受 `StrictHostKeyChecking=no`。并发组为 `u-app-api-production`，不取消正在进行的生产发布。

如需人工发布，可在 GitHub Actions 中手动运行 `Deploy API Production`；workflow_dispatch 同样会校验实际 checkout 的完整 40 位 SHA。常规发布不使用 systemd、Docker、自定义守护脚本、`pm2 ecosystem` 或 force push。

## 环境变量归属

### API ENV

只放在服务器 `/etc/u-app/api-production.env`：

- `NODE_ENV=production`
- `APP_ENV=production`
- `API_PORT=3004`
- `REPOSITORY_MODE=mysql`
- `DATABASE_URL`
- `AUTH_SESSION_SECRET`
- `CORS_ORIGINS`
- `DEV_AUTH_ENABLED=false`
- 未来启用时的 `CASDOOR_*` 与 `WECHAT_*` server-only credentials

### Vercel ENV

Vercel 前端项目只配置公开 API 地址：

| 项目 | 变量 | Production 值 |
|---|---|---|
| Admin | `NEXT_PUBLIC_API_BASE_URL` | `https://api-u.x-lab.top` |
| H5/PWA | `TARO_APP_API_BASE_URL` | `https://api-u.x-lab.top` |

不要在 Vercel 前端项目中配置 `DATABASE_URL`、`AUTH_SESSION_SECRET`、`CASDOOR_CLIENT_SECRET` 或 `WECHAT_APP_SECRET`。

### 微信 ENV

微信登录尚未接入。未来的 `WECHAT_APP_ID`、`WECHAT_APP_SECRET` 只能属于 API server-side environment，不得进入 Taro bundle。

### Casdoor ENV

Casdoor 尚未接入。未来的 `CASDOOR_ISSUER`、`CASDOOR_CLIENT_ID`、`CASDOOR_CLIENT_SECRET` 只能由 API 管理端认证流程使用，client secret 不得进入前端。

## M3.5 数据库 migration 准备

下一阶段只做数据库初始化准备与验证，不与本部署 foundation 混在一起：

1. 在 disposable MySQL 8 数据库中从 `packages/db/migrations/0000_clean_baseline.sql` 从零执行，并对照 `packages/db/src/schema.ts`。
2. 重点复核 `users`、`user_identities`、`projects`、`project_members`、`schedule_rules`、`event_sessions`、`attendance_policies`、`attendance_records`，以及 session 幂等所需的唯一约束。
3. 当前 baseline 已移除从未执行的旧 `0001`–`0003` 重复 DDL；该决策记录在 `docs/DECISIONS.md`，不会在生产发布中自动应用。
4. 先确认 production `u_app` 是否已有项目表；未知时只执行人工 preflight：`SELECT DATABASE();`、`SHOW TABLES;`，不要自动迁移。
5. 确认数据库名称、账号权限、备份/回滚方案和 `DATABASE_URL`。人工批准后才运行一次 `pnpm db:migrate`，并保存 migration history。
6. 以 `REPOSITORY_MODE=mysql` 启动 API，创建测试 Project/Rule/Session，重启宝塔 Node 项目后验证数据仍存在。

在 M3.5 完成前，不把生产 persistence 或签到能力标记为完成。
