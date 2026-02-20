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
import type { MainViewerRPC, ViewerConfig } from "../shared/rpc";

hljs.registerLanguage("typescript", ts);
hljs.registerLanguage("javascript", js);
hljs.registerLanguage("json", json);
hljs.registerLanguage("bash", bash);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("markdown", markdown);

const rpc = Electroview.defineRPC<MainViewerRPC>({
  maxRequestTime: 10000,
  handlers: {
    requests: {},
    messages: {
      fileUpdated: ({ content, filePath }: { content: string; filePath: string }) => {
        appState.content = content;
        appState.filePath = filePath;
        render();
      },
      warning: ({ message }: { message: string }) => {
        showWarning(message);
      },
      configUpdated: ({ config }: { config: ViewerConfig }) => {
        appState.config = config;
        applyConfig(config);
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
  .use(markdownItAnchor);

const appState: {
  filePath: string | null;
  content: string;
  config: ViewerConfig;
} = {
  filePath: null,
  content: "",
  config: {
    refreshDebounceMs: 220,
    openExternalLinksInBrowser: true,
    openLocalLinksInApp: true,
    zoomPercent: 100,
    sourceVisibleByDefault: false,
    showOutlineByDefault: true
  }
};

const elements = {
  preview: document.getElementById("preview") as HTMLElement,
  outlineNav: document.getElementById("outlineNav") as HTMLElement,
  outlinePanel: document.getElementById("outlinePanel") as HTMLElement,
  warningBanner: document.getElementById("warningBanner") as HTMLElement,
  collapseSidebarBtn: document.getElementById("collapseSidebarBtn") as HTMLButtonElement,
  sourceBtn: document.getElementById("sourceBtn") as HTMLButtonElement
};

function escapeHtml(raw: string): string {
  return raw
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function showWarning(message: string): void {
  elements.warningBanner.textContent = message;
  elements.warningBanner.classList.remove("hidden");
}

function clearWarning(): void {
  elements.warningBanner.textContent = "";
  elements.warningBanner.classList.add("hidden");
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
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

function applyConfig(config: ViewerConfig): void {
  const scale = Math.max(0.5, Math.min(2, config.zoomPercent / 100));
  document.documentElement.style.fontSize = `${scale}rem`;
  elements.outlinePanel.classList.toggle("hidden", !config.showOutlineByDefault);
}

function bindUiControls(): void {
  elements.collapseSidebarBtn.addEventListener("click", () => {
    elements.outlinePanel.classList.toggle("collapsed");
  });

  elements.sourceBtn.addEventListener("click", async () => {
    await rpc.request.openSourceWindow({});
  });
}

function splitFrontMatter(raw: string): { frontMatter: string | null; markdownBody: string } {
  const normalized = raw.replaceAll("\r\n", "\n");
  if (!(normalized.startsWith("---\n") || normalized.startsWith("+++\n"))) {
    return { frontMatter: null, markdownBody: raw };
  }

  const delimiter = normalized.startsWith("---\n") ? "---" : "+++";
  const endToken = `\n${delimiter}\n`;
  const endIndex = normalized.indexOf(endToken, delimiter.length + 1);

  if (endIndex === -1) {
    return { frontMatter: null, markdownBody: raw };
  }

  const frontMatter = normalized.slice(delimiter.length + 1, endIndex).trim();
  const markdownBody = normalized.slice(endIndex + endToken.length);
  return { frontMatter, markdownBody };
}

type FrontMatterRow = {
  key: string;
  value: string;
  level: number;
};

function parseFrontMatterRows(frontMatter: string): FrontMatterRow[] {
  const rows: FrontMatterRow[] = [];
  for (const line of frontMatter.split("\n")) {
    if (!line.trim()) {
      continue;
    }

    const indent = (line.match(/^(\s*)/)?.[1].length ?? 0);
    const level = Math.floor(indent / 2);
    const trimmed = line.trim();

    if (trimmed.startsWith("- ")) {
      rows.push({ key: "item", value: trimmed.slice(2).trim(), level });
      continue;
    }

    const colon = trimmed.indexOf(":");
    if (colon === -1) {
      rows.push({ key: "value", value: trimmed, level });
      continue;
    }

    const key = trimmed.slice(0, colon).trim();
    const value = trimmed.slice(colon + 1).trim() || " ";
    rows.push({ key, value, level });
  }
  return rows;
}

function renderFrontMatterPane(frontMatter: string): string {
  const rows = parseFrontMatterRows(frontMatter);
  const items = rows
    .map((row) => {
      return `<div class="fm-row" style="--level:${row.level}"><span class="fm-key">${escapeHtml(row.key)}</span><span class="fm-value">${escapeHtml(row.value)}</span></div>`;
    })
    .join("");

  return `<section class="front-matter-pane is-collapsed" data-frontmatter-pane>
    <button class="fm-toggle" type="button" data-frontmatter-toggle aria-expanded="false">
      <span class="fm-caret">▸</span>
      <span class="fm-head">Front Matter</span>
      <span class="fm-count">${rows.length} properties</span>
    </button>
    <div class="fm-grid" data-frontmatter-content>${items}</div>
  </section>`;
}

function bindFrontMatterToggle(): void {
  const pane = elements.preview.querySelector("[data-frontmatter-pane]") as HTMLElement | null;
  const toggle = elements.preview.querySelector("[data-frontmatter-toggle]") as HTMLButtonElement | null;
  if (!pane || !toggle) {
    return;
  }

  toggle.addEventListener("click", () => {
    const collapsed = pane.classList.toggle("is-collapsed");
    toggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
  });
}

function render(): void {
  clearWarning();

  const content = appState.content || "# Empty file\n\nThis file has no markdown content.";
  const { frontMatter, markdownBody } = splitFrontMatter(content);
  const rendered = md.render(markdownBody || "# Empty file\n\nThis file has no markdown content.");
  const safeHtml = purifier.sanitize(rendered, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ["style", "script", "iframe"],
    ADD_ATTR: ["type", "checked", "disabled", "class", "id", "href", "src"],
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|file):|\/|\.|#)/i
  });

  const frontMatterHtml = frontMatter ? renderFrontMatterPane(frontMatter) : "";
  elements.preview.innerHTML = `${frontMatterHtml}<section class="md-body">${safeHtml}</section>`;

  const bodyRoot = (elements.preview.querySelector(".md-body") as HTMLElement) ?? elements.preview;
  buildOutline(bodyRoot);
  bindPreviewLinks();
  bindFrontMatterToggle();
}

async function loadInitialState(): Promise<void> {
  const state = await rpc.request.getInitialState({});
  appState.filePath = state.filePath;
  appState.content = state.content;
  appState.config = state.config;

  if (state.warning) {
    showWarning(state.warning);
  }

  applyConfig(state.config);
  render();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    bindUiControls();
    void loadInitialState();
  });
} else {
  bindUiControls();
  void loadInitialState();
}
