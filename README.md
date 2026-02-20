# Markdown Viewer

A standalone markdown viewer built with Electrobun.

## Features

- GFM rendering (tables, task lists, fenced code, strikethrough, autolinks)
- Dark-mode code blocks
- Clean layout: outline sidebar (left) + full markdown canvas (right)
- View Source as a separate window from the app menu
- Auto-refresh on file changes with debounce (no manual status bar)
- Local link navigation in-app
- External links open in default browser
- Settings in a dedicated settings window opened from the app menu
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
