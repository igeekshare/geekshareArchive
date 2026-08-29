# GeekShare Archive

[![CI](https://github.com/igeekshare/geekshareArchive/actions/workflows/ci.yml/badge.svg)](https://github.com/igeekshare/geekshareArchive/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

GeekShare Archive 是一个可自建的 Telegram 频道持久化归档。它用 Next.js 生成静态前端，由 Cloudflare Worker 接收 Telegram Webhook、提供 REST API，并将消息保存到 D1、媒体保存到 R2。

仓库保留 GeekShare 作为默认演示品牌；站点名称、Logo、SEO 和频道可以在后台覆盖。[GeekShare 在线站点](https://archive.geekshare.org)仅用于展示，不是自建实例的默认部署目标。

## 项目状态

Phase 2 可靠性加固已于 2026-08-28 发布到 Production；Webhook、D1 migration、FTS 完整性以及站点/API smoke test 均已验证通过。Phase 2.4 暂缓，尚未完成真实 Telegram 媒体、缩略图故障恢复及 R2 PUT → D1 失败重试的端到端验证；详见 [PRODUCT.md](PRODUCT.md)。

## 功能

- 归档 `channel_post`、编辑事件和消息反应，来源消息删除后仍可保留已归档内容。
- D1 FTS5 搜索、标签、年月、频道、内容类型和多种排序方式。
- R2 媒体、缩略图、频道头像和站点品牌资源。
- 多频道首页、消息详情页、动态 SEO 和响应式界面。
- Cloudflare Access 管理后台，支持消息、频道、品牌、SEO、同步和媒体修复。
- 10 条不含真实频道内容或媒体的演示种子。

## 架构

```text
Telegram Bot Webhook
        |
        v
Cloudflare Worker ----> D1: messages, channels, FTS, settings, logs
        |
        +--------------> R2: media, thumbnails, avatars, site assets
        |
        v
Workers Assets: exported Next.js site and admin UI
```

- `src/worker.ts`：Worker 入口、API 分发和静态资源转发。
- `src/cloudflare/`：公共 API、管理 API、Telegram 和 D1/R2 运行逻辑。
- `migrations/`：生产 D1 schema 的唯一来源。
- `src/app/`：静态导出的公开站点和管理后台。
- `src/data/messages.json`：仅用于本地演示和迁移的 10 条种子。

公共 HTTP API、D1 schema 与 Worker bindings 固定使用 `DB`、`MEDIA` 和 `ASSETS`。

## 环境要求

- Node.js `>=20.9.0`，推荐 Node.js 22
- npm
- Cloudflare 账号（部署时需要 Workers、D1 和 R2）
- Telegram Bot（启用实时归档时需要）
- Cloudflare Access（启用生产管理后台时需要）

## 本地运行

```bash
git clone https://github.com/igeekshare/geekshareArchive.git
cd geekshareArchive
npm ci
cp wrangler.example.jsonc wrangler.jsonc
cp .dev.vars.example .dev.vars
```

PowerShell 可使用：

```powershell
Copy-Item wrangler.example.jsonc wrangler.jsonc
Copy-Item .dev.vars.example .dev.vars
```

`wrangler.jsonc` 和 `.dev.vars` 已被 Git 忽略。前者用于填写自己的 D1、R2、域名和环境变量，后者只保存本地 Secret。不要提交任何真实 Token、资源 ID 或管理员邮箱。

首次从演示种子创建本地数据：

```bash
npx prisma migrate deploy
npm run import:json
npm run db:export-d1
npm run db:d1:local
npm run db:import-d1:local
npm run dev
```

`npm run dev` 会构建静态站点并启动 Wrangler，使页面与 `/api/*` 使用同一服务。只调试静态 UI 时运行 `npm run dev:ui`；它不提供 Worker API、D1 或 R2。

对同一份演示快照重复执行 `npm run db:import-d1:local` 是幂等的：消息会按 archive ID 更新，FTS 索引保持每条消息一行。`0004_rebuild_messages_fts.sql` 会在应用 migration 时从 `messages` 重建已有 FTS 索引；`0005_webhook_media_reliability.sql` 为 Webhook lease 和有界媒体重试增加状态字段，不重命名现有消息 ID。

## Cloudflare 配置与部署

1. 复制 `wrangler.example.jsonc` 为 `wrangler.jsonc`。
2. 创建自己的 D1 数据库和 R2 bucket，将返回的 D1 ID、数据库名和 bucket 名写入本地配置。
3. 将 `SITE_URL`、`MEDIA_BASE_URL` 替换为自己的地址；需要自定义域名时添加 `routes`。
4. 生产环境保持 `ENVIRONMENT` 为 `production`。仅在本地 `.dev.vars` 中使用 `development`，否则管理鉴权会被绕过。
5. 需要定时维护时，将 `triggers.crons` 改为例如 `["0 * * * *"]`。
6. 配置 Secret、应用 migration，然后部署。

```bash
npx wrangler d1 create geekshare-archive
npx wrangler r2 bucket create geekshare-media
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
npx wrangler secret put CF_ACCESS_TEAM_DOMAIN
npx wrangler secret put CF_ACCESS_AUD
npx wrangler secret put CF_ACCESS_ADMIN_EMAIL
npm run db:d1:remote
npm run deploy
```

所有远程命令都会修改你的 Cloudflare 资源。执行前检查当前账号、配置文件和目标环境。

### GitHub Actions 自动生产部署

本仓库在推送到 `main` 后复用 CI 自动发布生产环境。Pull Request 只运行 lint、typecheck、测试、构建、Assets 校验、Wrangler dry-run 和依赖审计，不读取生产 Secret，也不会迁移或部署远程资源。

在 GitHub 仓库的 Actions Secrets 中配置：

- `CLOUDFLARE_API_TOKEN`：限制到目标 Cloudflare 账号和域名的专用 CI Token，需要 Workers 编辑与 D1 Edit 权限。
- `CLOUDFLARE_ACCOUNT_ID`：目标 Cloudflare 账号 ID。
- `WRANGLER_CONFIG_JSON`：本地生产 `wrangler.jsonc` 的完整内容；不要包含 Worker 运行时 Secret。

`main` 的检查全部通过后，流水线会校验上述 Secret、恢复临时 `wrangler.jsonc`、应用待执行的 D1 migration、部署 Worker，并验证 `https://archive.geekshare.org/` 与公开归档 API。任一 Secret 缺失或任一步失败都会在部署前后相应位置终止流水线，不会把配置文件提交到 Git。

### Cloudflare Access

生产管理 API 会验证 Access JWT 的签名、issuer、audience 和管理员邮箱，并对写请求执行 `SITE_URL` 同源校验。

- 为 `your-domain.example/admin/d*`、`admin/m*`、`admin/c*`、`admin/s*` 和 `api/admin/*` 创建受保护的 Self-hosted 应用。
- Allow Policy 使用你自己的管理员邮箱；建议使用 One-time PIN 或组织身份提供商。
- 如需保留公开登录入口，可单独对精确 `/admin` 与 `/admin/` 使用 `Bypass + Everyone`。不要用 `admin/*` 代替受保护路径；Cloudflare 通配符可能匹配空字符串。
- 将 team domain、Application Audience 和管理员邮箱分别保存为 `CF_ACCESS_TEAM_DOMAIN`、`CF_ACCESS_AUD` 和 `CF_ACCESS_ADMIN_EMAIL` Secret。

### Telegram Webhook

注册脚本没有生产地址或 Token 默认值。必须在当前 shell 显式提供 HTTPS 站点地址、Bot Token 和 Webhook Secret：

```bash
SITE_URL=https://your-domain.example \
TELEGRAM_BOT_TOKEN=replace-me \
TELEGRAM_WEBHOOK_SECRET=replace-with-a-long-random-value \
npm run webhook:register
```

PowerShell：

```powershell
$env:SITE_URL = "https://your-domain.example"
$env:TELEGRAM_BOT_TOKEN = "replace-me"
$env:TELEGRAM_WEBHOOK_SECRET = "replace-with-a-long-random-value"
npm run webhook:register
```

Webhook 可靠性规则：

- `update_id` 是 delivery identity；已完成或仍处于新鲜 lease 的重复 delivery 不会重复执行副作用，超过 10 分钟的 `processing` 可被原子 reclaim。
- Telegram 消息以 `(origin_channel_id, telegram_message_id)` 定位；`messages.id` 仅是稳定的归档/公共 identity，已有 ID 在编辑、reaction 和重放时保持不变。
- 正文先写入 D1，媒体随后归档到稳定 R2 key。失败按 1、2、4、8 小时退避，第 5 次失败后停止自动重试；管理员显式重试会解除 exhausted 状态。
- thumbnail 失败会保留已归档主媒体并进入可恢复失败；当前不支持的大型 document/audio 等文件会记录明确原因并停止自动重试，不会被误标为 archived。

## API

公共接口：

- `GET /api/messages`
- `GET /api/archive-meta`
- `GET /api/homepage`
- `GET /api/site-config`
- `GET /api/messages/:id`
- `GET /api/messages/:id/discovery`
- `POST /api/telegram/webhook`

管理接口位于 `/api/admin/*`。公开查询支持分页、cursor、关键词、标签、年月、频道、内容类别和 `newest|oldest|featured|hot` 排序。

## 数据与安全边界

- 演示种子不包含真实频道历史、凭据或媒体。
- 历史媒体目录 `public/photos`、`public/stickers` 和 `public/video_files` 不属于源码；用户自己的媒体应写入 R2。
- Webhook 验证 `X-Telegram-Bot-Api-Secret-Token`。
- 动态 D1 查询使用 prepared statements 与绑定参数。
- 消息 HTML 只接受受支持的 Telegram entity 或迁移脚本白名单清洗后的内容。
- 永久删除只清理记录中明确保存的 R2 object key，不推测或删除未知路径。
- 不要用密码、Session Cookie 或 Next.js Middleware 替代 Cloudflare Access 管理边界。

## 验证

提交前运行：

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npm run assets:verify
npx wrangler deploy --dry-run --config wrangler.example.jsonc
npm audit --audit-level=high
```

CI 在 Node.js 22 上执行同一组检查。

## 贡献与安全

贡献前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。安全漏洞请按 [SECURITY.md](SECURITY.md) 私下报告，不要在公开 Issue 中披露。

## License

[MIT](LICENSE) © GeekShare
