# 极客分享 (GeekShare) - Telegram 频道存档

一个基于 Next.js App Router 构建的纯静态站点，用于浏览与搜索「极客分享」频道的消息存档。支持关键词搜索、话题标签筛选、按年/月过滤与分页虚拟列表，适配深色模式与移动端。

在线地址
- 归档站点：https://archive.geekshare.org
- Telegram 频道：https://t.me/xgeekshare

功能速览
- 搜索：按消息文本、ID、媒体标题/描述进行模糊搜索
- 标签：自动提取消息里的 #标签，可一键筛选
- 时间：按年、月过滤（自动从消息日期中解析）
- 分页：大数据量下的虚拟列表渲染，滚动顺畅
- 高亮：跳转到被回复的消息时提供临时高亮
- 顶部导航：标题与头像可点击跳转频道
- 暗色模式：根据系统偏好自动切换，色彩对比度可读性优化

技术栈
- Next.js 14（App Router，静态导出）
- React 18 + TypeScript
- Tailwind CSS 3
- @tanstack/react-virtual（窗口虚拟化）
- lucide-react（图标）
- PostCSS

项目结构（关键目录）
```
geekshare-web/
├─ src/
│  ├─ app/
│  │  ├─ page.tsx           # 首页（搜索/筛选/列表/分页/虚拟化）
│  │  ├─ layout.tsx         # 全局布局 + SEO 元数据
│  │  ├─ globals.css        # 全局样式（Tailwind 指令入口）
│  │  └─ icon.svg           # Next.js App Router 默认 favicon（与 public/favicon.svg 保持一致）
│  ├─ components/
│  │  ├─ FloatingTabBar.tsx # 底部悬浮导航（站点/频道快捷入口）
│  │  └─ MessageCard.tsx    # 消息卡片
│  └─ data/
│     └─ messages.json      # 消息数据源（导出/同步到此处）
├─ public/
│  ├─ favicon.svg           # 站点 favicon（与 src/app/icon.svg 一致）
│  ├─ og-image.svg          # OG/Twitter 分享图（占位）
│  ├─ telegram.svg          # Telegram 图标（作为外链 SVG 失败时的本地回退）
│  └─ ...（静态资源）
├─ scripts/
│  └─ og-export.mjs         # 将 og-image.svg 转为 og-image.png（使用 sharp）
├─ next.config.mjs          # output: 'export'（纯静态导出）
├─ tailwind.config.ts       # Tailwind 配置（content 指向 src 下目录）
├─ postcss.config.mjs       # PostCSS 配置（启用 tailwindcss 插件）
├─ package.json             # 脚本/依赖
└─ README.md
```

快速开始
1) 环境
- Node.js ≥ 18（推荐 18/20 LTS）
- 包管理器：npm / pnpm / yarn（示例命令以 npm 为例）

2) 安装依赖
```
npm i
```

3) 本地开发
```
npm run dev
```
- 打开 http://localhost:3000
- 修改 src/data/messages.json 或组件后热更新生效

4) 构建（静态导出）
```
npm run build
```
- Next.js 会依据 next.config.mjs 的 `output: 'export'` 进行静态导出
- 构建产物在 `out/` 目录，可直接部署到任何静态托管（Nginx/OSS/Pages）

5) 预览静态产物（可选）
`next start` 仅适用于 SSR/Node 运行；静态导出请使用任意静态服务器：
```
npx serve ./out
# 或用 Nginx/Apache/容器等托管 out 目录
```

数据来源与格式
- 数据文件路径：`src/data/messages.json`
- 站点会对该文件内的消息进行解析/渲染；日期自动抽取年/月用于筛选；文本中以 `#话题` 形式的标签会被自动统计

最小示例：
```json
[
  {
    "id": "123456",
    "date": "01.06.2024 12:34:56",
    "from": "GeekShare",
    "text": "这里是示例消息文本 #工具 #开源",
    "media": {
      "type": "photo",
      "url": "/photos/1.jpg",
      "title": "示例图片",
      "description": "图片描述"
    },
    "replyTo": "123450",
    "reactions": [
      { "emoji": "👍", "count": "10" },
      { "emoji": "❤️", "count": "3" }
    ]
  }
]
```
字段约定（节选）
- id：字符串
- date：字符串，形如 `DD.MM.YYYY HH:mm:ss`（脚本会以 `.` 和空格拆分）
- text：纯文本（内含 `#标签` 时会自动纳入标签统计）
- media：可选；`type` ∈ ["photo","video","file"]；支持 `url`、`title`、`description` 等
- replyTo：可选；字符串，指向被回复消息 id
- reactions：可选；包含表情与计数

SEO 与站点元数据
- 全局元数据在 `src/app/layout.tsx` 中的 `export const metadata`：
  - 标题（title）
  - 描述（description）
  - 关键词（keywords）
  - icons（favicon）
  - metadataBase / alternates.canonical（规范化链接）
  - openGraph / twitter / robots（社交分享与爬虫）
- 已配置：
  - Canonical：`https://archive.geekshare.org`
  - OG/Twitter：已提供占位分享图 `public/og-image.svg`；Twitter 对 SVG 兼容性较差，建议使用 PNG

分享图（OG/Twitter）
1) SVG 占位：`public/og-image.svg`（1200×630）
2) 生成 PNG（推荐，兼容 Twitter）：
- 需安装 `sharp`（开发依赖）：
```
npm i -D sharp
```
- 执行转换脚本（默认将 `og-image.svg` 转为 `og-image.png`，尺寸 1200×630）：
```
node scripts/og-export.mjs
```
- 元数据引用（已配置）：
  - `openGraph.images`: `["/og-image.png", "/og-image.svg"]`
  - `twitter.images`: `["/og-image.png"]`

站点图标（favicon）
- 推荐将两个文件保持一致以避免优先级冲突：
  - `public/favicon.svg`
  - `src/app/icon.svg`（Next.js App Router 会自动作为 favicon）
- 如修改图标，请同时替换上述两个文件的内容
- 若浏览器仍显示旧图标，请强刷缓存（Ctrl+F5/禁用缓存）或临时改文件名并更新引用

样式与主题
- Tailwind 作为主样式工具；入口在 `src/app/globals.css`（使用 `@tailwind base/components/utilities`）
- 顶部导航的标题色已设为品牌红 `#fe4844`，其余文字改为更易读的中性色（浅色/深色模式均优化）
- 可在组件内直接使用 Tailwind 类名微调，也可在 `globals.css` 中扩展

已知编辑器提示
- VS Code 如提示 `Unknown at rule @tailwind`：
  1) 安装扩展「Tailwind CSS IntelliSense」
  2) 或在设置中忽略该规则：
     - `"css.lint.unknownAtRules": "ignore"`
     - 也可为 `scss/less` 分别设置对应项
  3) 若使用 Stylelint，请忽略 `tailwind/apply/variants/responsive/screen` 等 at-rules 或使用 `stylelint-tailwindcss` 插件  
- 该提示通常不影响实际构建（PostCSS 会正确处理）

部署建议
- 本项目为纯静态导出，`out/` 目录可直接部署至：
  - Nginx/Apache/自建服务器
  - 对象存储（OSS/COS/S3）+ CDN
  - GitHub Pages / Cloudflare Pages / Vercel（静态）
- Nginx 示例（片段）：
```nginx
server {
  listen 80;
  server_name archive.geekshare.org;
  root /path/to/out;

  location / {
    try_files $uri $uri/ /index.html;
  }
}
```

开发约定与维护建议
- 组件职责单一，逻辑保持在页面内聚合，复用提取到 `src/components`
- 数据更新只需替换 `src/data/messages.json`
- 大数据量渲染依赖虚拟化（@tanstack/react-virtual），避免在卡片组件里产生不可控高度变化
- 提交前运行：
```
npm run lint
```

常见问题（FAQ）
- 构建后 `next start` 无法启动？
  - 因为本项目为静态导出（`output: 'export'`），请直接托管 `out/` 目录或使用静态服务器预览
- favicon 替换不生效？
  - 同时替换 `public/favicon.svg` 与 `src/app/icon.svg`，并强制刷新缓存
- 分享图不显示？
  - Twitter 对 SVG 支持有限，建议生成 `og-image.png`，并确保缓存刷新或更换文件名

贡献
- 欢迎提交 Issue/PR 优化体验与性能
- 提交代码请保证通过 `npm run lint`

许可证
- 以仓库实际 LICENSE 为准（若未提供，请与仓库拥有者确认）

——  
Made with ❤️ by GeekShare