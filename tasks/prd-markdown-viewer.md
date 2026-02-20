# PRD: Markdown Viewer (Standalone First, JetBrains Plugin Later)

## 1. Introduction/Overview
Build a better Markdown viewer than the default JetBrains preview, with high configurability and predictable rendering.

Phase 1 is a standalone desktop app (macOS-first) that can open `.md` files from Finder and render them in a web view. Phase 2 is a JetBrains plugin that reuses the same rendering approach and settings model where possible.

This PRD covers the product requirements for Phase 1 and readiness requirements for Phase 2.

## 2. Goals
- Deliver a standalone macOS Markdown viewer that opens `.md` files via double-click in Finder.
- Render GitHub Flavored Markdown (GFM) with reliable dark-mode code blocks.
- Support auto-refresh when files change on disk, with debounce and visible update indicator.
- Provide configurable behavior through both settings UI and config file.
- Support opening local markdown links in-app and external links in the default browser.
- Keep architecture compatible with a future JetBrains plugin preview implementation.

## 3. User Stories

### US-001: Open markdown files from Finder
**Description:** As a macOS user, I want to double-click a `.md` file and have it open directly in the viewer.

**Acceptance Criteria:**
- [ ] App registers `.md` and `.markdown` associations in packaged build.
- [ ] Double-clicking a file in Finder opens a new app window for that file.
- [ ] Re-opening the same file creates a separate window (per chosen behavior A).
- [ ] If association cannot be registered at build-time, app shows clear diagnostics in logs and onboarding.

### US-002: Render GFM content accurately
**Description:** As a user reading docs, I want tables, task lists, and fenced code blocks to render correctly.

**Acceptance Criteria:**
- [ ] Tables render with proper column alignment.
- [ ] Task list items render with checkboxes.
- [ ] Fenced code blocks render with syntax highlighting.
- [ ] Strikethrough, autolinks, and headings render as expected.

### US-003: Code blocks use dark mode styling
**Description:** As a user, I want code blocks always styled in dark mode for readability.

**Acceptance Criteria:**
- [ ] Code blocks use dark color theme regardless of app chrome theme.
- [ ] Non-code prose remains readable with app theme defaults.
- [ ] Theme is configurable later without changing markdown parser pipeline.

### US-004: Live updates from file changes
**Description:** As a user editing markdown elsewhere, I want the viewer to auto-refresh when the file changes.

**Acceptance Criteria:**
- [ ] Files are watched for changes while open.
- [ ] Refresh is debounced to avoid flicker/churn during rapid saves.
- [ ] UI shows an "Updated" indicator when refresh occurs.
- [ ] No full app freeze on repeated save events.

### US-005: Navigation and links
**Description:** As a user, I want links to behave naturally in the preview.

**Acceptance Criteria:**
- [ ] In-document `#anchor` links scroll within the current document.
- [ ] External `http/https` links open in default browser.
- [ ] Local file links (`./other.md`, absolute file paths) open in the app.
- [ ] Missing local targets show a non-blocking error message.

### US-006: Viewer-first UI with optional source visibility
**Description:** As a user, I want a clean preview UI but still be able to inspect raw markdown.

**Acceptance Criteria:**
- [ ] Default layout is preview + outline sidebar.
- [ ] A visible button toggles source view.
- [ ] Source view is read-only in v1.
- [ ] Outline reflects heading structure and supports click-to-scroll.

### US-007: Configurability
**Description:** As a user, I want app behavior I can customize and persist.

**Acceptance Criteria:**
- [ ] App reads config from `~/.config` (platform-appropriate path resolution).
- [ ] UI settings can edit persisted values.
- [ ] Config keys include: link behavior, refresh debounce, window behavior, default zoom/font size.
- [ ] Invalid config falls back to defaults and surfaces warning.

## 4. Functional Requirements
- FR-1: App must package as a standalone macOS desktop app.
- FR-2: App must render GFM markdown content including tables/task lists/strikethrough/autolinks.
- FR-3: App must apply dark-themed syntax highlighting to fenced code blocks.
- FR-4: App must support preview + outline layout and a source toggle button.
- FR-5: App must monitor the opened file and auto-refresh with debounce.
- FR-6: App must display a visual update state after auto-refresh.
- FR-7: App must open local markdown links in-app and external links in system browser.
- FR-8: App must support Finder opening for `.md` files and new-window-per-file behavior.
- FR-9: App must load and persist user configuration using file + UI settings.
- FR-10: App must remain responsive for markdown files up to 10 MB.

## 5. Non-Goals (Out of Scope)
- Editing markdown content in v1.
- WYSIWYG functionality.
- Collaborative or cloud-sync features.
- Plugin marketplace distribution for JetBrains in phase 1.
- Cross-platform parity beyond macOS in initial milestone.

## 6. Design Considerations
- Keep UI minimal and viewer-focused.
- Outline/sidebar should support fast navigation for long documents.
- Source button should be discoverable but secondary to preview.
- Update indicator should be subtle and non-blocking.

## 7. Technical Considerations
- Primary runtime candidate: Electrobun v1 for standalone packaging and Bun-first developer workflow.
- Render path: markdown parser + sanitized HTML + web view.
- File-watch pipeline requires debounce and careful event coalescing.
- `.md` file association support in Electrobun needs an implementation spike/verification because official docs emphasize URL schemes; file-association config is not clearly documented in public v1 pages.
- Phase 2 JetBrains plugin cannot run Electrobun runtime directly; it should use IntelliJ Platform APIs (likely JCEF) and reuse renderer logic/HTML assets.

## 8. Success Metrics
- A packaged app opens `.md` from Finder on macOS test machine.
- 95%+ of test corpus markdown renders as expected (GFM coverage baseline).
- File change to preview update median latency < 300ms on normal files.
- No crashes while repeatedly opening/closing 100 markdown files.

## 9. Open Questions
- What exact Electrobun v1 mechanism should register macOS document types for `.md`/`.markdown`?
- Should code block dark mode ever be user-configurable in v1, or hard-locked?
- How much of renderer stack can be shared verbatim with the JetBrains plugin target?
- Should broken local links be surfaced inline, in a toast, or status area?
