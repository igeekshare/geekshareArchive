# GeekShare Archive

[![CI](https://github.com/igeekshare/geekshareArchive/actions/workflows/ci.yml/badge.svg)](https://github.com/igeekshare/geekshareArchive/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

自建 Telegram 频道归档站：接收新消息、编辑和反应，将正文保存到 Cloudflare D1、媒体保存到 R2，提供可搜索的公开网站和管理后台。来源帖子删除后，已归档内容仍可保留。

[在线演示](https://archive.geekshare.org) · **[首次部署指南](docs/DEPLOYMENT.md)** · [本地开发与贡献](CONTRIBUTING.md) · [安全报告](SECURITY.md)

GeekShare 是默认演示品牌，站点名称、Logo、SEO 和频道均可在后台修改。演示站不属于你的部署资源。

## 第一次使用，从这里开始

| 你的目标 | 阅读入口 |
| --- | --- |
| 部署自己的归档站 | [首次部署：按顺序完成配置、上线和验收](docs/DEPLOYMENT.md) |
| 在电脑上试用或开发 | [本地运行与可选演示数据](CONTRIBUTING.md#本地运行) |
| 用 GitHub Actions 自动部署 | [首次手动部署成功后再配置 Actions](docs/DEPLOYMENT.md#github-actions-自动部署可选) |
| 排查登录、同步或媒体问题 | [常见问题](docs/DEPLOYMENT.md#常见问题) |
| 了解设计约束和验证记录 | [PRODUCT.md](PRODUCT.md) · [DESIGN.md](DESIGN.md) |

首次生产部署需要：**Node.js 22.12+ 的 22.x**、npm、Cloudflare 账号（启用 Workers、D1、R2、Access）、自己的域名，以及由你管理的 Telegram 频道和 Bot。虽然 `package.json` 声明的最低 Node.js 版本仍为 20.9.0，当前锁定依赖的完整工具链需要至少 22.12.0，CI 使用 22。

推荐顺序：**准备代码 → 创建 D1/R2 → 填写站点配置 → 配置 Access 和 Secret → 迁移并部署 → 添加频道和注册 Webhook → 发消息验收**。完整命令及每一步的预期结果见[部署指南](docs/DEPLOYMENT.md)。

> 生产部署不需要先导入演示数据，也不需要运行 Prisma。当前 `main` 的普通推送会触发检查和生产部署；Fork 后请先按指南配置自己的资源、Secrets 和验收域名。

## 能做什么

- 多频道归档，保留消息正文、受支持的 Telegram 富文本、编辑和反应。
- 全文搜索，按标签、年月、频道、内容类型筛选，支持多种排序和分页。
- R2 保存媒体、缩略图、频道头像和站点图片；失败可在后台查看并重试。
- 响应式公开页面、消息详情、动态 SEO，以及按 Canonical URL 生成的默认分享图。
- Cloudflare Access 保护的后台，可维护消息、频道、展示规则、品牌、SEO 和 Telegram 连接。

使用前请了解这些边界：

- Webhook 归档接入后的更新，**不会自动抓取全部历史**；历史回填需要单独使用本地 CLI。
- 后台目前通过公开频道用户名接入频道，Bot 必须是频道管理员；未添加或未启用的频道不会入库。
- Telegram 相册消息尚未合并；大型文件及部分媒体类型存在归档限制。
- 归档内容和 R2 公共媒体面向公开访客，部署者应确认内容适合公开。
- 具体能力、媒体限制和历史验证范围见 [PRODUCT.md](PRODUCT.md)；CI 通过不能代替你自己实例的端到端验收。

## 怎么运行

```text
Telegram Bot → HTTPS Webhook → Cloudflare Worker → D1（正文、索引、配置）
                                     │
                                     ├────────→ R2（媒体、站点图片）
                                     │
访客 / 管理员 → Worker + Workers Assets（Next.js 静态导出）
```

这是 **Workers + Workers Assets** 项目，不能只上传 `out/` 就获得完整功能；API、鉴权和归档由 Worker 提供。

| 路径 | 用途 |
| --- | --- |
| `src/app/` | 公开站点与管理后台界面 |
| `src/worker.ts`、`src/cloudflare/` | API、鉴权、Telegram、D1/R2 运行逻辑 |
| `migrations/` | 生产 D1 schema 的唯一来源 |
| `wrangler.example.jsonc` | 可提交的通用部署模板 |
| `.dev.vars.example` | 仅供本地使用的变量和 Secret 示例 |
| `scripts/` | Webhook 注册、历史同步、演示数据导入等工具 |
| `src/data/messages.json` | 10 条不含真实频道内容或媒体的演示种子 |

`DB`、`MEDIA`、`ASSETS` 是固定的 Worker binding 名称。生产 D1、Local D1 和 Prisma SQLite 是三份独立数据，不会自动同步。

## 常用命令

在完成对应的[本地配置](CONTRIBUTING.md#本地运行)或[生产配置](docs/DEPLOYMENT.md)后运行：

| 命令 | 作用 |
| --- | --- |
| `npm ci` | 按锁文件安装依赖 |
| `npm run dev` | 构建并启动本地完整 Worker 服务，默认端口 8787 |
| `npm run dev:ui` | 仅调试 Next.js UI，默认端口 3000，不提供 Worker API |
| `npm run deploy:check` | 构建并用通用示例配置 dry-run，不发布 |
| `npm run db:d1:remote` | 对默认名称的生产 D1 应用迁移，**修改远程资源** |
| `npm run deploy` | 构建并部署顶层生产配置，**发布远程 Worker** |
| `npm run webhook:register` | 使用当前 shell 的变量注册 Telegram Webhook |

数据库改名后应使用 `DB` binding 命令，详见[部署指南](docs/DEPLOYMENT.md#5-检查迁移并部署)。开发用 `deploy:dev` 等命令还需要自行配置 `env.dev`，通用模板未提供该环境。

## API 与安全

公开 API 包括 `GET /api/messages`、`/api/archive-meta`、`/api/homepage`、`/api/site-config`、`/api/messages/:id`、`/api/messages/:id/discovery`，以及 Telegram 使用的 `POST /api/telegram/webhook`。管理接口位于 `/api/admin/*`。

- 管理端验证 Cloudflare Access JWT 的签名、issuer、audience 和管理员邮箱；写请求还校验 `SITE_URL` 同源。
- Webhook 校验 `X-Telegram-Bot-Api-Secret-Token`；D1 查询使用绑定参数，消息 HTML 经过受限转换或清洗。
- `ENVIRONMENT=development` 或 `test` 会绕过管理鉴权，只能用于本地或测试，生产保持 `production`。
- `wrangler.jsonc`、`.dev.vars`、本地数据库和 `.data/` 已被 Git 忽略；不要提交真实凭据、资源配置、频道历史或媒体。
- 永久删除只清理消息中明确记录的 R2 object key，并以墓碑阻止同一帖子重新入库。

贡献、完整检查命令和本地演示见 [CONTRIBUTING.md](CONTRIBUTING.md)。安全漏洞请按 [SECURITY.md](SECURITY.md) 私下报告。

## License

[MIT](LICENSE) © GeekShare
