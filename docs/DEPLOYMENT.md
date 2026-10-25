# 首次部署指南

[返回 README](../README.md) · [本地开发](../CONTRIBUTING.md) · [常见问题](#常见问题)

目标：从空数据库开始，上线自己的归档站，登录后台，并成功归档频道的一条新消息。先完成手动部署，再考虑 GitHub Actions；**不需要先导入演示数据或配置 Prisma**。

以下命令均在仓库根目录执行，站点示例为 `https://archive.example.com`，媒体域名为 `https://media.example.com`，请替换成你自己的地址。

## 0. 准备这些资源

| 准备项 | 用途 / 从哪里获取 |
| --- | --- |
| Git、Node.js 22.12+ 的 22.x、npm | 本地下载代码和构建，与 CI 的 Node 22 对齐 |
| Cloudflare 账号 | 使用 Workers、D1、R2 和 Zero Trust Access；先在控制台启用 R2 |
| 已接入 Cloudflare 的域名 | 本指南使用独立站点子域名和媒体子域名 |
| Telegram Bot Token | 向 Telegram 的 [@BotFather](https://t.me/BotFather) 创建 Bot 获取 |
| 由你管理的公开 Telegram 频道 | 需要能把 Bot 加为管理员；后台通过频道用户名接入 |
| 管理员邮箱 | 用于 Access 登录，且必须与 Worker Secret 一致 |

Wrangler 示例默认允许 `workers.dev`，可以用于初步查看站点；本指南的完整生产流程使用自己的域名。媒体生产访问也需要配置 R2 自定义域名。资源额度和费用以 Cloudflare 账号控制台为准。

## 1. 获取代码并登录 Cloudflare

建议先 Fork 到自己的 GitHub 账号，再克隆自己的仓库，便于后续保存定制和配置 Actions。下面以克隆上游为例：

```bash
git clone https://github.com/igeekshare/geekshareArchive.git
cd geekshareArchive
npm ci
npx wrangler login
npx wrangler whoami
```

确认 `whoami` 显示的是你准备使用的 Cloudflare 账号。然后复制配置模板：

```bash
cp wrangler.example.jsonc wrangler.jsonc
```

PowerShell 使用 `Copy-Item wrangler.example.jsonc wrangler.jsonc`。已有配置时不要覆盖。

`wrangler.jsonc` 已被 Git 忽略，用于保存你的资源配置。`.dev.vars` 只给本地 Wrangler 使用，不会随部署自动上传；生产 Secret 在第 4 步单独设置。

## 2. 创建 D1、R2 和媒体域名

```bash
npx wrangler d1 create geekshare-archive
npx wrangler r2 bucket create geekshare-media
```

记录创建结果中的 D1 `database_id`。如果同名资源已存在，先确认其用途，使用新名称或明确复用自己的资源。

在 Cloudflare 控制台打开 **R2 → 你的 bucket → Settings → Custom Domains**，连接 `media.example.com`，等待域名状态变为 Active。详见 [R2 公共访问文档](https://developers.cloudflare.com/r2/buckets/public-buckets/)。

R2 binding 只提供 Worker 读写权限，**不会自动让浏览器访问媒体**。本站直接使用 `MEDIA_BASE_URL + object key` 生成图片地址，因此媒体域名应指向这个 bucket 并允许公开读取。不要填 S3 API 地址、站点地址或示例域名；`r2.dev` 仅用于开发测试，不用于生产。

## 3. 填写 wrangler.jsonc

保留模板中的 `main`、`assets`、`migrations_dir`，以及 `DB`、`MEDIA`、`ASSETS` 三个 binding 名称。修改以下字段：

| 字段 | 填写内容 |
| --- | --- |
| `name` | 你的 Worker 名称，默认 `geekshare-archive` |
| `account_id`（可新增） | 第 1 步确认的账号 ID；多账号时建议显式填写 |
| `d1_databases[0].database_name` | 第 2 步的数据库名称 |
| `d1_databases[0].database_id` | 创建 D1 返回的真实 ID，替换全零占位值 |
| `r2_buckets[0].bucket_name` | 第 2 步的 bucket 名称 |
| `vars.SITE_URL` | `https://archive.example.com`，不要带路径 |
| `vars.MEDIA_BASE_URL` | `https://media.example.com` |
| `vars.ENVIRONMENT` | 保持 `production` |
| `triggers.crons` | 建议 `["0 * * * *"]`，启用每小时健康记录和有界媒体/删除清理重试 |

生产站点可以使用 [Workers Custom Domain](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)。在配置顶层加入 `routes`，并调整两个开关：

```jsonc
"workers_dev": false,
"preview_urls": false,
"routes": [
  { "pattern": "archive.example.com", "custom_domain": true }
]
```

这是需要合并到模板的片段，不是完整配置。域名须属于当前 Cloudflare 账号的有效 zone，且不要与已有站点或 DNS 记录冲突。也可使用已有的 Worker Route，但需要自行配置对应的代理 DNS 记录。

生产不要设置 `ENVIRONMENT=development` 或 `test`，这两个值会绕过管理鉴权。定时任务只做健康记录和有界重试，不抓取频道历史；保留空 `crons` 则没有自动维护。

## 4. 配置 Access 和生产 Secret

### 保护管理后台

在 Cloudflare Zero Trust 中创建一个 **Self-hosted Access 应用**，将下面这些路径放进同一个受保护应用（均在 `archive.example.com` 下）：

```text
/admin/d*
/admin/m*
/admin/c*
/admin/s*
/api/admin/*
```

它们覆盖当前的 dashboard、display、messages、channels、site、seo、sync 和管理 API。应用的 Allow Policy 只允许你的管理员邮箱，登录方式可用 One-time PIN 或组织身份提供商。

- 保持公开首页、公共 API 和 `/api/telegram/webhook` 不受 Access 登录拦截，否则访客和 Telegram 无法访问。
- 如需显式保留公开登录入口，对精确 `/admin` 和 `/admin/` 单独配置 `Bypass + Everyone`。不要用 `/admin/*` 替代此入口规则，通配符可能匹配空字符串。
- 受保护应用的 Session Duration 可设为 `1 month`，管理员 Policy 继承应用时长；保持 **Cookie Path Attribute 关闭**，让入口能读取 Access Cookie 并跳转到后台。
- 记录 Zero Trust team domain（如 `https://your-team.cloudflareaccess.com`）和这个受保护应用的 **Application Audience（AUD）**。所有后台路径应使用同一 AUD。

Worker 还会独立检查 JWT 和管理员邮箱；仅配置 Access Allow Policy 不够，也不需要另建站点账号或密码。

### 上传 Secret

生成一个随机 Webhook Secret（下面只输出随机值，不上传）：

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

将它存入密码管理器，再依次执行命令，在提示时输入对应值：

```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN --env=""
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET --env=""
npx wrangler secret put CF_ACCESS_TEAM_DOMAIN --env=""
npx wrangler secret put CF_ACCESS_AUD --env=""
npx wrangler secret put CF_ACCESS_ADMIN_EMAIL --env=""
```

| Secret | 内容 |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | BotFather 提供的 Token，所有接入频道共享此 Bot |
| `TELEGRAM_WEBHOOK_SECRET` | 刚才生成的随机值；注册 Webhook 时须使用同一个值 |
| `CF_ACCESS_TEAM_DOMAIN` | 带 `https://` 的 team domain，不是归档站域名 |
| `CF_ACCESS_AUD` | 受保护后台应用的 Application Audience |
| `CF_ACCESS_ADMIN_EMAIL` | Allow Policy 中的管理员邮箱，目前校验单个邮箱 |

首次上传时，若 Wrangler 提示 Worker 不存在，确认名称和账号正确后允许创建。`--env=""` 明确选择顶层生产配置。Secret 不要写进客户端代码、`vars` 或 Git；`secret put` 会更新远程 Worker，后续修改也应视作线上变更。详见 [Workers Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)。

## 5. 检查、迁移并部署

先完成本地检查：

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run assets:verify
npx wrangler deploy --dry-run --env=""
npm audit --audit-level=high
```

通过后，确认目标账号和配置，再执行远程迁移和正式部署：

```bash
npx wrangler d1 migrations apply DB --remote --env=""
npm run deploy
```

远程迁移只应用尚未执行的 `migrations/` 文件；首次执行后得到空的业务数据库，不含演示频道或消息。`npm run deploy` 会重新构建并将 Worker 和 `out/` 静态资源一起发布。

这里使用 `DB` binding，因此数据库改名后也可使用。`npm run db:d1:remote`、`db:d1:local` 和部分 `db:import-d1:*` 脚本固定了默认数据库名 `geekshare-archive`，改名后不要直接照用。

部署结束后，以下地址应能访问：

- `https://archive.example.com/`：公开首页，空站点是正常状态。
- `https://archive.example.com/api/archive-meta`：返回 200 和 JSON，确认 Worker 能查询 D1。
- `https://archive.example.com/admin/`：登录入口，点击登录后经 Access 进入后台。

## 6. 接入频道并注册 Webhook

1. 在 Telegram 中将此 Bot 加入目标频道，并设为管理员。
2. 登录后台的「频道管理」，用频道公开用户名添加频道，确认状态为启用且 Bot 权限正常。
3. 打开「Telegram 同步」，测试连接并注册 Webhook，预期地址为 `https://archive.example.com/api/telegram/webhook`。
4. 在频道发布一条新的纯文本消息，确认公开站点出现；再发布小图片，确认 R2 出现对象且公开媒体 URL 能打开。
5. 在「站点设置」和「SEO 设置」中填写自己的品牌与 Canonical URL，替换默认演示信息。

**先添加并启用频道，再发送测试消息。** 未接入或已停用频道的 Update 会被忽略并返回 204；Webhook 注册成功不代表频道已经接入，也不会自动补齐之前的消息。

一个 Bot 同时只使用一个 Webhook 目标。生产和开发实例应使用不同 Bot，避免测试注册覆盖生产地址。本站注册 `channel_post`、`edited_channel_post`、`message_reaction_count`；反应更新可能延迟，详见 [Telegram Bot API](https://core.telegram.org/bots/api#update)。

### 可选：用 CLI 注册 Webhook

推荐优先用后台注册，直接使用已保存的 Worker Secret。脚本只读取当前 shell 的环境变量，**不会自动读取 `.dev.vars` 或 Cloudflare Secret**。

Bash / zsh：

```bash
SITE_URL=https://archive.example.com \
TELEGRAM_BOT_TOKEN=replace-me \
TELEGRAM_WEBHOOK_SECRET=replace-with-the-same-secret \
npm run webhook:register
```

PowerShell：

```powershell
$env:SITE_URL = "https://archive.example.com"
$env:TELEGRAM_BOT_TOKEN = "replace-me"
$env:TELEGRAM_WEBHOOK_SECRET = "replace-with-the-same-secret"
npm run webhook:register
```

在自己的终端中替换占位符，注意不要把真实值提交到 Git 或分享含密钥的终端记录。脚本要求 HTTPS，并保留 Telegram 的待处理更新，不会主动丢弃队列。

## 上线验收

- [ ] 首页和 `/api/archive-meta` 返回 200，公共页面不要求 Access 登录。
- [ ] 无痕窗口访问 `/admin/dashboard/` 和 `/api/admin/channels` 时不能直接获得管理内容。
- [ ] 管理员可经 Access 登录、读取后台并保存设置，退出后管理内容不可访问。
- [ ] 新文本消息入库，编辑后更新；频道与 Bot 权限显示正常。
- [ ] 小图片已写入 R2，浏览器可通过媒体域名打开，站点图片正常。
- [ ] 「Telegram 同步」显示的 Webhook 地址正确，待处理队列无持续积压。

这些检查通过后，才说明你的实例完成首次部署。真实媒体故障恢复、缩略图重试和大型文件需要另行验证，不能仅凭首页 200 判断全部功能健康。

## GitHub Actions 自动部署（可选）

先完成上述手动部署和验收，再在你自己的 Fork 中配置。当前 [CI 工作流](../.github/workflows/ci.yml) 对 `main` 的普通推送依次执行本地检查、生产 D1 迁移、Worker 部署和线上验收；PR 只做检查，不读取生产 Secret，也不操作远程资源。纯 Markdown 改动的普通推送同样会部署。

启用前：

1. 在自己的 Fork 中，将工作流 `Verify production endpoints` 的两个 `https://archive.geekshare.org` 地址改成你的站点域名，避免把演示站正常误当成自己的部署成功。
2. 在仓库 **Settings → Secrets and variables → Actions → Repository secrets** 中配置下表三项。
3. 确认 Worker 的五个运行时 Secret 已完成第 4 步；工作流不会代你上传它们。
4. 在 Fork 的 Actions 页面启用工作流（如尚未启用），然后推送自己的 `main`，等待部署及验收全部成功。

| Actions Secret | 内容 |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | 限定到目标账号/域名的 CI Token；需要部署 Worker、应用 D1 migration，以及对应域名/路由操作权限，按实际配置授权 |
| `CLOUDFLARE_ACCOUNT_ID` | 目标 Cloudflare 账号 ID |
| `WRANGLER_CONFIG_JSON` | 已验证的生产 `wrangler.jsonc` 完整内容，不包含 Bot Token 或 Access 运行时 Secret |

如果数据库改过名，还须将工作流的 `npm run db:d1:remote` 改为 `npx wrangler d1 migrations apply DB --remote --env=""`。修改本地 `wrangler.jsonc` 后也要同步更新 `WRANGLER_CONFIG_JSON`，否则下次 CI 会部署旧配置。

缺少任一 Actions Secret 会在生产配置准备阶段失败。已开始的生产发布不会被后续提交取消；只在检查、迁移、部署、线上验收全部通过后确认发布成功。纯文档提交跳过部署的方法见[贡献说明](../CONTRIBUTING.md#提交与-pull-request)。

## 后续更新与维护

更新前备份 D1 和重要 R2 对象，保留自己的本地配置；不要重新复制模板覆盖生产配置。同步代码并运行[完整检查](../CONTRIBUTING.md#本地检查)，用个人配置 dry-run 后，再按第 5 步迁移和部署，最后重新执行上线验收。

媒体失败按 1、2、4、8 小时退避，第 5 次失败后停止自动重试；后台人工重试可解除耗尽状态。启用 Cron 才会自动维护，主媒体成功但缩略图失败也可能处于待修复状态。Webhook 使用有时限的处理 lease 避免重复副作用，已有消息的公开 archive ID 会在编辑、反应和重放时保持不变。

## 常见问题

| 现象 | 优先检查 |
| --- | --- |
| 构建成功，但 `/api/*` 404 | 是否只上传了 `out/` 或只运行 `dev:ui`？需要通过 Wrangler 部署完整 Worker |
| `no such table` / D1 查询失败 | 是否对正确账号、正确 `DB` 执行了全部远程 migration？Local D1 与生产 D1 相互独立 |
| 已登录 Access，后台仍 401/403 | 检查 team domain、同一个后台应用的 AUD、管理员邮箱、所有后台路径及 Access JWT 注入 |
| 后台能读但无法保存 | `SITE_URL` 必须与浏览器访问的 HTTPS origin 一致，生产写请求校验同源 |
| `/admin/` 没有自动进入后台 | 检查 Access Cookie Path Attribute 是否关闭、应用 Cookie 是否有效；尝试从 `/admin/dashboard/` 重新登录 |
| 注册成功，频道新消息没出现 | Bot 是否为管理员？频道是否已在后台添加并启用？Webhook 是否被另一个实例覆盖或被 Access 拦截？请发一条新消息测试 |
| 旧消息没出现 | Webhook 不自动回填历史，参阅[本地 CLI 与数据说明](../CONTRIBUTING.md#可选导入-10-条演示消息) |
| 正文正常，图片 / Logo 404 | `MEDIA_BASE_URL` 是否指向实际 bucket 的公开域名？对象是否已经写入 R2？仅配置 binding 不会公开 bucket |
| 失败媒体不自动重试 | 检查 Cron、下次重试时间、是否已到 5 次上限；不支持的媒体类型需按后台提示处理 |
| Fork 的 Actions 失败 / 验收了演示站 | 检查三项 Secrets、Token 权限、默认数据库名，以及工作流里写死的验收域名 |
| 出现 `env.dev` 配置错误 | 通用模板没有 `env.dev`；首次生产部署使用本指南的顶层配置和 `npm run deploy` |
