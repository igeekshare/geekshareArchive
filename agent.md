# Agent Notes for GeekShare Archive

## Project Overview

This repository is the GeekShare Telegram channel archive site. It is a pure static Next.js App Router application for browsing, searching, filtering, and sharing archived Telegram messages.

Primary public URLs:
- Archive site: https://archive.geekshare.org
- Telegram channel: https://t.me/xgeekshare

## Tech Stack

- Next.js 14 App Router
- React 18
- TypeScript
- Tailwind CSS 3
- `@tanstack/react-virtual` for windowed message rendering
- `lucide-react` for icons
- Static export via `next.config.mjs` with `output: "export"`

## Important Commands

Install dependencies:

```bash
npm i
```

Run local development server:

```bash
npm run dev
```

Build static output:

```bash
npm run build
```

Lint before handoff:

```bash
npm run lint
```

Static build output is written to `out/`. Because this project uses static export, do not rely on `next start` for production preview.

## Project Structure

- `src/app/page.tsx`: main archive page with search, tag filters, time filters, pagination, and virtualized message list.
- `src/app/message/[id]/page.tsx`: statically generated single-message page.
- `src/app/layout.tsx`: root layout and site metadata.
- `src/app/globals.css`: Tailwind entry point and global theme variables.
- `src/components/MessageCard.tsx`: shared message card renderer for text, media, replies, reactions, and single-message pages.
- `src/components/FloatingTabBar.tsx`: bottom floating navigation links.
- `src/data/messages.json`: canonical message data source.
- `public/`: favicon, OG image, Telegram fallback icon, and static media assets.
- `scripts/og-export.mjs`: converts `public/og-image.svg` to PNG when `sharp` is available.

## Data Contract

`src/data/messages.json` is an array of Telegram message objects. Expected fields:

- `id`: string
- `date`: string in `DD.MM.YYYY HH:mm:ss` style
- `from`: string
- `text`: string
- `media`: optional object with `type`, `url`, optional `thumb`, `title`, `description`, `width`, and `height`
- `replyTo`: optional string pointing to another message id
- `reactions`: optional array of `{ emoji: string, count: string }`

Supported media types are `photo`, `video`, and `file`.

The UI extracts years and months from `date`, extracts tags from `text` using `#tag` syntax, and searches across message text, id, media title, and media description.

## Development Guidelines

- Keep the project static-export compatible. Avoid server-only runtime features, dynamic SSR assumptions, or APIs that require a Node server at deploy time.
- Keep message data updates isolated to `src/data/messages.json` unless UI behavior also needs to change.
- Keep reusable UI in `src/components`; page-level filtering, pagination, and virtualization logic currently lives in `src/app/page.tsx`.
- Preserve virtualized list behavior when changing message card layout. Avoid unstable heights, late-loading layout shifts, or effects that make scrolling jump.
- Use Tailwind utility classes for local styling. Extend `globals.css` only for truly global styles or reusable utilities.
- Prefer `lucide-react` icons for interface actions when an icon exists.
- When changing favicon or brand icon assets, keep `public/favicon.svg` and `src/app/icon.svg` in sync.
- Keep OG/Twitter metadata in `src/app/layout.tsx` and message-specific metadata in `src/app/message/[id]/page.tsx`.
- If adding PNG social previews, generate or update `public/og-image.png` and verify metadata references.

## Encoding and Copy

- Keep source files encoded as UTF-8.
- Several Chinese UI strings should be checked carefully when editing. If text appears garbled in the app or terminal output, replace it with clean UTF-8 Chinese copy rather than preserving mojibake.
- For user-facing Chinese copy, prefer concise Simplified Chinese.

## Verification Checklist

Before handing off meaningful changes:

1. Run `npm run lint`.
2. Run `npm run build` to confirm static export still succeeds.
3. If UI changed, open the local app and verify desktop and mobile layouts.
4. Check search, tag filtering, year/month filtering, pagination, reply jump behavior, and single-message pages.
5. Check that media paths resolve from `public/` and do not introduce broken image or download URLs.

## Deployment Notes

The generated `out/` directory can be hosted by any static host, including Nginx, object storage plus CDN, GitHub Pages, Cloudflare Pages, or static Vercel output.

For static previews, serve `out/` with a static file server such as:

```bash
npx serve ./out
```
