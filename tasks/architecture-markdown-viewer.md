# Architecture Plan: Markdown Viewer

## Scope
- Phase 1: standalone macOS Markdown viewer, built for local unsigned distribution.
- Phase 2: JetBrains plugin prototype that reuses renderer logic and settings semantics.

## Key Decisions (Current)
- App framework: Electrobun v1 (Bun-first desktop runtime).
- Rendering scope: GFM baseline.
- Refresh mode: auto-refresh with debounce + update indicator.
- UI: preview + outline sidebar + source toggle button.
- File open behavior: one new window per file.
- Config model: both settings UI and `~/.config` file.
- Link behavior: in-document anchors, external browser for web links, in-app open for local file links.
- Performance target: files up to 10 MB.

## Research Summary
- Electrobun v1 exists and is active as of February 2026.
- Electrobun config/events documentation clearly covers URL scheme handling (`open-url`), but does not clearly document Finder document-type file associations in the same explicit way.
- JetBrains plugin path for web-based preview is JCEF-based, with explicit support for markdown-style HTML preview components.

## Proposed System Design

### 1) Desktop Shell
- Runtime: Electrobun main process.
- Responsibilities:
  - app/window lifecycle
  - startup argument handling (opened file paths)
  - native shell interactions (open external URL, open file)
  - settings persistence bridge

### 2) Renderer View (Web)
- Web UI hosted in Electrobun webview.
- Responsibilities:
  - markdown render pipeline
  - outline extraction/navigation
  - source view toggle (read-only)
  - update indicator

### 3) Render Pipeline
- Input: markdown text + active config.
- Steps:
  1. Parse markdown with GFM-capable parser.
  2. Transform to HTML.
  3. Sanitize HTML output before inject.
  4. Apply app CSS + dark code-block theme.
  5. Bind link handling hooks and anchor scrolling.

### 4) File Watch Pipeline
- Watch current file path.
- Debounce filesystem events.
- Re-read file and re-render only when content hash changes.
- Emit small status event (`updated` + timestamp).

### 5) Config System
- Source of truth: config file in `~/.config/<app>/config.json`.
- UI settings panel edits persisted keys.
- Validate on load; fall back to defaults on schema violations.

## Phase Plan

### Phase 0: Feasibility Spikes (Must Pass)
1. Electrobun file association spike
- Goal: confirm `.md`/`.markdown` Finder association and file-open handoff.
- Exit criteria: double-click in Finder launches app and delivers file path reliably.
- Fallback if blocked: ship with "Open With" flow and small helper registration script while tracking upstream support.

2. Renderer compatibility spike
- Goal: verify selected parser/plugin stack handles GFM corpus and 10 MB performance envelope.
- Exit criteria: render correctness baseline and acceptable latency.

### Phase 1: MVP Standalone App
1. App bootstrap
- Electrobun scaffold, window creation, CLI/startup open-file flow.

2. Markdown renderer
- GFM render + sanitize + dark code highlight.

3. Viewer UX
- Preview pane, outline sidebar, source toggle button.

4. File watching
- Auto-refresh debounce + update indicator.

5. Link handling
- Internal anchors, external URL open, local file in-app open.

6. Config and settings
- Config schema, file persistence, settings UI.

7. Packaging
- macOS unsigned build artifact and smoke tests.

### Phase 2: JetBrains Plugin Prototype
1. Plugin scaffold
- Use IntelliJ Platform plugin template.

2. Preview panel
- JCEF-based viewer tab/panel for markdown files.

3. Shared render strategy
- Reuse CSS/themes/options and as much markdown pipeline behavior as possible.

4. Basic settings mapping
- Mirror critical viewer options in plugin settings.

## Test Strategy
- Unit tests:
  - markdown-to-HTML transformations
  - config validation
  - link resolution rules
- Integration tests:
  - open file -> render output
  - file change -> debounced update
  - local link navigation across files
- Manual smoke:
  - Finder double-click open
  - large file rendering up to 10 MB
  - multi-window open behavior

## Risks and Mitigations
- Risk: Electrobun file association support is under-documented.
  - Mitigation: early spike; keep fallback registration strategy.

- Risk: XSS/security issues in rendered markdown.
  - Mitigation: sanitize HTML and lock dangerous options by default.

- Risk: Renderer divergence between standalone and JetBrains plugin.
  - Mitigation: keep renderer logic modular and data-driven.

- Risk: performance degradation on large files.
  - Mitigation: debounce + hash checks + incremental UI updates where possible.

## Initial Backlog (Execution Order)
1. Create repository scaffold (Electrobun app skeleton + task runner).
2. Implement markdown render pipeline + sanitizer.
3. Build preview + outline + source toggle.
4. Implement file watcher and update indicator.
5. Implement link routing behavior.
6. Add config file + settings UI.
7. Complete macOS packaging and Finder association verification.
8. Create JetBrains plugin spike branch with JCEF preview skeleton.

## Done Criteria for Phase 1
- macOS app launches and opens `.md` via Finder.
- GFM rendering behaves correctly on acceptance corpus.
- auto-refresh + indicator works reliably.
- local/external/anchor link behaviors match requirements.
- config file and UI settings persist and reload.

