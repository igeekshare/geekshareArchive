# 本地开发与贡献

感谢你改进 GeekShare Archive。提交贡献即表示你同意所提交内容按本仓库的 MIT License 发布。

如果只想上线自己的站点，请直接阅读[首次部署指南](docs/DEPLOYMENT.md)。这里介绍本地环境、演示数据和提交检查。

## 开始之前

- 使用 Node.js 22.12+ 的 22.x 和 npm，与 CI 的 Node 22 对齐；`package.json` 的 20.9 下限不足以运行当前锁定依赖的完整工具链。
- 仓库维护者先快进同步本地 `main`，检查后直接推送到 `origin/main`；外部贡献或明确需要评审的改动使用分支和 Pull Request。
- 不要提交真实 Token、管理员邮箱、Cloudflare 资源 ID、生产 `wrangler.jsonc`、频道历史或媒体文件。
- 安全问题请按 [SECURITY.md](SECURITY.md) 私下报告。

## 本地运行

```bash
git clone https://github.com/igeekshare/geekshareArchive.git
cd geekshareArchive
npm ci
cp wrangler.example.jsonc wrangler.jsonc
cp .dev.vars.example .dev.vars
npx wrangler d1 migrations apply DB --local
npm run dev
```

Windows PowerShell 将两条 `cp` 替换为：

```powershell
Copy-Item wrangler.example.jsonc wrangler.jsonc
Copy-Item .dev.vars.example .dev.vars
```

已有个人配置时保留原文件，不要重新覆盖。默认打开 `http://localhost:8787`，后台在 `/admin/`。本地 Wrangler 使用模拟的 D1/R2，不需要先创建远程资源；空数据库没有消息是正常状态。

`.dev.vars` 示例使用 `ENVIRONMENT=development`，会绕过 Access 和写请求同源检查，只用于本机调试。不要把此值用于远程部署，也不要将本地服务暴露到公网。示例中的 Telegram 值是占位符，不支持真实同步；真实测试需要自己的 Bot 和 HTTPS Webhook 地址。

`npm run dev` 会先构建，再启动 Wrangler，修改源码后需重启以重新构建。仅调试界面可用 `npm run dev:ui`（默认 `http://localhost:3000`），但它不提供 Worker API、D1 或 R2。

### 可选：导入 10 条演示消息

停止本地服务后运行：

```bash
npm run db:generate
npx prisma migrate deploy
npm run import:json
npm run db:export-d1
npx wrangler d1 migrations apply DB --local
npx wrangler d1 execute DB --local --file .data/d1-import.sql
npm run dev
```

这条流程将仓库演示 JSON 导入 `prisma/geekshare.db`，再生成 `.data/d1-import.sql` 并导入 Local D1。重复导入同一快照会按 archive ID 更新消息；它不是备份还原工具，不要拿演示快照覆盖真实数据。生产 Webhook 直接写 D1，不经过 Prisma。

历史回填可运行 `npm run sync:channel -- --help` 查看参数；它按参数抓取公开频道页面，写入本地 Prisma SQLite，不会一条命令自动补齐全部历史。之后需要审查导出的 SQL 并单独迁移到目标 D1，媒体也需要单独处理。不要把此命令当成生产定时同步。

## 本地检查

提交前运行（dry-run 之前必须先 build）：

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

CI 使用 Node.js 22 执行上述检查；通用配置的 dry-run 不迁移数据库、不发布 Worker。需要验证个人生产配置时，在构建后执行 `npx wrangler deploy --dry-run --env=""`。

## 提交与 Pull Request

维护者直推前必须执行 `git fetch origin` 和 `git pull --ff-only origin main`，运行相关检查，并且只暂存当前任务的文件。推送前再次确认本地 `main` 包含最新 `origin/main`；历史分叉时先安全处理，禁止 force-push。

外部贡献或明确需要评审的改动使用 Pull Request：

1. 说明具体问题、最终行为和验证结果。
2. 行为变化应更新测试和文档；界面变化请附截图。
3. 避免无关格式化、生成文件和大版本依赖迁移。
4. 等待 `verify` 检查通过，并根据评审意见更新分支。

**当前工作流会对 `main` 的普通推送自动迁移并部署生产，纯文档改动也会触发。** 只有确认不需要发布的纯文档提交，可在提交信息中使用 GitHub 支持的 [`[skip ci]`](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/skip-workflow-runs) 跳过当前工作流，提交前仍应检查文档和链接。需要必过 CI 的 PR 不应使用此标记，否则所需检查会保持等待状态。

部署请求须完成检查和构建、Cloudflare 部署、线上验收及 GitHub 推送；全部成功后才能称为稳定发布。Fork 的 Actions 配置和验收域名调整见[部署指南](docs/DEPLOYMENT.md#github-actions-自动部署可选)。
