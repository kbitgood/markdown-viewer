import type { RPCSchema } from "electrobun";

export type ViewerConfig = {
  refreshDebounceMs: number;
  openExternalLinksInBrowser: boolean;
  openLocalLinksInApp: boolean;
  zoomPercent: number;
  editorAppPath: string;
  sourceVisibleByDefault: boolean;
  showOutlineByDefault: boolean;
};

export type ViewState = {
  filePath: string | null;
  content: string;
  warning: string | null;
  config: ViewerConfig;
  updatedAt: number;
};

export type MainViewerRPC = {
  bun: RPCSchema<{
    requests: {
      getInitialState: { params: {}; response: ViewState };
      pickAndOpenFile: { params: {}; response: void };
      reloadCurrentFile: { params: {}; response: void };
      openSourceWindow: { params: {}; response: void };
      openInEditor: { params: {}; response: void };
      openLocalLink: { params: { href: string; fromFilePath: string | null }; response: void };
      openExternalLink: { params: { href: string }; response: void };
    };
    messages: {};
  }>;
  webview: RPCSchema<{
    requests: {};
    messages: {
      fileUpdated: { content: string; filePath: string; updatedAt: number };
      warning: { message: string };
      configUpdated: { config: ViewerConfig };
      manualRefreshStart: {};
    };
  }>;
};

export type SettingsRPC = {
  bun: RPCSchema<{
    requests: {
      getSettingsState: { params: {}; response: ViewerConfig };
      saveSettings: { params: ViewerConfig; response: ViewerConfig };
    };
    messages: {};
  }>;
  webview: RPCSchema<{
    requests: {};
    messages: {
      configUpdated: { config: ViewerConfig };
      status: { message: string };
    };
  }>;
};

export type SourceRPC = {
  bun: RPCSchema<{
    requests: {
      getSourceState: {
        params: {};
        response: { filePath: string | null; content: string; updatedAt: number };
      };
    };
    messages: {};
  }>;
  webview: RPCSchema<{
    requests: {};
    messages: {};
  }>;
};
