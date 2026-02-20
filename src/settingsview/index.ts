import Electrobun, { Electroview } from "electrobun/view";
import type { SettingsRPC, ViewerConfig } from "../shared/rpc";

const rpc = Electroview.defineRPC<SettingsRPC>({
  maxRequestTime: 10000,
  handlers: {
    requests: {},
    messages: {
      configUpdated: ({ config }: { config: ViewerConfig }) => {
        applyConfig(config);
      },
      status: ({ message }: { message: string }) => {
        setStatus(message);
      }
    }
  }
});

new Electrobun.Electroview({ rpc });

const form = document.getElementById("settingsForm") as HTMLFormElement;
const refreshDebounce = document.getElementById("refreshDebounce") as HTMLInputElement;
const zoomPercent = document.getElementById("zoomPercent") as HTMLInputElement;
const openExternalLinks = document.getElementById("openExternalLinks") as HTMLInputElement;
const openLocalLinks = document.getElementById("openLocalLinks") as HTMLInputElement;
const showOutline = document.getElementById("showOutline") as HTMLInputElement;
const status = document.getElementById("status") as HTMLParagraphElement;

function setStatus(message: string): void {
  status.textContent = message;
}

function applyConfig(config: ViewerConfig): void {
  refreshDebounce.value = String(config.refreshDebounceMs);
  zoomPercent.value = String(config.zoomPercent);
  openExternalLinks.checked = config.openExternalLinksInBrowser;
  openLocalLinks.checked = config.openLocalLinksInApp;
  showOutline.checked = config.showOutlineByDefault;
}

async function loadSettings(): Promise<void> {
  const config = await rpc.request.getSettingsState({});
  applyConfig(config);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const payload: ViewerConfig = {
    refreshDebounceMs: Number(refreshDebounce.value),
    zoomPercent: Number(zoomPercent.value),
    openExternalLinksInBrowser: openExternalLinks.checked,
    openLocalLinksInApp: openLocalLinks.checked,
    showOutlineByDefault: showOutline.checked,
    sourceVisibleByDefault: false
  };

  await rpc.request.saveSettings(payload);
  setStatus("Saved");
});

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    void loadSettings();
  });
} else {
  void loadSettings();
}
