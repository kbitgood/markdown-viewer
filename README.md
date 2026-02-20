# Markdown Viewer

A standalone markdown viewer built with Electrobun.

## Features

- GFM rendering (tables, task lists, fenced code, strikethrough, autolinks)
- Dark-mode code blocks
- Preview + outline sidebar
- Source toggle (read-only)
- Auto-refresh on file changes with debounce + status indicator
- Local link navigation in-app
- External links open in default browser
- Config persisted to `~/.config/markdown-viewer/config.json`
- macOS Info.plist patch script for `.md` file association

## Development

```bash
bun install
bun run dev
```

## Build

```bash
bun run build
bun run postbuild:mac
```

## Open markdown files

- In app: click `Open File`.
- Finder integration: build app, run `postbuild:mac`, then register as default app for `.md` if needed in Finder's "Get Info" panel.
