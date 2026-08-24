# Security Policy

## 支持范围

仅支持 `main` 分支的最新版本。历史提交、个人 fork 和自行修改的部署不在维护范围内。

## 私下报告漏洞

请使用 GitHub 的 [Private vulnerability reporting](https://github.com/igeekshare/geekshareArchive/security/advisories/new) 提交报告，不要创建公开 Issue、Discussion 或 Pull Request。

报告请包含：

- 受影响的提交或版本
- 可复现步骤和最小证明
- 影响范围与可能的缓解方式
- 便于联系的方式

不要在报告中附带真实 Bot Token、Cloudflare Secret、管理员身份信息或第三方频道数据。我们会尽快确认报告，并在修复可用后协调披露。

## 安全边界

本项目依赖 Cloudflare Access 保护管理端、Telegram Webhook Secret 验证来源，并通过 D1 prepared statements 与受限 HTML 清洗降低注入风险。部署者仍需自行保护 Cloudflare 账号、域名、Secret、D1/R2 数据和 Access policy。
