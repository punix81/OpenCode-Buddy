export interface IpcPaths {
  dir: string;
  socket: string;
  tokenFile: string;
}

export declare const PLUGIN_ID: string;
export declare const PLUGIN_VERSION: string;
export declare const IPC_VERSION: number;

export declare function ipcPaths(env?: NodeJS.ProcessEnv): IpcPaths;

declare const plugin: {
  id: string;
  setup(context: unknown): Promise<() => void>;
};

export default plugin;
