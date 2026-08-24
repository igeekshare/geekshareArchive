---
name: "GeekShare Archive"
description: "以克制的技术编辑台语言呈现可信、清晰、可持续阅读的 Telegram 技术归档。"
colors:
  archive-red: "hsl(359 72% 51%)"
  telegram-blue: "hsl(216 82% 46%)"
  cool-paper: "hsl(220 20% 98%)"
  paper-white: "hsl(0 0% 100%)"
  editorial-ink: "hsl(222 32% 10%)"
  quiet-surface: "hsl(220 24% 96%)"
  quiet-ink: "hsl(220 9% 46%)"
  cool-rule: "hsl(220 18% 89%)"
  night-canvas: "hsl(222 30% 7%)"
  night-surface: "hsl(222 27% 10%)"
  night-ink: "hsl(210 20% 96%)"
  night-rule: "hsl(222 18% 20%)"
  night-red: "hsl(359 94% 65%)"
  night-blue: "hsl(214 94% 64%)"
typography:
  display:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "1.8rem"
    fontWeight: 800
    lineHeight: 1.25
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "2rem"
    fontWeight: 800
    lineHeight: 1.32
    letterSpacing: "-0.02em"
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 800
    lineHeight: 1.4
    letterSpacing: "-0.01em"
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.9
    letterSpacing: "normal"
  control:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 500
    lineHeight: 1.35
    letterSpacing: "normal"
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "normal"
rounded:
  sm: "calc(0.65rem - 4px)"
  md: "calc(0.65rem - 2px)"
  lg: "0.65rem"
  xl: "0.75rem"
  2xl: "1rem"
  full: "9999px"
spacing:
  xs: "0.375rem"
  sm: "0.5rem"
  md: "0.75rem"
  lg: "1rem"
  xl: "1.25rem"
  2xl: "1.5rem"
  3xl: "1.75rem"
components:
  button-primary:
    backgroundColor: "{colors.archive-red}"
    textColor: "{colors.paper-white}"
    typography: "{typography.control}"
    rounded: "{rounded.md}"
    padding: "0.5rem 1rem"
    height: "2.25rem"
  button-primary-hover:
    backgroundColor: "hsl(359 72% 51% / 0.9)"
    textColor: "{colors.paper-white}"
    typography: "{typography.control}"
    rounded: "{rounded.md}"
    padding: "0.5rem 1rem"
    height: "2.25rem"
  button-outline:
    backgroundColor: "{colors.cool-paper}"
    textColor: "{colors.editorial-ink}"
    typography: "{typography.control}"
    rounded: "{rounded.md}"
    padding: "0.5rem 1rem"
    height: "2.25rem"
  button-telegram:
    backgroundColor: "{colors.telegram-blue}"
    textColor: "{colors.paper-white}"
    typography: "{typography.control}"
    rounded: "{rounded.md}"
    padding: "0.5rem 1rem"
    height: "2.25rem"
  input-default:
    backgroundColor: "{colors.cool-paper}"
    textColor: "{colors.editorial-ink}"
    typography: "{typography.control}"
    rounded: "{rounded.md}"
    padding: "0.25rem 0.75rem"
    height: "2.25rem"
  card-content:
    backgroundColor: "{colors.paper-white}"
    textColor: "{colors.editorial-ink}"
    rounded: "{rounded.xl}"
    padding: "1rem"
  chip-filter:
    backgroundColor: "{colors.quiet-surface}"
    textColor: "{colors.quiet-ink}"
    typography: "{typography.control}"
    rounded: "{rounded.md}"
    padding: "0.5rem 0.75rem"
    height: "2rem"
---

# Design System: GeekShare Archive

## Overview

**Creative North Star: "克制的技术编辑台"**

GeekShare Archive 像一张经过编辑、校对和持续维护的技术内容台面：内容先于装饰，状态先于气氛，红蓝品牌只在真正需要辨识的地方发声。冷中性色构成纸面与墨色，清楚的标题、时间、来源和操作路径建立可信度。

界面同时容纳两种密度：搜索、筛选、导航与管理动作保持紧凑；消息正文、媒体和详情页保留宽松的阅读节奏。明暗主题共享同一语义层级，卡片依靠边框、表面色差与留白分组，不靠厚重悬浮感制造层次。

首屏应让真实技术内容先被看见，再提供规模统计和辅助发现。系统拒绝管理面板式公共首页、巨型统计卡、无节制渐变、泛滥胶囊和纯装饰动效；任何强调都必须服务于内容判断、导航或状态理解。

**Key Characteristics:**

- 红色表达归档品牌、编辑选择和关键选中状态；蓝色表达链接、导航路径与 Telegram 行为。
- 冷中性色、细描边和克制色调层级构成主要表面语言。
- 真实技术内容优先于统计数字和产品自述。
- 紧凑控制区与舒展阅读区在同一页面共存。
- 明暗主题、键盘焦点和移动端单列是同一系统的一等状态。

## Colors

调色板以冷纸面和深墨色建立编辑感，让 Archive Red 与 Telegram Blue 成为稀少但明确的语义信号。

### Primary

- **Archive Red** (`archive-red` / `night-red`): 用于品牌标记、当前导航、编辑精选、关键筛选选中态与焦点环；深色主题提高亮度以维持对比。

### Secondary

- **Telegram Blue** (`telegram-blue` / `night-blue`): 用于 Telegram 主行动、正文链接、阅读全文路径、标签选择和可下载资源；它代表“前往或连接”，不与红色争夺同一状态。

### Neutral

- **Cool Paper** (`cool-paper`): 浅色主题页面底色，保持低温、低噪声的阅读环境。
- **Paper White** (`paper-white`): 浅色卡片、弹层和高优先级输入表面。
- **Editorial Ink** (`editorial-ink`): 浅色主题的标题与正文主色。
- **Quiet Surface / Quiet Ink** (`quiet-surface` / `quiet-ink`): 次级模块、占位、元信息和未选控制。
- **Cool Rule** (`cool-rule`): 卡片、输入、分隔和结构边界。
- **Night Canvas / Night Surface** (`night-canvas` / `night-surface`): 深色主题的页面与卡片双层表面。
- **Night Ink / Night Rule** (`night-ink` / `night-rule`): 深色主题的文本与结构边界。

### Named Rules

**The Two-Accent Rule.** 红色负责“归档与编辑判断”，蓝色负责“路径与 Telegram 连接”；不要用红蓝渐变或在同一控件上同时表达两种语义。

**The Signal Rarity Rule.** 强调色只用于当前状态、可行动路径和异常反馈；大面积背景继续由冷中性色承担。

## Typography

**Display Font:** 系统无衬线栈（优先 `PingFang SC` 与平台 UI 字体）
**Body Font:** 同一系统无衬线栈
**Label/Mono Font:** 标签沿用系统无衬线；仅快捷键提示使用平台等宽字体

**Character:** 单一字体家族通过字重、行高和有限的负字距建立层级，避免“展示字体”盖过中文技术内容。标题紧实果断，正文疏朗耐读，元信息退后但保持清楚。

### Hierarchy

- **Display**（800，桌面 1.8rem，1.25 行高，-0.025em）：首页主题与精选内容的最高层标题；移动端收至约 1.45rem。
- **Headline**（800，2rem，1.32 行高，-0.02em）：消息详情标题，只在完整阅读上下文中使用。
- **Title**（800，1.25rem，1.4 行高，-0.01em）：内容流卡片标题，允许两行但不使用夸张字号。
- **Body**（400，1rem，1.9 行高）：消息正文；阅读列限制在 72ch，移动端降至 0.9375rem / 1.85。
- **Control**（500，0.8125rem，1.35 行高）：筛选、排序和工具栏动作。
- **Label**（500，0.75rem，1.4 行高）：时间、数量、频道和补充状态。

### Named Rules

**The Reading Breath Rule.** 中文正文通过 1.85–1.9 的行高和不超过 72ch 的行长获得呼吸；不得用压缩正文来追求控制区的密度。

## Layout

公共页面使用居中的 1276px 最大内容框架，左右保留 16px 安全边距；在 1300px 以上才贴合框架边缘。桌面信息流采用主内容列与 320px 辅助侧栏，列间距为 28px；发现模块内部采用约 1.35:0.65 的内容—榜单分栏。页头固定为 60px，并为搜索、导航和主题/Telegram 行动分配清晰区域。

1024px 以下收为单列，侧栏模块退出主阅读路径；768px 以下搜索移至页头第二行，主导航进入抽屉。620px 以下正文与首屏标题缩小但保持行高，卡片内边距由舒适级收至紧凑级。横向类别或频道控制允许滚动，不强行压缩文字。

阅读区使用 16–28px 的间隔与 16–28px 的卡片内边距；控制区围绕 32–36px 高度与 6–12px 间隔组织。统计只能是紧凑辅助行或内容后的上下文，不得占据首屏主叙事。

**The Content-First Rule.** 首屏先呈现一条可判断价值的真实技术内容，再显示统计或产品规模；公共首页绝不退化为后台概览。

## Elevation & Depth

系统以扁平分层为默认：页面、卡片、次级表面和分隔线通过冷色调差异与 1px 边框区分。`shadow-sm` 只为按钮、输入和基础卡片提供近乎不可见的触觉边缘；深色主题尤其依赖边框，而不是把阴影加重。较深阴影只属于沉浸媒体弹层或极少数需要与页面脱离的浮层。

### Shadow Vocabulary

- **Primitive Edge** (`0 1px 2px 0 rgb(0 0 0 / 0.05)`): 按钮、输入和基础卡片的轻微边缘，不用于叠高普通内容卡。
- **Hero Ambient** (`0 14px 36px -28px rgba(15, 23, 42, 0.9)`): 深色主题块的低扩散环境影，只在高优先级内容容器上使用。
- **Media Overlay** (`0 25px 50px -12px rgb(0 0 0 / 0.25)`): 全屏媒体查看器等真正脱离文档流的层。

### Named Rules

**The Flat-by-Default Rule.** 静止内容表面优先使用边框、色调和留白；阴影只说明触觉、悬浮或模态层级，不能代替信息结构。

## Shapes

基础半径从 0.65rem 派生：紧凑控件使用约 6–8px，媒体和普通容器使用约 10px，内容卡使用 12px，主题级组合容器使用 16px。边角温和但不软萌，裁切始终服从内容边界。1px 实线边框是默认结构语法；图片、视频和缩略图沿用所在容器的圆角。

完整胶囊仅用于频道横向选择、反应计数、小型状态与圆形品牌标记。常规按钮、标签和导航项保持中等圆角，避免所有元素都成为药丸形。

**The Pill Rarity Rule.** 胶囊只表示可切换集合、计数或小型状态；正文卡、统计容器、主按钮和普通字段不得胶囊化。

## Components

组件应像编辑工具：紧凑、可预测、状态清楚；品牌通过准确的红蓝分工进入组件，而不是额外装饰。

### Buttons

- **Shape:** 默认 36px 高、约 8px 圆角；小号 32px，高优先级大号 40px，图标按钮保持正方形点击区域。
- **Primary:** Archive Red 底与白字，水平内边距 16px；用于当前筛选和明确提交，不重复出现在每个卡片上。
- **Hover / Focus:** 悬停仅轻微降低或提升表面亮度；键盘焦点使用 2px 品牌环与背景色偏移，禁用态降至 50% 不透明度并停止指针事件。
- **Secondary / Ghost:** 描边按钮用于主题、排序和工具动作；幽灵按钮只在已有容器边界内出现。
- **Telegram:** Telegram Blue 底与白字，携带发送图标，只用于打开或连接 Telegram。

### Chips

- **Style:** 筛选标签使用约 8px 圆角与冷灰表面；频道集合与反应计数可使用完整胶囊。
- **State:** 红色表示当前内容类别或编辑精选，蓝色表示频道、话题等可导航筛选；未选态保持中性。

### Cards / Containers

- **Corner Style:** 普通内容卡 12px，组合主题容器 16px。
- **Background:** 浅色使用白色表面叠在 Cool Paper 上；深色使用 Night Surface 叠在 Night Canvas 上。
- **Shadow Strategy:** 遵循 Flat-by-Default，普通卡依靠边框与色调层级。
- **Border:** 1px Cool Rule / Night Rule；悬停可使边框稍清晰，不抬升整卡。
- **Internal Padding:** 紧凑模块 16px，内容流 16–20px，详情阅读 28px。

### Inputs / Fields

- **Style:** 36px 高、约 8px 圆角、1px 输入边界；搜索字段使用低对比冷灰底与左侧 16px 图标。
- **Focus:** 表面回到页面背景色，并出现 2px、30% 强度的 Archive Red 焦点环。
- **Error / Disabled:** 错误保留红色语义但必须配文字；禁用态 50% 不透明度并保留可辨边界。

### Navigation

页头固定、轻微半透明并带背景模糊，底部以 1px 边界收口。桌面当前项使用 Archive Red 文本与 2px 底线，其他项保持 Quiet Ink；移动端保留品牌、主题与菜单，搜索独占第二行。导航状态由位置、文字和线条共同表达，不只依赖颜色。

### Message Card

消息卡是系统的签名组件：频道头像、来源与时间先建立证据，标题与摘要承担判断，标签和媒体提供内容线索，反应与阅读全文在底部收束。Feed 模式允许摘要与展开；Detail 模式放大标题并把正文置于 72ch 阅读列。卡片不使用整面点击或夸张悬浮，链接与菜单保持各自明确的交互边界。

**The Semantic State Rule.** 红色、蓝色、中性与警示色必须对应稳定含义；组件状态不因追求“更丰富”而交换颜色角色。

## Do's and Don'ts

### Do:

- **Do** 让标题、摘要、来源和时间在首屏形成一条真实、可判断价值的技术内容。
- **Do** 使用 1px 边框、冷色调表面和 16–28px 留白建立卡片层级。
- **Do** 让控制保持 32–36px 紧凑高度，同时让中文正文保持 1.85–1.9 行高和最多 72ch 行长。
- **Do** 保持红色用于归档/编辑判断，蓝色用于链接/Telegram 路径，并在明暗主题中维持这一分工。
- **Do** 为键盘操作提供可见焦点，并让移动端在 320px 起仍保持完整内容路径。

### Don't:

- **Don't** 把公共首页做成管理面板式概览、巨型统计卡阵列或 KPI 首屏。
- **Don't** 用厚重阴影替代边框、色调层级和信息分组。
- **Don't** 添加红蓝大渐变、泛滥胶囊、玻璃拟态噪声或没有信息目的的装饰动效。
- **Don't** 为了紧凑而压缩中文正文、隐藏来源证据或弱化可访问焦点。
- **Don't** 在没有真实数据与内容证据时虚构规模、热度、订阅或可信度证明。
