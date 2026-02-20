import Electrobun, {
  ApplicationMenu,
  BrowserView,
  BrowserWindow,
  Utils
} from "electrobun/bun";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  statSync,
  watch,
  writeFileSync
} from "node:fs";
import { basename, dirname, extname, isAbsolute, join, resolve } from "node:path";
import { homedir } from "node:os";
import type { FSWatcher } from "node:fs";
import type {
  MainViewerRPC,
  SettingsRPC,
  SourceRPC,
  ViewerConfig,
  ViewState
} from "../shared/rpc";

const APP_NAME = "Markdown Viewer";
const CONFIG_DIR = join(homedir(), ".config", "markdown-viewer");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");
const STATE_PATH = join(CONFIG_DIR, "state.json");

const MARKDOWN_EXTENSIONS = new Set([".md", ".markdown", ".mdown", ".mkd"]);
const RECENTS_LIMIT = 15;
const REFRESH_VISUAL_DELAY_MS = 140;
const WINDOW_OFFSET = 28;

const DEFAULT_FRAME = {
  x: 120,
  y: 80,
  width: 1360,
  height: 900
};

type WindowFrame = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type AppState = {
  recentFiles: string[];
  lastWindowFrame: WindowFrame | null;
};

type WindowContext = {
  window: BrowserWindow<any>;
  watcher: FSWatcher | null;
  debounceTimer: ReturnType<typeof setTimeout> | null;
  filePath: string | null;
  config: ViewerConfig;
  frame: WindowFrame;
};

const defaultConfig: ViewerConfig = {
  refreshDebounceMs: 220,
  openExternalLinksInBrowser: true,
  openLocalLinksInApp: true,
  zoomPercent: 100,
  editorAppPath: "/Applications/IntelliJ IDEA.app",
  sourceVisibleByDefault: false,
  showOutlineByDefault: true
};

const windows = new Set<WindowContext>();
let activeContext: WindowContext | null = null;
let settingsWindow: BrowserWindow<any> | null = null;
let globalConfig = loadConfig().config;
let appState = loadAppState();
let startupWindowTimer: ReturnType<typeof setTimeout> | null = null;
let handledStartupFileOpen = false;

function ensureConfigDir(): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
}

function loadAppState(): AppState {
  try {
    ensureConfigDir();
    if (!existsSync(STATE_PATH)) {
      const initial: AppState = { recentFiles: [], lastWindowFrame: null };
      saveAppState(initial);
      return initial;
    }

    const raw = JSON.parse(readFileSync(STATE_PATH, "utf8")) as Partial<AppState>;
    return {
      recentFiles: Array.isArray(raw.recentFiles)
        ? raw.recentFiles.filter((v): v is string => typeof v === "string")
        : [],
      lastWindowFrame:
        raw.lastWindowFrame &&
        typeof raw.lastWindowFrame.x === "number" &&
        typeof raw.lastWindowFrame.y === "number" &&
        typeof raw.lastWindowFrame.width === "number" &&
        typeof raw.lastWindowFrame.height === "number"
          ? {
              x: raw.lastWindowFrame.x,
              y: raw.lastWindowFrame.y,
              width: raw.lastWindowFrame.width,
              height: raw.lastWindowFrame.height
            }
          : null
    };
  } catch {
    return { recentFiles: [], lastWindowFrame: null };
  }
}

function saveAppState(state: AppState): void {
  ensureConfigDir();
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), "utf8");
}

function clampNumber(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
  warnings: string[],
  key: string
): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    if (value !== undefined) {
      warnings.push(key);
    }
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(value)));
}

function toBoolean(value: unknown, fallback: boolean, warnings: string[], key: string): boolean {
  if (typeof value !== "boolean") {
    if (value !== undefined) {
      warnings.push(key);
    }
    return fallback;
  }
  return value;
}

function sanitizeConfig(raw: unknown): { config: ViewerConfig; warning: string | null } {
  const warnings: string[] = [];
  const input = typeof raw === "object" && raw ? (raw as Record<string, unknown>) : {};
  const editorPath = typeof input["editorAppPath"] === "string" ? input["editorAppPath"].trim() : "";

  const config: ViewerConfig = {
    refreshDebounceMs: clampNumber(
      input["refreshDebounceMs"],
      50,
      5000,
      defaultConfig.refreshDebounceMs,
      warnings,
      "refreshDebounceMs"
    ),
    openExternalLinksInBrowser: toBoolean(
      input["openExternalLinksInBrowser"],
      defaultConfig.openExternalLinksInBrowser,
      warnings,
      "openExternalLinksInBrowser"
    ),
    openLocalLinksInApp: toBoolean(
      input["openLocalLinksInApp"],
      defaultConfig.openLocalLinksInApp,
      warnings,
      "openLocalLinksInApp"
    ),
    zoomPercent: clampNumber(
      input["zoomPercent"],
      50,
      200,
      defaultConfig.zoomPercent,
      warnings,
      "zoomPercent"
    ),
    editorAppPath: editorPath || defaultConfig.editorAppPath,
    sourceVisibleByDefault: false,
    showOutlineByDefault: toBoolean(
      input["showOutlineByDefault"],
      defaultConfig.showOutlineByDefault,
      warnings,
      "showOutlineByDefault"
    )
  };

  return {
    config,
    warning: warnings.length ? `Invalid config keys reset to defaults: ${warnings.join(", ")}` : null
  };
}

function loadConfig(): { config: ViewerConfig; warning: string | null } {
  try {
    ensureConfigDir();
    if (!existsSync(CONFIG_PATH)) {
      writeConfig(defaultConfig);
      return { config: defaultConfig, warning: null };
    }

    const raw = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
    return sanitizeConfig(raw);
  } catch (error) {
    return {
      config: defaultConfig,
      warning: `Config load failed, using defaults: ${(error as Error).message}`
    };
  }
}

function writeConfig(config: ViewerConfig): void {
  ensureConfigDir();
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf8");
}

function isMarkdownPath(filePath: string): boolean {
  return MARKDOWN_EXTENSIONS.has(extname(filePath).toLowerCase());
}

function normalizeFilePath(inputPath: string): string {
  if (inputPath.startsWith("file://")) {
    const url = new URL(inputPath);
    return decodeURIComponent(url.pathname);
  }
  return isAbsolute(inputPath) ? inputPath : resolve(process.cwd(), inputPath);
}

function canonicalFilePath(inputPath: string): string {
  const normalized = normalizeFilePath(inputPath);
  if (!existsSync(normalized)) {
    return normalized;
  }
  try {
    return realpathSync(normalized);
  } catch {
    return normalized;
  }
}

function registerRecentFile(filePath: string): void {
  const canonical = canonicalFilePath(filePath);
  if (!isMarkdownPath(canonical)) {
    return;
  }

  const deduped = appState.recentFiles.filter((p) => p !== canonical);
  appState = {
    ...appState,
    recentFiles: [canonical, ...deduped].slice(0, RECENTS_LIMIT)
  };
  saveAppState(appState);
  rebuildApplicationMenu();
}

function findWindowById(winId: number): WindowContext | null {
  for (const ctx of windows) {
    if (ctx.window.id === winId) {
      return ctx;
    }
  }
  return null;
}

function findOpenWindowByFilePath(filePath: string): WindowContext | null {
  const target = canonicalFilePath(filePath);
  for (const ctx of windows) {
    if (!ctx.filePath) {
      continue;
    }
    if (canonicalFilePath(ctx.filePath) === target) {
      return ctx;
    }
  }
  return null;
}

function readMarkdownFile(filePath: string): { content: string; warning: string | null } {
  try {
    const resolved = canonicalFilePath(filePath);
    if (!existsSync(resolved)) {
      return { content: "", warning: `File not found: ${resolved}` };
    }

    if (!isMarkdownPath(resolved)) {
      return {
        content: readFileSync(resolved, "utf8"),
        warning: `Opened non-standard extension (${extname(resolved)}). Rendering as markdown.`
      };
    }

    const sizeInMb = statSync(resolved).size / (1024 * 1024);
    if (sizeInMb > 10) {
      return {
        content: readFileSync(resolved, "utf8"),
        warning: `Large file (${sizeInMb.toFixed(1)} MB). Rendering may be slower.`
      };
    }

    return { content: readFileSync(resolved, "utf8"), warning: null };
  } catch (error) {
    return { content: "", warning: `Failed to read file: ${(error as Error).message}` };
  }
}

function stripFrontMatter(content: string): string {
  const normalized = content.replaceAll("\r\n", "\n");
  if (!(normalized.startsWith("---\n") || normalized.startsWith("+++\n"))) {
    return normalized;
  }
  const delimiter = normalized.startsWith("---\n") ? "---" : "+++";
  const endToken = `\n${delimiter}\n`;
  const endIndex = normalized.indexOf(endToken, delimiter.length + 1);
  if (endIndex === -1) {
    return normalized;
  }
  return normalized.slice(endIndex + endToken.length);
}

function extractDocumentHeading(content: string): string | null {
  const body = stripFrontMatter(content);
  const lines = body.split("\n");
  for (const rawLine of lines) {
    const line = rawLine.trim();
    const match = line.match(/^#{1,6}\s+(.+?)\s*#*$/);
    if (!match) {
      continue;
    }
    const heading = match[1].trim();
    if (heading.length > 0) {
      return heading;
    }
  }
  return null;
}

function titleFallbackFromPath(filePath: string): string {
  const base = basename(filePath);
  if (base.includes(".")) {
    return base;
  }
  return `${base}.md`;
}

function updateWindowTitle(context: WindowContext, content?: string): void {
  if (!context.filePath) {
    context.window.setTitle(APP_NAME);
    return;
  }
  const heading = content ? extractDocumentHeading(content) : null;
  const title = heading || titleFallbackFromPath(context.filePath);
  context.window.setTitle(title);
}

function pickInitialFilePath(): string | null {
  const args = process.argv
    .slice(2)
    .map((part) => canonicalFilePath(part))
    .filter((part) => !part.endsWith("main.js") && existsSync(part));

  if (args.length > 0) {
    return args[0];
  }

  return null;
}

function buildState(filePath: string | null, config: ViewerConfig, warning: string | null): ViewState {
  if (!filePath) {
    return {
      filePath: null,
      content:
        "# Welcome\n\nOpen a markdown document from the File menu (`Cmd+O`).\n\nEverything else auto-refreshes in the background.",
      warning,
      config,
      updatedAt: Date.now()
    };
  }

  const read = readMarkdownFile(filePath);
  return {
    filePath,
    content: read.content,
    warning: warning ?? read.warning,
    config,
    updatedAt: Date.now()
  };
}

function sendUpdate(context: WindowContext): void {
  if (!context.filePath) {
    return;
  }

  const read = readMarkdownFile(context.filePath);
  updateWindowTitle(context, read.content);
  context.window.webview.rpc?.send.fileUpdated({
    content: read.content,
    filePath: context.filePath,
    updatedAt: Date.now()
  });

  if (read.warning) {
    context.window.webview.rpc?.send.warning({ message: read.warning });
  }
}

function setWatcher(context: WindowContext): void {
  context.watcher?.close();
  context.watcher = null;

  if (!context.filePath) {
    return;
  }

  try {
    context.watcher = watch(context.filePath, () => {
      if (context.debounceTimer) {
        clearTimeout(context.debounceTimer);
      }
      context.debounceTimer = setTimeout(() => {
        sendUpdate(context);
      }, context.config.refreshDebounceMs);
    });
  } catch (error) {
    context.window.webview.rpc?.send.warning({
      message: `File watcher failed: ${(error as Error).message}`
    });
  }
}

function resolveLinkedFile(href: string, fromFilePath: string | null): string {
  if (href.startsWith("file://")) {
    return canonicalFilePath(href);
  }

  if (isAbsolute(href)) {
    return canonicalFilePath(href);
  }

  if (!fromFilePath) {
    return canonicalFilePath(resolve(process.cwd(), href));
  }

  return canonicalFilePath(resolve(dirname(fromFilePath), href));
}

function applyConfigToAllWindows(config: ViewerConfig): void {
  globalConfig = config;
  writeConfig(config);

  for (const ctx of windows) {
    ctx.config = config;
    setWatcher(ctx);
    ctx.window.webview.rpc?.send.configUpdated({ config });
  }

  settingsWindow?.webview.rpc?.send.configUpdated({ config });
}

async function openFileFlow(context: WindowContext): Promise<void> {
  const picked = await Utils.openFileDialog({
    canChooseFiles: true,
    canChooseDirectory: false,
    allowsMultipleSelection: false,
    allowedFileTypes: "md,markdown,mdown,mkd,txt"
  });

  if (picked.length > 0) {
    const pickedPath = canonicalFilePath(picked[0]);
    context.filePath = pickedPath;
    activeContext = context;
    registerRecentFile(pickedPath);
    updateWindowTitle(context, readMarkdownFile(pickedPath).content);
    setWatcher(context);
    sendUpdate(context);
  }
}

function openSourceWindow(context: WindowContext): void {
  const filePath = context.filePath;
  const content = filePath ? readMarkdownFile(filePath).content : "";

  const rpc = BrowserView.defineRPC<SourceRPC>({
    maxRequestTime: 10000,
    handlers: {
      requests: {
        getSourceState: () => ({
          filePath,
          content,
          updatedAt: Date.now()
        })
      },
      messages: {}
    }
  });

  const win = new BrowserWindow({
    title: `Source${filePath ? `: ${filePath}` : ""}`,
    url: "views://sourceview/index.html",
    frame: {
      width: 980,
      height: 760,
      x: context.frame.x + 24,
      y: context.frame.y + 24
    },
    rpc
  });

  win.on("close", () => {
    // no-op
  });
}

function openCurrentFileInEditor(context: WindowContext): void {
  if (!context.filePath) {
    context.window.webview.rpc?.send.warning({ message: "No file is open." });
    return;
  }

  const editorApp = context.config.editorAppPath?.trim() || defaultConfig.editorAppPath;
  if (process.platform === "darwin") {
    const proc = Bun.spawnSync({
      cmd: ["open", "-a", editorApp, context.filePath],
      stdout: "ignore",
      stderr: "ignore"
    });
    if (proc.exitCode === 0) {
      return;
    }
  }

  const opened = Utils.openPath(context.filePath);
  if (!opened) {
    context.window.webview.rpc?.send.warning({
      message: `Failed to open file in editor: ${context.filePath}`
    });
  }
}

function openSettingsWindow(): void {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }

  const rpc = BrowserView.defineRPC<SettingsRPC>({
    maxRequestTime: 10000,
    handlers: {
      requests: {
        getSettingsState: () => globalConfig,
        saveSettings: (config: ViewerConfig) => {
          const sanitized = sanitizeConfig(config).config;
          applyConfigToAllWindows(sanitized);
          settingsWindow?.webview.rpc?.send.status({ message: "Saved" });
          return sanitized;
        }
      },
      messages: {}
    }
  });

  settingsWindow = new BrowserWindow({
    title: "Markdown Viewer Settings",
    url: "views://settingsview/index.html",
    frame: {
      width: 760,
      height: 520,
      x: (activeContext?.frame.x ?? DEFAULT_FRAME.x) + 30,
      y: (activeContext?.frame.y ?? DEFAULT_FRAME.y) + 30
    },
    rpc
  });

  settingsWindow.on("close", () => {
    settingsWindow = null;
    if (windows.size === 0) {
      Utils.quit();
    }
  });
}

function menuTarget(): WindowContext | null {
  return activeContext ?? windows.values().next().value ?? null;
}

function buildWindowMenuItems(): any[] {
  const items: any[] = [
    { role: "minimize" },
    { role: "zoom" },
    { role: "close" },
    { type: "separator" },
    { role: "toggleFullScreen" },
    { type: "separator" },
    { role: "bringAllToFront" }
  ];

  if (windows.size > 0) {
    items.push({ type: "separator" });
  }

  for (const ctx of windows) {
    const pathLabel = ctx.filePath ? ` — ${ctx.filePath}` : "";
    items.push({
      label: `${basename(ctx.filePath || "Untitled")}${pathLabel}`,
      action: "focus-window",
      data: { windowId: ctx.window.id },
      checked: activeContext?.window.id === ctx.window.id
    });
  }

  return items;
}

function buildRecentMenuItems(): any[] {
  const recent = appState.recentFiles.filter((path) => existsSync(path)).slice(0, RECENTS_LIMIT);

  if (recent.length === 0) {
    return [{ label: "No Recent Files", enabled: false }];
  }

  return recent.map((path) => ({
    label: path,
    action: "open-recent",
    data: { path }
  }));
}

function rebuildApplicationMenu(): void {
  ApplicationMenu.setApplicationMenu([
    {
      label: APP_NAME,
      submenu: [
        { role: "about" },
        { type: "separator" },
        {
          label: "Settings…",
          action: "settings",
          accelerator: "CommandOrControl+,"
        },
        { type: "separator" },
        { role: "quit", accelerator: "CommandOrControl+Q" }
      ]
    },
    {
      label: "File",
      submenu: [
        { label: "Open…", action: "open-file", accelerator: "CommandOrControl+O" },
        { label: "Open Recent", submenu: buildRecentMenuItems() },
        { type: "separator" },
        { label: "Refresh", action: "refresh", accelerator: "CommandOrControl+R" }
      ]
    },
    {
      label: "Window",
      submenu: buildWindowMenuItems()
    }
  ]);
}

function nextWindowFrame(): WindowFrame {
  if (windows.size === 0) {
    return appState.lastWindowFrame ? { ...appState.lastWindowFrame } : { ...DEFAULT_FRAME };
  }

  const source = activeContext?.frame ?? [...windows][windows.size - 1]?.frame ?? DEFAULT_FRAME;
  return {
    x: source.x + WINDOW_OFFSET,
    y: source.y + WINDOW_OFFSET,
    width: source.width,
    height: source.height
  };
}

function createViewerWindow(initialPath?: string): WindowContext {
  const loaded = loadConfig();
  globalConfig = loaded.config;

  const startPath = initialPath ? canonicalFilePath(initialPath) : pickInitialFilePath();
  const frame = nextWindowFrame();

  let context: WindowContext;

  const rpc = BrowserView.defineRPC<MainViewerRPC>({
    maxRequestTime: 10000,
    handlers: {
      requests: {
        getInitialState: () => buildState(context.filePath, context.config, loaded.warning),
        pickAndOpenFile: async () => {
          await openFileFlow(context);
        },
        reloadCurrentFile: () => {
          context.window.webview.rpc?.send.manualRefreshStart({});
          setTimeout(() => {
            sendUpdate(context);
          }, REFRESH_VISUAL_DELAY_MS);
        },
        openSourceWindow: () => {
          openSourceWindow(context);
        },
        openInEditor: () => {
          openCurrentFileInEditor(context);
        },
        openLocalLink: ({ href, fromFilePath }: { href: string; fromFilePath: string | null }) => {
          const filePath = resolveLinkedFile(href, fromFilePath);
          if (!existsSync(filePath)) {
            context.window.webview.rpc?.send.warning({
              message: `Local link target does not exist: ${filePath}`
            });
            return;
          }
          if (!isMarkdownPath(filePath)) {
            const opened = Utils.openPath(filePath);
            if (!opened) {
              context.window.webview.rpc?.send.warning({
                message: `Could not open file with system default app: ${filePath}`
              });
            }
            return;
          }
          openPathInExistingOrNewWindow(filePath);
        },
        openExternalLink: ({ href }: { href: string }) => {
          const opened = Utils.openExternal(href);
          if (!opened) {
            context.window.webview.rpc?.send.warning({ message: `Failed to open link: ${href}` });
          }
        }
      },
      messages: {}
    }
  });

  const window = new BrowserWindow({
    title: APP_NAME,
    url: "views://mainview/index.html",
    frame,
    rpc
  });

  context = {
    window,
    watcher: null,
    debounceTimer: null,
    filePath: startPath,
    config: globalConfig,
    frame: { ...frame }
  };

  windows.add(context);
  activeContext = context;

  if (startPath) {
    registerRecentFile(startPath);
    updateWindowTitle(context, readMarkdownFile(startPath).content);
  } else {
    updateWindowTitle(context);
  }

  setWatcher(context);
  rebuildApplicationMenu();

  window.on("focus", () => {
    activeContext = context;
    rebuildApplicationMenu();
  });

  window.on("move", (event: any) => {
    const data = event?.data;
    if (typeof data?.x === "number") {
      context.frame.x = data.x;
    }
    if (typeof data?.y === "number") {
      context.frame.y = data.y;
    }
    appState = { ...appState, lastWindowFrame: { ...context.frame } };
    saveAppState(appState);
  });

  window.on("resize", (event: any) => {
    const data = event?.data;
    if (typeof data?.x === "number") {
      context.frame.x = data.x;
    }
    if (typeof data?.y === "number") {
      context.frame.y = data.y;
    }
    if (typeof data?.width === "number") {
      context.frame.width = data.width;
    }
    if (typeof data?.height === "number") {
      context.frame.height = data.height;
    }
    appState = { ...appState, lastWindowFrame: { ...context.frame } };
    saveAppState(appState);
  });

  window.on("close", () => {
    context.watcher?.close();
    if (context.debounceTimer) {
      clearTimeout(context.debounceTimer);
    }

    appState = { ...appState, lastWindowFrame: { ...context.frame } };
    saveAppState(appState);

    windows.delete(context);

    if (activeContext === context) {
      activeContext = windows.values().next().value ?? null;
    }

    rebuildApplicationMenu();

    if (windows.size === 0 && !settingsWindow) {
      Utils.quit();
    }
  });

  return context;
}

function openPathInExistingOrNewWindow(filePath: string): void {
  const normalized = canonicalFilePath(filePath);
  const existing = findOpenWindowByFilePath(normalized);
  if (existing) {
    activeContext = existing;
    registerRecentFile(normalized);
    existing.window.focus();
    rebuildApplicationMenu();
    return;
  }

  const reusable = [...windows].find((ctx) => !ctx.filePath);
  if (reusable) {
    reusable.filePath = normalized;
    activeContext = reusable;
    registerRecentFile(normalized);
    setWatcher(reusable);
    sendUpdate(reusable);
    reusable.window.focus();
    rebuildApplicationMenu();
    return;
  }

  createViewerWindow(normalized);
}

function maybeHandleOpenUrl(url: string): void {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "file:") {
      handledStartupFileOpen = true;
      if (startupWindowTimer) {
        clearTimeout(startupWindowTimer);
        startupWindowTimer = null;
      }
      openPathInExistingOrNewWindow(decodeURIComponent(parsed.pathname));
      return;
    }

    if (parsed.protocol === "markdownviewer:" && parsed.searchParams.has("path")) {
      handledStartupFileOpen = true;
      if (startupWindowTimer) {
        clearTimeout(startupWindowTimer);
        startupWindowTimer = null;
      }
      openPathInExistingOrNewWindow(parsed.searchParams.get("path") ?? "");
    }
  } catch {
    // ignore malformed URLs
  }
}

function installMenuHandlers(): void {
  Electrobun.events.on("application-menu-clicked", (event: any) => {
    const action = String(event?.data?.action || "");
    const payload = (event?.data?.data || {}) as Record<string, unknown>;
    const target = menuTarget();

    if (action === "settings") {
      openSettingsWindow();
      return;
    }

    if (action === "open-recent") {
      const path = typeof payload["path"] === "string" ? payload["path"] : "";
      if (path) {
        openPathInExistingOrNewWindow(path);
      }
      return;
    }

    if (action === "focus-window") {
      const windowId = typeof payload["windowId"] === "number" ? payload["windowId"] : -1;
      const ctx = findWindowById(windowId);
      if (ctx) {
        activeContext = ctx;
        ctx.window.focus();
        rebuildApplicationMenu();
      }
      return;
    }

    if (!target) {
      return;
    }

    if (action === "open-file") {
      void openFileFlow(target);
      return;
    }

    if (action === "refresh") {
      target.window.webview.rpc?.send.manualRefreshStart({});
      setTimeout(() => {
        sendUpdate(target);
      }, REFRESH_VISUAL_DELAY_MS);
      return;
    }

    if (action === "view-source") {
      openSourceWindow(target);
    }
  });
}

rebuildApplicationMenu();
installMenuHandlers();

Electrobun.events.on("open-url", (event) => {
  maybeHandleOpenUrl(event.data.url);
});

const argvPath = pickInitialFilePath();
if (argvPath) {
  handledStartupFileOpen = true;
  createViewerWindow(argvPath);
} else {
  startupWindowTimer = setTimeout(() => {
    if (!handledStartupFileOpen && windows.size === 0) {
      createViewerWindow();
    }
  }, 320);
}
