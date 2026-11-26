import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

// OpenCode merges the plugin arrays of every configuration that applies to a
// location: the global file plus each project file between the working
// directory and the repository root. This module reads those files without
// interpreting anything else, so the diagnostic can report the truth for a
// project-local install instead of checking the global file only.

export interface ConfigPlugins {
  file: string;
  plugins: string[];
}

export interface ConfigReadResult {
  plugins?: ConfigPlugins;
  error?: string;
}

const PROJECT_FILES = ['opencode.json', 'opencode.jsonc'] as const;

// Removes // and /* */ comments and trailing commas. OpenCode accepts JSONC for
// its configuration; a diagnostic that rejected comments would report a false
// failure on a perfectly valid file.
export function stripJsonc(text: string): string {
  let out = '';
  let inString = false;
  let inLine = false;
  let inBlock = false;
  for (let i = 0; i < text.length; ++i) {
    const c = text[i];
    const next = text[i + 1];
    if (inLine) {
      if (c === '\n') {
        inLine = false;
        out += c;
      }
      continue;
    }
    if (inBlock) {
      if (c === '*' && next === '/') {
        inBlock = false;
        ++i;
      }
      continue;
    }
    if (inString) {
      out += c;
      if (c === '\\') {
        out += next ?? '';
        ++i;
      } else if (c === '"') {
        inString = false;
      }
      continue;
    }
    if (c === '"') {
      inString = true;
      out += c;
      continue;
    }
    if (c === '/' && next === '/') {
      inLine = true;
      ++i;
      continue;
    }
    if (c === '/' && next === '*') {
      inBlock = true;
      ++i;
      continue;
    }
    out += c;
  }
  return out.replace(/,(\s*[}\]])/g, '$1');
}

// Nearest first, up to and including the directory that holds `.git`. A file
// above the repository root belongs to another project and is never returned.
export function projectConfigFiles(start: string): string[] {
  const files: string[] = [];
  let dir = resolve(start);
  for (;;) {
    for (const name of PROJECT_FILES) {
      const file = join(dir, name);
      if (existsSync(file)) files.push(file);
    }
    if (existsSync(join(dir, '.git'))) break;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return files;
}

function pluginName(entry: unknown): string {
  if (typeof entry === 'string') return entry;
  if (typeof entry === 'object' && entry !== null) {
    const pkg = (entry as { package?: unknown }).package;
    if (typeof pkg === 'string') return pkg;
  }
  return '?';
}

export function readConfigPlugins(file: string): ConfigReadResult {
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch (error) {
    return { error: `not readable: ${(error as Error).message}` };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripJsonc(text));
  } catch (error) {
    return { error: `not valid JSON: ${(error as Error).message}` };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { error: 'configuration must be an object' };
  }
  const record = parsed as Record<string, unknown>;
  const raw = 'plugins' in record ? record['plugins'] : 'plugin' in record ? record['plugin'] : [];
  if (!Array.isArray(raw)) {
    return { error: 'plugins must be an array' };
  }
  return { plugins: { file, plugins: raw.map(pluginName) } };
}

export function findBuddyPlugin(plugins: string[]): string | undefined {
  return plugins.find((entry) => entry.includes('opencode-buddy'));
}

// Global first, then the project files, without duplicates and without
// inventing a file that does not exist.
export function applicableConfigFiles(globalFile: string, start: string): string[] {
  const files: string[] = [];
  for (const file of [globalFile, ...projectConfigFiles(start)]) {
    if (!existsSync(file) || files.includes(file)) continue;
    files.push(file);
  }
  return files;
}
