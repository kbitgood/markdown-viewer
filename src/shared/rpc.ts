import type { RPCSchema } from "electrobun";

export type ViewerConfig = {
  refreshDebounceMs: number;
  openExternalLinksInBrowser: boolean;
  openLocalLinksInApp: boolean;
  zoomPercent: number;
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

export type ViewerRPC = {
  bun: RPCSchema<{
    requests: {
      getInitialState: { params: {}; response: ViewState };
      pickAndOpenFile: { params: {}; response: void };
      reloadCurrentFile: { params: {}; response: void };
      openLocalLink: { params: { href: string; fromFilePath: string | null }; response: void };
      openExternalLink: { params: { href: string }; response: void };
      updateConfig: { params: Partial<ViewerConfig>; response: void };
      toggleSourcePreference: { params: { visible: boolean }; response: void };
      toggleOutlinePreference: { params: { visible: boolean }; response: void };
    };
    messages: {};
  }>;
  webview: RPCSchema<{
    requests: {};
    messages: {
      fileUpdated: { content: string; filePath: string; updatedAt: number };
      warning: { message: string };
      configUpdated: { config: ViewerConfig };
    };
  }>;
};
