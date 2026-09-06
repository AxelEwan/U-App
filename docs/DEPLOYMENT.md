# U-App Production API Deployment

本文档描述 U-App 当前的生产部署基础：API 使用宝塔 Node 项目管理，由宝塔托管的 PM2 进程运行；H5 和管理员 Web 使用各自的 Vercel 项目。项目不使用 systemd、Docker 或自定义服务器守护脚本。

本阶段只准备稳定的生产构建与启动入口，不执行数据库 migration，不接入 Casdoor/微信登录，也不开发签到业务。

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
DATABASE_URL=mysql://user:password@host:3306/database
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

如果数据库不存在、目标不明确或不是已确认的专用数据库，立即停止，不执行 migration。当前仓库的安全 migration 命令仍有开发数据库保护条件，不能在生产环境绕过保护直接运行。

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

## 更新流程

代码推送到 GitHub 后，在服务器现有 checkout 中执行：

```text
GitHub push
    ↓
服务器 git pull
    ↓
pnpm install --frozen-lockfile
    ↓
pnpm --filter @qzu/api build
    ↓
宝塔 Node 项目重启
```

对应命令：

```bash
cd /www/wwwroot/u-app
git pull --ff-only origin main
corepack prepare pnpm@10.34.5 --activate
pnpm install --frozen-lockfile
pnpm --filter @qzu/api build
test -f apps/api/dist/server.cjs
```

构建失败时不要重启线上 API。确认构建成功后，在宝塔 Node 项目管理中点击重启，由宝塔托管的 PM2 进程加载新的 `dist/server.cjs` 和 `/etc/u-app/api-production.env`。

本流程不使用 systemd、Docker、自定义守护脚本、`pm2 ecosystem` 或 force push。

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

1. 在 disposable MySQL 8 数据库中对照 `packages/db/src/schema.ts` 和 `packages/db/migrations/0000`、`0001`、`0002`、`0003`，确认 migration 链可从零执行。
2. 重点复核 `users`、`identities`、`projects`、`schedule_rules`、`event_sessions`、`attendance_records`，以及 session 幂等所需的唯一约束。
3. 处理当前 `0001` 与 `0002` 中重复 DDL 的问题；先记录到 `docs/DECISIONS.md`，不要为了美观重写已有历史 migration。
4. 确认生产数据库名称、账号权限、备份/回滚方案和 `DATABASE_URL`，并在执行前再次运行 `SELECT DATABASE()`、`SHOW TABLES`。
5. 由人工批准后只执行一次 migration，记录实际数据库状态，再以 `REPOSITORY_MODE=mysql` 启动 API。
6. 创建一个测试 Project，重启宝塔 Node 项目后验证数据仍存在；补充 API integration test 与 MySQL 验证记录。

在 M3.5 完成前，不把生产 persistence 或签到能力标记为完成。
