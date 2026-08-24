# GeekShare Telegram 持久化归档

GeekShare Archive 是一个 Telegram 频道持久化归档站。生产运行时由静态导出的 Next.js 前端和 Cloudflare Worker 组成：Worker 接收 Telegram Bot Webhook、提供 REST API，将结构化数据保存到 D1，将媒体保存到 R2。

归档数据不依赖 Telegram 原帖长期在线。来源消息删除、频道停用或失联不会自动删除已经写入 D1/R2 的内容；只有管理员显式执行永久删除时，系统才会清理记录中明确保存的 R2 object key。

## 架构

```text
Telegram Bot Webhook
        |
        v
Cloudflare Worker ----> D1: channels, messages, tags, FTS,
        |                    webhook state, settings, logs
        |
        +--------------> R2: message media, thumbnails,
        |                    channel avatars, site assets
        v
Workers Assets: exported Next.js public site and admin UI
```

- `src/worker.ts` 处理 API 分发、首页和详情页 HTML 重写、静态资源转发及 Cron。
- `src/cloudflare/api.ts` 实现公共 API、管理 API、Telegram Webhook 和定时维护。
- `migrations/` 是生产 D1 schema 的唯一来源。
- `src/app/` 静态导出公开页面和管理后台页面。
- Prisma、SQLite、Cheerio 和 `src/data/messages.json` 只用于本地演示、迁移和历史回填，不进入 Worker 生产运行时。

技术栈为 Next.js 16、React 19、TypeScript、Tailwind CSS 3、Cloudflare Workers、Workers Assets、D1、R2、Cron Triggers 和 Cloudflare Access。

## 当前仓库状态

以下内容是仓库配置事实，不代表对应远程资源当前健康：

- 顶层 Wrangler 环境配置 Worker `geekshare-archive`，路由为 `archive.example.com/*`。
- D1 binding 为 `DB`，配置数据库 `geekshare-archive`。
- R2 binding 为 `MEDIA`，配置 bucket `geekshare-media`。
- `SITE_URL` 为 `https://archive.example.com`。
- `MEDIA_BASE_URL` 为 `https://media.archive.example.com`。
- Cron 配置为每小时整点运行。
- `env.dev` 使用独立的 `geekshare-archive-dev`、`geekshare-media-dev` 和开发 D1，不绑定生产路由，也不运行 Cron。

远程 migration、Access policy、Secret、Webhook 注册、域名证书、D1/R2 内容和线上响应状态都必须在部署环境中重新验证，不能由 `wrangler.jsonc` 推断。特别是部署前必须运行：

```bash
npx wrangler d1 migrations list geekshare-archive --remote
```

截至 2026-08-24 的本地验证快照：

- `npm test`：32 项测试通过。
- `npm run lint`、`npm run typecheck`、`npm run build` 均通过。
- `npm run assets:verify` 通过，确认 83 个应由 Workers Assets 承载的文件，历史媒体已排除。
- `npx wrangler deploy --dry-run --env=""` 成功读取 123 个静态资产，生成约 150.72 KiB 的 Worker 部署包，并识别 D1、R2、Assets 和普通变量 bindings。
- Local D1 已应用 `0001_initial.sql`、`0002_admin_content_management.sql` 和 `0003_content_discovery.sql`，当前无待应用 migration，包含 1 个演示频道和 10 条演示消息。
- Local D1 的 `messages_fts` 包含 28 行，其中 9 个消息 ID 有重复索引，与 10 条消息不一致，详见“已知问题”。

本轮未完成远程 Cloudflare 状态验证，因此本文不对线上健康状态作保证。

## 功能

- 接收 `channel_post`、`edited_channel_post` 和 `message_reaction_count`。
- 按 `update_id` 去重；失败的 Update 可以重试。
- 先持久化正文和原始 Update，再异步归档媒体，媒体失败不会丢失正文。
- Telegram `getFile` 可用时将媒体流式写入 R2；文件超过 20 MiB 或 `getFile` 不可用时尝试单帖嵌入页回退。
- 支持 D1 FTS5 `trigram` 搜索、短关键词 `LIKE` 回退、标签、年月、频道、内容类别，以及最新、最早、编辑精选和本周热门排序。
- 首页提供多频道时间流、编辑精选、本周热门、热门话题和近期媒体；停用频道停止接收新消息，但保留公开历史记录。
- `/message/<id>` 使用静态详情页壳，由 Worker 注入消息数据和动态 SEO 元信息。
- 管理后台支持运行概览、消息编辑、发布/隐藏、批量操作、媒体重试、永久删除、频道管理、站点品牌、SEO 和 Telegram 运维。
- `/admin/` 是不含管理导航的公开管理员入口；登录后从 `/admin/dashboard/` 进入受保护后台。
- 站点品牌与 SEO 配置保存在 D1，站点图片保存在 R2，保存后无需重新构建静态前端。
- 每小时维护任务记录 Webhook 状态，并最多重试一条失败媒体和一条失败的永久删除清理。
- 提供 JSON/SQLite 到 D1/R2 的导出、历史频道抓取和媒体修复工具。

当前数据结构、公共 API 和消息卡片支持一条记录的多附件展示；Webhook 对每个 Telegram Update 仍只选择一种主媒体，尚未按 Telegram media group 合并相册消息。

## 快速开始

按 lockfile 安装依赖：

```bash
npm ci
```

完整本地服务使用静态构建加 Wrangler：

```bash
npm run dev
```

`npm run dev` 实际执行 `npm run build && wrangler dev`，因此公开页面和 `/api/*` 共用一个本地服务。只调试静态 UI 时可以使用：

```bash
npm run dev:ui
```

`dev:ui` 不提供 Worker API、D1 或 R2 行为。

首次克隆或需要从演示种子重建本地状态时，在新的 Local D1 状态上依次执行：

```bash
npx prisma migrate deploy
npm run import:json
npm run db:export-d1
npm run db:d1:local
npm run db:import-d1:local
npm run dev
```

不要对已有数据的 Local D1 反复执行 `db:import-d1:local` 并假设结果完全幂等；当前导出 SQL 与 FTS triggers 的组合可能产生重复 FTS 行。

## 数据与媒体导入

`src/data/messages.json` 是固定的本地演示种子，当前包含 10 条无媒体消息。它用于验证搜索、标签、年月筛选、回复、反应和安全 HTML，不代表生产内容。

`prisma/geekshare.db`、`.data/` 和 `.wrangler/` 被 Git 忽略，是可重建的本地状态。远程 D1/R2 不会随本地操作自动改变，除非命令显式使用 `--remote`。

生成 D1 导入 SQL 和 R2 文件清单：

```bash
npm run import:json
npm run db:export-d1
```

输出文件：

- `.data/d1-import.sql`
- `.data/r2-files.txt`

历史图片、视频和贴纸已经有意从 Git 仓库移除，生产媒体由 R2 承载。`public/photos`、`public/video_files`、`public/stickers` 仅作为用户自行导入历史数据时的可选输入目录；不要把这些目录恢复为仓库内的大型持久媒体库。

历史频道抓取示例：

```bash
npm run sync:channel -- xgeekshare --before 6800 --timeout 20000 --retries 3
```

支持 `--before`、`--after`、`--timeout` 和 `--retries`。Worker 不负责抓取完整频道历史；批量回填只通过本地工具执行。

`npm run media:repair` 会修改本地 SQLite 中的媒体路径，只用于自有历史数据，运行前应备份本地数据库和媒体输入。

## API

公共接口：

- `GET /api/messages`
- `GET /api/archive-meta`
- `GET /api/homepage`
- `GET /api/site-config`
- `GET /api/messages/:id`
- `GET /api/messages/:id/discovery`
- `POST /api/telegram/webhook`

`GET /api/messages` 支持 `page`、`limit`、`cursor`、`ids`、`q`、`tag`、`year`、`month`、`channel`、`category=all|visual|link|interactive|file` 和 `sort=newest|oldest|featured|hot`。默认每批 30 条，`limit` 最大为 60；首页加载更多使用 cursor，数字页码保留兼容。

管理接口：

- `GET /api/admin/dashboard`
- `GET /api/admin/messages`
- `PATCH /api/admin/messages/:id`
- `DELETE /api/admin/messages/:id`
- `POST /api/admin/messages/bulk`
- `GET/PATCH /api/admin/site-settings`
- `GET/PATCH /api/admin/seo-settings`
- `POST /api/admin/site-assets`
- `GET/POST /api/admin/channels`
- `PATCH/DELETE /api/admin/channels/:id`
- `GET /api/admin/telegram`
- `POST /api/admin/telegram/test`
- `PUT/DELETE /api/admin/telegram/webhook`
- `GET /api/admin/webhook-status`
- `POST /api/admin/messages/:id/retry-media`

生产模式下，管理 API 要求有效的 Cloudflare Access JWT；所有非 `GET`/`HEAD` 请求还必须通过 `SITE_URL` 同源 `Origin` 校验。

## 环境变量

Worker Secrets：

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`
- `CF_ACCESS_TEAM_DOMAIN`
- `CF_ACCESS_AUD`
- `CF_ACCESS_ADMIN_EMAIL`

Wrangler 普通变量：

- `SITE_URL`
- `MEDIA_BASE_URL`
- `ENVIRONMENT`

本地可以将 `.dev.vars.example` 复制为 `.dev.vars` 后填写真实值。`.dev.vars` 已被 Git 忽略，不要提交 Secret。

### Cloudflare Access 配置

1. 在 Zero Trust 中启用 **One-time PIN** 登录方式，并开启只有单一登录方式时的 Instant Authentication。
2. 创建一个受保护的 Self-hosted 应用，添加 `archive.example.com/admin/d*`、`admin/m*`、`admin/c*`、`admin/s*` 与 `api/admin/*` 五个目标；它们分别覆盖 dashboard、messages、channels、sync/site/seo 和全部管理 API。Session Duration 设为 24 小时。
3. Allow Policy 的 **Include** 使用邮箱 `admin@example.com`，**Require** 使用登录方式 `One-time PIN`。不要把 OTP 单独用作 Include 条件。
4. 创建独立公开 Self-hosted 应用，目标为 `archive.example.com/admin` 与 `archive.example.com/admin/`，使用 **Bypass + Everyone**。不要使用 `admin/*` 保护后台页面：Cloudflare 的通配符可匹配空字符串，可能把 `/admin/` 一并拦截。配置后分别用 `/admin`、`/admin/`、`/admin/dashboard/` 和 `/api/admin/dashboard` 验证父路径与子路径。
5. 新增后台页面时，路由必须落入现有 `d*`、`m*`、`c*`、`s*` 前缀之一，或同步新增 Access 目标。Worker 仍对所有更深的 `/admin/*` 请求执行 JWT 校验并 fail closed。
6. 从受保护应用复制 Application Audience (AUD)，将 team domain、AUD 和管理员邮箱分别写入 `CF_ACCESS_TEAM_DOMAIN`、`CF_ACCESS_AUD`、`CF_ACCESS_ADMIN_EMAIL`。生产值只写入 Worker Secrets/部署配置，不写入仓库。

参考 [Access 应用路径规则](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/app-paths/)、[One-time PIN](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/) 和 [Access JWT 验证](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/)。

Webhook 注册脚本从当前 shell 读取两个 Secret：

```bash
npm run webhook:register
```

## 安全边界

- Webhook 校验 `X-Telegram-Bot-Api-Secret-Token`。
- Telegram entity renderer 只生成明确支持的 HTML 标签，并只接受 `http`、`https`、`tg` 和 `mailto` URL scheme。
- 历史 HTML 通过 `scripts/export-d1.ts` 中的 `sanitize-html` 白名单清洗。
- `MessageCard` 使用 `dangerouslySetInnerHTML`，只能接收上述 renderer 或 sanitizer 的输出。
- Worker 的所有动态 D1 查询使用 prepared statements 和绑定参数。
- 永久删除先写入 `message_tombstones`，只删除消息记录中明确保存的 `r2Key` 和 `thumbKey`，不会推测外部 URL 或未知历史路径。
- 不要恢复密码、Session Cookie 或 Next.js Middleware 登录方案；管理端安全边界是 Cloudflare Access 加 Worker 对 Access JWT 的签名、issuer、audience 和管理员邮箱校验。
- Access 的受保护应用使用 `admin/d*`、`admin/m*`、`admin/c*`、`admin/s*` 与 `api/admin/*` 目标；精确 `/admin` 与 `/admin/` 使用公开 Bypass 应用，只提供品牌入口，不得包含侧栏、管理数据或管理动作。Worker 独立校验所有更深的 `/admin/*`。
- 管理端 AJAX 请求携带 `X-Requested-With: XMLHttpRequest`，401 时整页重新进入 Access 登录流程。

## 部署验证

提交前运行：

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run assets:verify
npx wrangler deploy --dry-run --env=""
```

`postbuild` 会生成 `out/.assetsignore`，排除可选历史媒体目录。`assets:verify` 检查最终应由 Workers Assets 承载的文件。

部署前按顺序确认：

1. 使用 `wrangler d1 migrations list ... --remote` 核对远程 schema，再应用待处理 migration。
2. 核对目标环境的 Worker、D1、R2、Assets bindings 和 `SITE_URL`、`MEDIA_BASE_URL`。
3. 确认 `TELEGRAM_BOT_TOKEN` 和 `TELEGRAM_WEBHOOK_SECRET` 已作为 Secrets 配置。
4. 确认 Cloudflare Access One-time PIN 只允许 `admin@example.com`，精确 `/admin` 与 `/admin/` 为公开 Bypass 入口，受保护应用覆盖 `admin/d*`、`admin/m*`、`admin/c*`、`admin/s*` 和 `api/admin/*`，Session Duration 为 24 小时。
5. 仅当 `.data/r2-files.txt` 非空时上传并抽查历史媒体对象。
6. 部署后验证公开 API、详情页、管理鉴权、Webhook、新消息、编辑、反应和媒体失败重试。

生产部署：

```bash
npm run db:d1:remote
npm run deploy
npm run webhook:register
```

这些命令会修改远程状态，执行前必须明确目标 Cloudflare account 和环境。Wrangler 配置包含多个环境；直接使用 Wrangler CLI 时应显式指定 `--env`，避免误操作环境。

## 已知问题

### Local D1 FTS 重复索引

截至 2026-08-24，本地演示数据库有 10 条 `messages`，但有 28 条 `messages_fts`，其中 9 个消息 ID 有重复索引。当前 `scripts/export-d1.ts` 生成 `INSERT OR REPLACE INTO messages`，重复导入时可能与 FTS insert/update/delete triggers 组合产生重复索引行。

在实现代码修复前：

- 使用干净的 Local D1 状态验证完整导入流程。
- 不把“消息主键没有重复”视为 FTS 幂等证明。
- 每次导入后同时检查消息数、FTS 总数和按 ID 重复项。

```bash
npx wrangler d1 execute geekshare-archive --local --command "SELECT COUNT(*) AS messages FROM messages; SELECT COUNT(*) AS indexed FROM messages_fts; SELECT id, COUNT(*) AS copies FROM messages_fts GROUP BY id HAVING COUNT(*) <> 1 ORDER BY copies DESC, id;"
```

修复导入/索引逻辑和补充集成测试属于后续代码任务，本轮文档整理不修改运行逻辑。

仓库当前没有 LICENSE 文件；公开分发或接受外部贡献前需要先确定许可证。
