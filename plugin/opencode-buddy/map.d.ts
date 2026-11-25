export type ToolCategory = 'read' | 'edit' | 'shell' | 'search' | 'mcp' | 'other';

export interface Projector {
  project(event: unknown): unknown[];
  takeMcp(): unknown | null;
  seedMcp(servers: readonly unknown[]): void;
  reset(): void;
}

export declare const MAX_SESSION_ID: number;
export declare const MAX_TOOL_ID: number;
export declare const MAX_MODEL: number;
export declare const MAX_AGENT: number;
export declare const MAX_SERVERS: number;

export declare function categoryFor(name: unknown): ToolCategory;
export declare function createProjector(): Projector;
export declare function projectSessionSnapshot(session: unknown): unknown[];
