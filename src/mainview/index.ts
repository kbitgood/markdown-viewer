import Electrobun, { Electroview } from "electrobun/view";
import MarkdownIt from "markdown-it";
import markdownItAnchor from "markdown-it-anchor";
import markdownItTaskLists from "markdown-it-task-lists";
import hljs from "highlight.js/lib/core";
import ts from "highlight.js/lib/languages/typescript";
import js from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import bash from "highlight.js/lib/languages/bash";
import xml from "highlight.js/lib/languages/xml";
import markdown from "highlight.js/lib/languages/markdown";
import createDOMPurify from "dompurify";
import type { ViewerConfig, ViewerRPC } from "../shared/rpc";

hljs.registerLanguage("typescript", ts);
hljs.registerLanguage("javascript", js);
hljs.registerLanguage("json", json);
hljs.registerLanguage("bash", bash);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("markdown", markdown);

const rpc = Electroview.defineRPC<ViewerRPC>({
  maxRequestTime: 10000,
  handlers: {
    requests: {},
    messages: {
      fileUpdated: ({
        content,
        filePath,
        updatedAt
      }: {
        content: string;
        filePath: string;
        updatedAt: number;
      }) => {
        appState.content = content;
        appState.filePath = filePath;
        appState.updatedAt = updatedAt;
        render();
        flashStatus("Updated", `Rendered changes from ${prettyTime(updatedAt)}`);
      },
      warning: ({ message }: { message: string }) => {
        showWarning(message);
      },
      configUpdated: ({ config }: { config: ViewerConfig }) => {
        appState.config = config;
        applyConfigToControls(config);
        applyConfigToDocument(config);
      }
    }
  }
});

new Electrobun.Electroview({ rpc });

const purifier = createDOMPurify(window);

const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  highlight(code, lang) {
    if (lang && hljs.getLanguage(lang)) {
      return `<pre><code class="hljs language-${lang}">${hljs.highlight(code, { language: lang }).value}</code></pre>`;
    }
    return `<pre><code class="hljs">${escapeHtml(code)}</code></pre>`;
  }
})
  .use(markdownItTaskLists)
  .use(markdownItAnchor, {
    permalink: markdownItAnchor.permalink.headerLink()
  });

const appState: {
  filePath: string | null;
  content: string;
  updatedAt: number;
  config: ViewerConfig;
  sourceVisible: boolean;
  outlineVisible: boolean;
} = {
  filePath: null,
  content: "",
  updatedAt: Date.now(),
  config: {
    refreshDebounceMs: 220,
    openExternalLinksInBrowser: true,
    openLocalLinksInApp: true,
    zoomPercent: 100,
    sourceVisibleByDefault: false,
    showOutlineByDefault: true
  },
  sourceVisible: false,
  outlineVisible: true
};

const elements = {
  preview: document.getElementById("preview") as HTMLElement,
  outlineNav: document.getElementById("outlineNav") as HTMLElement,
  sourcePanel: document.getElementById("sourcePanel") as HTMLElement,
  sourceContent: document.getElementById("sourceContent") as HTMLElement,
  outlinePanel: document.getElementById("outlinePanel") as HTMLElement,
  warningBanner: document.getElementById("warningBanner") as HTMLElement,
  statusPill: document.getElementById("statusPill") as HTMLElement,
  statusText: document.getElementById("statusText") as HTMLElement,
  filePathLabel: document.getElementById("filePathLabel") as HTMLElement,
  settingsPanel: document.getElementById("settingsPanel") as HTMLElement,
  refreshDebounceInput: document.getElementById("refreshDebounceInput") as HTMLInputElement,
  zoomInput: document.getElementById("zoomInput") as HTMLInputElement,
  externalLinksInput: document.getElementById("externalLinksInput") as HTMLInputElement,
  localLinksInput: document.getElementById("localLinksInput") as HTMLInputElement,
  sourceToggleBtn: document.getElementById("sourceToggleBtn") as HTMLButtonElement,
  outlineToggleBtn: document.getElementById("outlineToggleBtn") as HTMLButtonElement
};

function escapeHtml(raw: string): string {
  return raw
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function prettyTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString();
}

function flashStatus(label: string, detail: string): void {
  elements.statusPill.textContent = label;
  elements.statusText.textContent = detail;
}

function showWarning(message: string): void {
  elements.warningBanner.textContent = message;
  elements.warningBanner.classList.remove("hidden");
}

function clearWarning(): void {
  elements.warningBanner.textContent = "";
  elements.warningBanner.classList.add("hidden");
}

function buildOutline(root: HTMLElement): void {
  const headings = Array.from(root.querySelectorAll("h1, h2, h3, h4, h5, h6"));
  elements.outlineNav.innerHTML = "";

  if (!headings.length) {
    const empty = document.createElement("p");
    empty.textContent = "No headings found";
    empty.style.color = "#6e7469";
    empty.style.fontSize = "0.86rem";
    elements.outlineNav.append(empty);
    return;
  }

  for (const heading of headings) {
    if (!heading.id) {
      heading.id = slugify(heading.textContent ?? "section");
    }

    const link = document.createElement("a");
    link.href = `#${heading.id}`;
    link.textContent = heading.textContent || "Untitled";
    const level = Number(heading.tagName.charAt(1));
    link.style.marginLeft = `${Math.max(0, level - 1) * 10}px`;
    link.addEventListener("click", (event) => {
      event.preventDefault();
      heading.scrollIntoView({ behavior: "smooth", block: "start" });
      history.replaceState(null, "", `#${heading.id}`);
    });
    elements.outlineNav.append(link);
  }
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function applyConfigToControls(config: ViewerConfig): void {
  elements.refreshDebounceInput.value = String(config.refreshDebounceMs);
  elements.zoomInput.value = String(config.zoomPercent);
  elements.externalLinksInput.checked = config.openExternalLinksInBrowser;
  elements.localLinksInput.checked = config.openLocalLinksInApp;
}

function applyConfigToDocument(config: ViewerConfig): void {
  const scale = Math.max(0.5, Math.min(2, config.zoomPercent / 100));
  document.documentElement.style.fontSize = `${scale}rem`;
}

function setSourceVisibility(visible: boolean, persist = false): void {
  appState.sourceVisible = visible;
  elements.sourcePanel.classList.toggle("hidden", !visible);
  elements.sourceToggleBtn.classList.toggle("ghost", !visible);
  if (persist) {
    void rpc.request.toggleSourcePreference({ visible });
  }
}

function setOutlineVisibility(visible: boolean, persist = false): void {
  appState.outlineVisible = visible;
  elements.outlinePanel.classList.toggle("hidden", !visible);
  elements.outlineToggleBtn.classList.toggle("ghost", !visible);
  if (persist) {
    void rpc.request.toggleOutlinePreference({ visible });
  }
}

function render(): void {
  clearWarning();

  const rendered = md.render(appState.content || "# Empty file\n\nThis file has no markdown content.");
  const safeHtml = purifier.sanitize(rendered, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ["style", "script", "iframe"],
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|file):|\/|\.|#)/i
  });

  elements.preview.innerHTML = safeHtml;
  elements.sourceContent.textContent = appState.content;
  elements.filePathLabel.textContent = appState.filePath ?? "No file loaded";

  buildOutline(elements.preview);
  bindPreviewLinks();
}

function resolveRelativeHref(href: string, fromFilePath: string | null): string {
  if (href.startsWith("file://")) {
    return decodeURIComponent(href.replace("file://", ""));
  }

  if (!fromFilePath) {
    return href;
  }

  if (href.startsWith("/")) {
    return href;
  }

  const baseUrl = new URL(`file://${fromFilePath}`);
  const resolved = new URL(href, baseUrl);
  return decodeURIComponent(resolved.pathname);
}

function bindPreviewLinks(): void {
  const anchors = Array.from(elements.preview.querySelectorAll("a"));
  for (const anchor of anchors) {
    const href = anchor.getAttribute("href") ?? "";

    anchor.addEventListener("click", async (event) => {
      if (!href) {
        return;
      }

      if (href.startsWith("#")) {
        event.preventDefault();
        const target = elements.preview.querySelector(href);
        if (target instanceof HTMLElement) {
          target.scrollIntoView({ behavior: "smooth", block: "start" });
        }
        return;
      }

      if (/^https?:\/\//i.test(href)) {
        if (appState.config.openExternalLinksInBrowser) {
          event.preventDefault();
          await rpc.request.openExternalLink({ href });
        }
        return;
      }

      if (appState.config.openLocalLinksInApp) {
        event.preventDefault();
        const absolute = resolveRelativeHref(href, appState.filePath);
        await rpc.request.openLocalLink({ href: absolute, fromFilePath: appState.filePath });
      }
    });
  }
}

async function loadInitialState(): Promise<void> {
  const state = await rpc.request.getInitialState({});
  appState.filePath = state.filePath;
  appState.content = state.content;
  appState.updatedAt = state.updatedAt;
  appState.config = state.config;

  if (state.warning) {
    showWarning(state.warning);
  }

  appState.sourceVisible = state.config.sourceVisibleByDefault;
  appState.outlineVisible = state.config.showOutlineByDefault;

  applyConfigToControls(state.config);
  applyConfigToDocument(state.config);
  setSourceVisibility(appState.sourceVisible, false);
  setOutlineVisibility(appState.outlineVisible, false);

  render();
}

function bindControls(): void {
  document.getElementById("openFileBtn")?.addEventListener("click", async () => {
    await rpc.request.pickAndOpenFile({});
  });

  document.getElementById("refreshBtn")?.addEventListener("click", async () => {
    await rpc.request.reloadCurrentFile({});
  });

  elements.sourceToggleBtn.addEventListener("click", () => {
    setSourceVisibility(!appState.sourceVisible, true);
  });

  elements.outlineToggleBtn.addEventListener("click", () => {
    setOutlineVisibility(!appState.outlineVisible, true);
  });

  document.getElementById("settingsToggleBtn")?.addEventListener("click", () => {
    elements.settingsPanel.classList.toggle("hidden");
  });

  elements.refreshDebounceInput.addEventListener("change", async () => {
    const debounce = Number(elements.refreshDebounceInput.value);
    if (Number.isFinite(debounce)) {
      await rpc.request.updateConfig({ refreshDebounceMs: debounce });
      flashStatus("Saved", "Refresh debounce updated");
    }
  });

  elements.zoomInput.addEventListener("change", async () => {
    const zoomPercent = Number(elements.zoomInput.value);
    if (Number.isFinite(zoomPercent)) {
      await rpc.request.updateConfig({ zoomPercent });
      flashStatus("Saved", "Zoom updated");
    }
  });

  elements.externalLinksInput.addEventListener("change", async () => {
    await rpc.request.updateConfig({
      openExternalLinksInBrowser: elements.externalLinksInput.checked
    });
  });

  elements.localLinksInput.addEventListener("change", async () => {
    await rpc.request.updateConfig({
      openLocalLinksInApp: elements.localLinksInput.checked
    });
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", async () => {
    bindControls();
    await loadInitialState();
  });
} else {
  bindControls();
  void loadInitialState();
}
