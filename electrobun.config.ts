import type { ElectrobunConfig } from "electrobun";

export default {
  app: {
    name: "Markdown Viewer",
    identifier: "dev.kbitgood.markdownviewer",
    version: "0.1.0",
    description: "Configurable standalone Markdown viewer",
    urlSchemes: ["markdownviewer"]
  },
  build: {
    bun: {
      entrypoint: "src/bun/index.ts"
    },
    views: {
      mainview: {
        entrypoint: "src/mainview/index.ts"
      }
    },
    copy: {
      "src/mainview/index.html": "views/mainview/index.html",
      "src/mainview/index.css": "views/mainview/index.css"
    },
    buildFolder: "build",
    artifactFolder: "artifacts",
    mac: {
      bundleCEF: false
    },
    linux: {
      bundleCEF: false
    },
    win: {
      bundleCEF: false
    }
  }
} satisfies ElectrobunConfig;
