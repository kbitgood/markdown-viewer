declare module "electrobun/bun" {
  const Electrobun: {
    events: {
      on(eventName: string, callback: (event: any) => void): void;
    };
  };

  export default Electrobun;

  export class BrowserView {
    static defineRPC<T>(config: any): any;
  }

  export class BrowserWindow<T = any> {
    webview: {
      rpc?: {
        send: any;
      };
    };
    constructor(config: any);
    on(eventName: string, callback: () => void): void;
    focus(): void;
  }

  export const Utils: {
    quit(): void;
    openFileDialog(config?: any): Promise<string[]>;
    openExternal(url: string): boolean;
  };

  export const ApplicationMenu: {
    setApplicationMenu(menu: any[]): void;
  };
}
