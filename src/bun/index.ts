import Electrobun, { BrowserView, BrowserWindow, Utils } from "electrobun/bun";
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
import type { ViewerConfig, ViewState, ViewerRPC } from "../shared/rpc";

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

function ensureConfigDir(): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
}

function sanitizeConfig(raw: unknown): { config: ViewerConfig; warning: string | null } {
  const warnings: string[] = [];
  const input = typeof raw === "object" && raw ? (raw as Record<string, unknown>) : {};

  const config: ViewerConfig = {
    refreshDebounceMs: clampNumber(input["refreshDebounceMs"], 50, 5000, defaultConfig.refreshDebounceMs, warnings, "refreshDebounceMs"),
    openExternalLinksInBrowser: toBoolean(input["openExternalLinksInBrowser"], defaultConfig.openExternalLinksInBrowser, warnings, "openExternalLinksInBrowser"),
    openLocalLinksInApp: toBoolean(input["openLocalLinksInApp"], defaultConfig.openLocalLinksInApp, warnings, "openLocalLinksInApp"),
    zoomPercent: clampNumber(input["zoomPercent"], 50, 200, defaultConfig.zoomPercent, warnings, "zoomPercent"),
    sourceVisibleByDefault: toBoolean(input["sourceVisibleByDefault"], defaultConfig.sourceVisibleByDefault, warnings, "sourceVisibleByDefault"),
    showOutlineByDefault: toBoolean(input["showOutlineByDefault"], defaultConfig.showOutlineByDefault, warnings, "showOutlineByDefault")
  };

  return {
    config,
    warning: warnings.length ? `Invalid config keys reset to defaults: ${warnings.join(", ")}` : null
  };
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
  const args = process.argv.slice(2)
    .map((part) => normalizeFilePath(part))
    .filter((part) => !part.endsWith("main.js") && existsSync(part));

  if (args.length > 0) {
    return args[0];
  }

  return null;
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

function buildState(filePath: string | null, config: ViewerConfig, warning: string | null): ViewState {
  if (!filePath) {
    return {
      filePath: null,
      content:
        "# Welcome\n\nUse **Open File** to load a markdown document.\n\n## Finder Integration\n\nTo enable double-click open for `.md` files in packaged builds:\n\n1. Run `bun run build`\n2. Run `bun run postbuild:mac`\n3. In Finder, use **Get Info -> Open with -> Markdown Viewer** and click **Change All**.",
      warning:
        warning ??
        "If Finder double-click does not open this app yet, run `bun run postbuild:mac` and set the default app in Finder.",
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

function createViewerWindow(initialPath?: string): WindowContext {
  const loadedConfig = loadConfig();
  const contextConfig = loadedConfig.config;
  const startPath = initialPath ? normalizeFilePath(initialPath) : pickInitialFilePath();

  const rpc = BrowserView.defineRPC<ViewerRPC>({
    maxRequestTime: 10000,
    handlers: {
      requests: {
        getInitialState: () => {
          const state = buildState(context.filePath, context.config, loadedConfig.warning);
          return state;
        },
        pickAndOpenFile: async () => {
          const picked = await Utils.openFileDialog({
            canChooseFiles: true,
            canChooseDirectory: false,
            allowsMultipleSelection: false,
            allowedFileTypes: "md,markdown,mdown,mkd,txt"
          });
          if (picked.length > 0) {
            context.filePath = normalizeFilePath(picked[0]);
            setWatcher(context);
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
        },
        reloadCurrentFile: () => {
          if (!context.filePath) {
            context.window.webview.rpc?.send.warning({ message: "No file loaded." });
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
        },
        openLocalLink: ({
          href,
          fromFilePath
        }: {
          href: string;
          fromFilePath: string | null;
        }) => {
          const filePath = resolveLinkedFile(href, fromFilePath);
          if (!existsSync(filePath)) {
            context.window.webview.rpc?.send.warning({
              message: `Local link target does not exist: ${filePath}`
            });
            return;
          }

          context.filePath = filePath;
          setWatcher(context);

          const read = readMarkdownFile(filePath);
          context.window.webview.rpc?.send.fileUpdated({
            content: read.content,
            filePath,
            updatedAt: Date.now()
          });
          if (read.warning) {
            context.window.webview.rpc?.send.warning({ message: read.warning });
          }
        },
        openExternalLink: ({ href }: { href: string }) => {
          const opened = Utils.openExternal(href);
          if (!opened) {
            context.window.webview.rpc?.send.warning({
              message: `Failed to open link: ${href}`
            });
          }
        },
        updateConfig: (partial: Partial<ViewerConfig>) => {
          const merged = { ...context.config, ...partial };
          const validated = sanitizeConfig(merged).config;
          context.config = validated;
          writeConfig(validated);
          setWatcher(context);
          context.window.webview.rpc?.send.configUpdated({ config: validated });
        },
        toggleSourcePreference: ({ visible }: { visible: boolean }) => {
          context.config = { ...context.config, sourceVisibleByDefault: visible };
          writeConfig(context.config);
          context.window.webview.rpc?.send.configUpdated({ config: context.config });
        },
        toggleOutlinePreference: ({ visible }: { visible: boolean }) => {
          context.config = { ...context.config, showOutlineByDefault: visible };
          writeConfig(context.config);
          context.window.webview.rpc?.send.configUpdated({ config: context.config });
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

  const context: WindowContext = {
    window,
    watcher: null,
    debounceTimer: null,
    filePath: startPath,
    config: contextConfig
  };

  windows.add(context);
  setWatcher(context);

  window.on("close", () => {
    context.watcher?.close();
    if (context.debounceTimer) {
      clearTimeout(context.debounceTimer);
    }
    windows.delete(context);
    if (windows.size === 0) {
      Utils.quit();
    }
  });

  return context;
}

function maybeHandleOpenUrl(url: string): void {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "file:") {
      createViewerWindow(decodeURIComponent(parsed.pathname));
      return;
    }

    if (parsed.protocol === "markdownviewer:" && parsed.searchParams.has("path")) {
      createViewerWindow(parsed.searchParams.get("path") ?? undefined);
    }
  } catch {
    // ignore malformed URLs
  }
}

Electrobun.events.on("open-url", (event) => {
  maybeHandleOpenUrl(event.data.url);
});

createViewerWindow();
