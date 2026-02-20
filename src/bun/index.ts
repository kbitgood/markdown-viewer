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
  statSync,
  watch,
  writeFileSync
} from "node:fs";
import { homedir } from "node:os";
import { dirname, extname, isAbsolute, join, resolve } from "node:path";
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
const MARKDOWN_EXTENSIONS = new Set([".md", ".markdown", ".mdown", ".mkd"]);

const defaultConfig: ViewerConfig = {
  refreshDebounceMs: 220,
  openExternalLinksInBrowser: true,
  openLocalLinksInApp: true,
  zoomPercent: 100,
  sourceVisibleByDefault: false,
  showOutlineByDefault: true
};

type WindowContext = {
  window: BrowserWindow<any>;
  watcher: FSWatcher | null;
  debounceTimer: ReturnType<typeof setTimeout> | null;
  filePath: string | null;
  config: ViewerConfig;
};

const windows = new Set<WindowContext>();
let activeContext: WindowContext | null = null;
let settingsWindow: BrowserWindow<any> | null = null;
let globalConfig = loadConfig().config;
let startupWindowTimer: ReturnType<typeof setTimeout> | null = null;
let handledStartupFileOpen = false;

function ensureConfigDir(): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
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

  const config: ViewerConfig = {
    refreshDebounceMs: clampNumber(input["refreshDebounceMs"], 50, 5000, defaultConfig.refreshDebounceMs, warnings, "refreshDebounceMs"),
    openExternalLinksInBrowser: toBoolean(input["openExternalLinksInBrowser"], defaultConfig.openExternalLinksInBrowser, warnings, "openExternalLinksInBrowser"),
    openLocalLinksInApp: toBoolean(input["openLocalLinksInApp"], defaultConfig.openLocalLinksInApp, warnings, "openLocalLinksInApp"),
    zoomPercent: clampNumber(input["zoomPercent"], 50, 200, defaultConfig.zoomPercent, warnings, "zoomPercent"),
    sourceVisibleByDefault: false,
    showOutlineByDefault: toBoolean(input["showOutlineByDefault"], defaultConfig.showOutlineByDefault, warnings, "showOutlineByDefault")
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

function readMarkdownFile(filePath: string): { content: string; warning: string | null } {
  try {
    const resolved = normalizeFilePath(filePath);
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

function pickInitialFilePath(): string | null {
  const args = process.argv
    .slice(2)
    .map((part) => normalizeFilePath(part))
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
    return normalizeFilePath(href);
  }

  if (isAbsolute(href)) {
    return href;
  }

  if (!fromFilePath) {
    return resolve(process.cwd(), href);
  }

  return resolve(dirname(fromFilePath), href);
}

async function openFileFlow(context: WindowContext): Promise<void> {
  const picked = await Utils.openFileDialog({
    canChooseFiles: true,
    canChooseDirectory: false,
    allowsMultipleSelection: false,
    allowedFileTypes: "md,markdown,mdown,mkd,txt"
  });

  if (picked.length > 0) {
    context.filePath = normalizeFilePath(picked[0]);
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
      x: 220,
      y: 140
    },
    rpc
  });

  win.on("close", () => {
    // no-op
  });
}

function openSettingsWindow(): void {
  if (settingsWindow) {
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
      x: 260,
      y: 180
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

function installMenu(): void {
  ApplicationMenu.setApplicationMenu([
    {
      label: "File",
      submenu: [
        { label: "Open Markdown…", action: "open-file", accelerator: "CommandOrControl+O" },
        { label: "Refresh", action: "refresh", accelerator: "CommandOrControl+R" },
        { type: "separator" },
        { label: "Close", role: "close", accelerator: "CommandOrControl+W" },
        { label: "Quit", role: "quit", accelerator: "q" }
      ]
    },
    {
      label: "View",
      submenu: [
        { label: "View Source", action: "view-source", accelerator: "CommandOrControl+Shift+S" },
        { label: "Settings", action: "settings", accelerator: "CommandOrControl+," }
      ]
    }
  ]);

  Electrobun.events.on("application-menu-clicked", (event) => {
    const action = String(event.data.action || "");
    const target = menuTarget();

    if (action === "settings") {
      openSettingsWindow();
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
      sendUpdate(target);
      return;
    }

    if (action === "view-source") {
      openSourceWindow(target);
    }
  });
}

function createViewerWindow(initialPath?: string): WindowContext {
  const loaded = loadConfig();
  globalConfig = loaded.config;

  const startPath = initialPath ? normalizeFilePath(initialPath) : pickInitialFilePath();

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
          sendUpdate(context);
        },
        openSourceWindow: () => {
          openSourceWindow(context);
        },
        openLocalLink: ({ href, fromFilePath }: { href: string; fromFilePath: string | null }) => {
          const filePath = resolveLinkedFile(href, fromFilePath);
          if (!existsSync(filePath)) {
            context.window.webview.rpc?.send.warning({
              message: `Local link target does not exist: ${filePath}`
            });
            return;
          }
          context.filePath = filePath;
          setWatcher(context);
          sendUpdate(context);
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
    frame: {
      width: 1360,
      height: 900,
      x: 120,
      y: 80
    },
    rpc
  });

  context = {
    window,
    watcher: null,
    debounceTimer: null,
    filePath: startPath,
    config: globalConfig
  };

  windows.add(context);
  activeContext = context;
  setWatcher(context);

  window.on("close", () => {
    context.watcher?.close();
    if (context.debounceTimer) {
      clearTimeout(context.debounceTimer);
    }
    windows.delete(context);

    if (activeContext === context) {
      activeContext = windows.values().next().value ?? null;
    }

    if (windows.size === 0 && !settingsWindow) {
      Utils.quit();
    }
  });

  return context;
}

function openPathInExistingOrNewWindow(filePath: string): void {
  const normalized = normalizeFilePath(filePath);
  const reusable = [...windows].find((ctx) => !ctx.filePath);
  if (reusable) {
    reusable.filePath = normalized;
    activeContext = reusable;
    setWatcher(reusable);
    sendUpdate(reusable);
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

installMenu();

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
