# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- 公开访客浏览、搜索和筛选一个或多个 Telegram 频道的持久化归档内容。
- 站点管理员通过 Cloudflare Access 进入后台，维护消息、频道、站点信息、SEO 和 Telegram 连接。

## Product Purpose

GeekShare Archive 将 Telegram 频道的新推送、编辑、反应和媒体持久化到 D1/R2，在来源内容删除、频道停用或失联后继续提供可搜索的公开归档。

成功意味着：

- 访客能稳定浏览跨频道时间流、搜索历史消息并查看持久化媒体。
- 管理员能在明确的权限边界内维护内容和频道，并看见连接、同步、媒体和保存结果。
- 本地演示、迁移工具和生产数据源保持清晰隔离。

## Positioning

产品以 Telegram Webhook 实时同步和独立的 D1/R2 持久化为核心，不依赖 Telegram 原帖长期在线，也不把本地 JSON、SQLite 或 Local D1 当作生产回退源。

## Operating Context

- 生产运行时设计为静态导出的 Next.js 前端、Cloudflare Worker、D1、R2 和 Cloudflare Access。
- 所有受管频道共享一个 Telegram Bot；Token 与 Webhook Secret 只应存在于 Cloudflare Secrets 或本地未跟踪的 Secret 文件中。
- 历史批量回填通过本地 CLI 完成，后台负责频道、Webhook、消息审核、站点设置和日常运维。
- Git 仓库不承载历史图片、视频和贴纸；这些文件已被有意移除，生产媒体由 R2 承载。
- `src/data/messages.json`、SQLite 和 Local D1 是可重建的演示/迁移状态，不代表生产内容或生产健康。

## Capabilities and Constraints

- 首页使用跨频道时间流并支持频道筛选；停用频道停止接收新消息但保留历史归档。
- 有来源消息或展示消息关联的频道不可删除，只能停用。
- 站点品牌和 SEO 配置保存在 D1，站点图片保存在 R2，由 Worker 在请求时读取和注入，无需重新构建。
- Webhook 先持久化正文和原始 Update，再异步归档媒体；媒体失败不能导致正文丢失。
- 数据模型、公共消息结构和消息卡片支持多附件展示；Webhook 对每个 Telegram Update 仍只选择一种主媒体，尚未合并 media group 相册消息。
- 精确 `/admin` 只展示不含管理 UI 的品牌登录入口；后台页面和管理接口依赖 Cloudflare Access，Worker 验证 Access JWT，写操作额外校验同源 `Origin`。
- 管理员可以编辑正文、标签、展示频道、发布时间和发布状态；后台覆盖优先于后续 Telegram 编辑。
- 管理员可以永久删除消息及其明确记录的 R2 对象；删除墓碑阻止同一 Telegram 帖子重新入库，这是归档优先原则的人工例外。
- Worker 的定时任务只做健康记录和有界重试，不承担完整频道历史抓取。

## Brand Commitments

保留 GeekShare / 极客分享名称、中英文技术分享语境、红蓝强调色和简洁克制的操作型后台。站点名称、首页标题、简介、Logo、Favicon 和 SEO 信息可以由管理员覆盖。

不得虚构订阅者、客户、性能、可用性或商业证明。具体线上状态只有在实际远程验证并注明日期后才能作为证据使用。

## Evidence on Hand

仓库当前可观察到：

- Cloudflare Worker、D1 migrations、Telegram Webhook、R2 媒体归档、公开 API 和管理后台实现。
- 静态 Next.js 页面、Worker HTML 重写、动态站点配置和 Cloudflare Access 请求校验逻辑。
- 2026-08-24 本地执行的 32 项测试、lint、typecheck、build、Assets 校验和 Wrangler dry-run 均通过。
- 同日本地 D1 已应用 `0001`、`0002` 和 `0003` 三份 migration，包含 1 个演示频道和 10 条演示消息。
- 同日本地 FTS 有 28 行，其中 9 个消息 ID 有重复索引；这是导入/索引流程的已知问题，不得被描述为已解决。

上述证据证明仓库实现和本地构建状态，不证明远程 Cloudflare 资源、Webhook、Access、DNS、TLS 或生产数据当前健康。

## Product Principles

- 归档优先：来源变化不能造成已持久化内容自动丢失。
- 密钥隔离：Secret 不进入 D1、客户端响应、日志或文档。
- 事实优先：配置、实现、本地验证和远程状态必须清晰区分。
- 操作清晰：管理员始终能理解连接、权限、同步和保存结果。
- 默认可用：可选配置读取失败时使用安全内置默认值，核心数据错误不得被静默伪装为生产健康。
- 渐进扩展：多频道不设置固定上限，不在后台启动历史回填任务或创建本地原创消息。

## Accessibility & Inclusion

后台和公开页面保持键盘可操作、清晰焦点、语义化状态反馈，并覆盖桌面与移动端布局。
