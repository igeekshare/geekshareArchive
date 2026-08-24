# Contributing

感谢你改进 GeekShare Archive。提交贡献即表示你同意所提交内容按本仓库的 MIT License 发布。

## 开始之前

- 安装 Node.js 20.9 或更高版本，推荐 Node.js 22。
- 从 `main` 创建短生命周期分支，保持改动聚焦。
- 不要提交真实 Token、管理员邮箱、Cloudflare 资源 ID、生产 `wrangler.jsonc`、频道历史或媒体文件。
- 安全问题请按 [SECURITY.md](SECURITY.md) 私下报告。

## 本地检查

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

## Pull Request

1. 清楚说明问题、解决方式和验证结果。
2. 行为变化应更新测试和文档；界面变化请附截图。
3. 避免无关格式化、生成文件和大版本依赖迁移。
4. 等待 `verify` 检查通过，并根据评审意见更新分支。

所有改动通过 Pull Request 和 CI 合并到 `main`。
