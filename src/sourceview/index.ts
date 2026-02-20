import Electrobun, { Electroview } from "electrobun/view";
import type { SourceRPC } from "../shared/rpc";

const rpc = Electroview.defineRPC<SourceRPC>({
  maxRequestTime: 10000,
  handlers: { requests: {}, messages: {} }
});

new Electrobun.Electroview({ rpc });

async function run(): Promise<void> {
  const state = await rpc.request.getSourceState({});
  const pathEl = document.getElementById("path") as HTMLElement;
  const sourceEl = document.getElementById("source") as HTMLElement;
  pathEl.textContent = state.filePath ?? "No file";
  sourceEl.textContent = state.content;
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    void run();
  });
} else {
  void run();
}
