// Non-destructive OpenCode configuration editing for the Buddy plugin.
//
// The file belongs to the user and may contain JSONC comments, providers, MCP
// servers, skills, agents and other plugins. We therefore edit only the plugin
// array textually instead of rewriting the document from a parsed object.
// Everything here is pure, so the installer and the tests share it.

import { dirname, isAbsolute, resolve } from 'node:path';

export class ConfigEditError extends Error {}

/** Removes comments and trailing commas, without touching string contents. */
export function stripJsonc(text) {
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

export function parseJsonc(text) {
  let value;
  try {
    value = JSON.parse(stripJsonc(text));
  } catch (error) {
    throw new ConfigEditError(`configuration is not valid JSON/JSONC: ${error.message}`);
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ConfigEditError('configuration must be a JSON object');
  }
  return value;
}

function skipTrivia(text, index) {
  let i = index;
  for (;;) {
    while (i < text.length && /\s/.test(text[i])) ++i;
    if (text[i] === '/' && text[i + 1] === '/') {
      i += 2;
      while (i < text.length && text[i] !== '\n') ++i;
      continue;
    }
    if (text[i] === '/' && text[i + 1] === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) ++i;
      i = Math.min(text.length, i + 2);
      continue;
    }
    return i;
  }
}

function readString(text, index) {
  let i = index + 1;
  while (i < text.length) {
    if (text[i] === '\\') {
      i += 2;
      continue;
    }
    if (text[i] === '"') {
      return { end: i + 1, value: JSON.parse(text.slice(index, i + 1)) };
    }
    ++i;
  }
  throw new ConfigEditError('unterminated string');
}

// Finds the top-level "plugins" (or legacy "plugin") array. Returns offsets in
// the original text so an insertion cannot reformat the rest of the file.
export function findPluginArray(text) {
  const keys = new Set(['plugins', 'plugin']);
  let depth = 0;
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === '"') {
      const token = readString(text, i);
      if (depth === 1 && keys.has(token.value)) {
        let j = skipTrivia(text, token.end);
        if (text[j] === ':') {
          j = skipTrivia(text, j + 1);
          if (text[j] === '[') {
            let k = j + 1;
            let nested = 1;
            while (k < text.length) {
              if (text[k] === '"') {
                k = readString(text, k).end;
                continue;
              }
              if (text[k] === '/' && text[k + 1] === '/') {
                k = text.indexOf('\n', k);
                if (k < 0) k = text.length;
                continue;
              }
              if (text[k] === '/' && text[k + 1] === '*') {
                const end = text.indexOf('*/', k + 2);
                k = end < 0 ? text.length : end + 2;
                continue;
              }
              if (text[k] === '[') ++nested;
              else if (text[k] === ']') {
                --nested;
                if (nested === 0) {
                  return { open: j, close: k, key: token.value };
                }
              }
              ++k;
            }
            throw new ConfigEditError('unterminated plugin array');
          }
        }
      }
      i = token.end;
      continue;
    }
    if (c === '{' || c === '[') ++depth;
    else if (c === '}' || c === ']') --depth;
    ++i;
  }
  return null;
}

function lastSignificant(text, start, end) {
  let i = end - 1;
  while (i >= start) {
    if (/\s/.test(text[i])) {
      --i;
      continue;
    }
    if (i > 0 && text[i] === '/' && text[i - 1] === '/') {
      // A line comment before the closing bracket: move to the line start.
      while (i > start && text[i] !== '\n') --i;
      --i;
      continue;
    }
    return i;
  }
  return -1;
}

export function normalizePluginPath(value, base = process.cwd(), platform = process.platform) {
  const resolved = isAbsolute(value) ? resolve(value) : resolve(base, value);
  return platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function entryMatches(entry, pluginPath, configDir) {
  let candidate = null;
  if (typeof entry === 'string') candidate = entry;
  else if (entry && typeof entry === 'object' && typeof entry.package === 'string') candidate = entry.package;
  if (candidate === null) return false;
  const wanted = normalizePluginPath(pluginPath, configDir);
  if (normalizePluginPath(candidate, configDir) === wanted) return true;
  // An absolute entry is compared with the process cwd as well.
  try {
    return normalizePluginPath(candidate) === wanted;
  } catch {
    return false;
  }
}

export function pluginInstalled(text, pluginPath) {
  if (text === '') return false;
  const json = parseJsonc(text);
  const raw = 'plugins' in json ? json.plugins : 'plugin' in json ? json.plugin : [];
  if (!Array.isArray(raw)) throw new ConfigEditError('plugins must be an array');
  return raw.some((entry) => entryMatches(entry, pluginPath, process.cwd()));
}

export function addPlugin(text, pluginPath) {
  const source = text.trim() === '' ? '{}' : text;
  const json = parseJsonc(source);
  const raw = 'plugins' in json ? json.plugins : 'plugin' in json ? json.plugin : [];
  if (!Array.isArray(raw)) throw new ConfigEditError('plugins must be an array');
  if (raw.some((entry) => entryMatches(entry, pluginPath, process.cwd()))) {
    return { changed: false, text: source };
  }

  const array = findPluginArray(source);
  const entry = JSON.stringify(pluginPath);
  if (array !== null) {
    const last = lastSignificant(source, array.open + 1, array.close);
    const inner = source.slice(array.open + 1, array.close);
    const hasContent = inner.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '').trim().length > 0;
    const needsComma = hasContent && last >= 0 && source[last] !== ',';
    const insertion = `${needsComma ? ',' : ''} ${entry}`;
    return {
      changed: true,
      text: source.slice(0, array.close) + insertion + source.slice(array.close),
    };
  }

  // No plugin array yet: insert it before the final top-level closing brace.
  const close = source.lastIndexOf('}');
  if (close < 0) throw new ConfigEditError('configuration object is not closed');
  const before = source.slice(0, close);
  const trimmed = before.replace(/\s+$/, '');
  const empty = trimmed === '{';
  const trailingComma = /,\s*$/.test(trimmed);
  const prefix = empty || trailingComma ? '' : ',';
  return {
    changed: true,
    text: `${trimmed}${prefix}\n  "plugins": [${entry}]\n${source.slice(close)}`,
  };
}

// Removes only the Buddy entry. String entries are matched by path; object
// entries by their package field. Other plugins and comments stay untouched.
export function removePlugin(text, pluginPath) {
  const source = text.trim() === '' ? '{}' : text;
  const json = parseJsonc(source);
  const raw = 'plugins' in json ? json.plugins : 'plugin' in json ? json.plugin : [];
  if (!Array.isArray(raw)) throw new ConfigEditError('plugins must be an array');
  const array = findPluginArray(source);
  if (array === null) return { changed: false, text: source };
  const entries = splitArrayEntries(source, array.open + 1, array.close);
  const index = entries.findIndex((entry) => {
    try {
      return entryMatches(JSON.parse(stripJsonc(entry.text)), pluginPath, process.cwd());
    } catch {
      return false;
    }
  });
  if (index < 0) return { changed: false, text: source };

  const entry = entries[index];
  const next = entries[index + 1];
  const previous = entries[index - 1];
  let start = entry.start;
  let end = entry.end;
  if (next !== undefined) {
    // Remove the following comma and the entry.
    const comma = source.indexOf(',', entry.end);
    if (comma >= 0 && comma < next.start) start = entry.start;
    end = next.start;
    start = entry.start;
  } else if (previous !== undefined) {
    const comma = source.lastIndexOf(',', entry.start);
    start = comma >= 0 ? comma : entry.start;
  }
  const result = source.slice(0, start) + source.slice(end);
  return { changed: true, text: result };
}

function splitArrayEntries(text, start, end) {
  const entries = [];
  let i = skipTrivia(text, start);
  while (i < end) {
    const entryStart = i;
    if (text[i] === '"') {
      i = readString(text, i).end;
    } else if (text[i] === '{' || text[i] === '[') {
      let depth = 0;
      while (i < end) {
        if (text[i] === '"') {
          i = readString(text, i).end;
          continue;
        }
        if (text[i] === '{' || text[i] === '[') ++depth;
        else if (text[i] === '}' || text[i] === ']') {
          --depth;
          if (depth === 0) {
            ++i;
            break;
          }
        }
        ++i;
      }
    } else {
      throw new ConfigEditError('unsupported plugin array entry');
    }
    entries.push({ start: entryStart, end: i, text: text.slice(entryStart, i) });
    i = skipTrivia(text, i);
    if (text[i] === ',') i = skipTrivia(text, i + 1);
  }
  return entries;
}

export function configFileForProject(projectDir) {
  return resolve(projectDir, 'opencode.json');
}

export function configFileForGlobal(env = process.env, platform = process.platform, home = process.env.HOME) {
  const explicit = env.OPENCODE_CONFIG;
  if (explicit) return resolve(explicit);
  if (platform === 'win32') {
    const base = env.APPDATA ?? (home ? resolve(home, 'AppData', 'Roaming') : '.');
    return resolve(base, 'opencode', 'opencode.json');
  }
  const base = env.XDG_CONFIG_HOME ?? (home ? resolve(home, '.config') : '.');
  return resolve(base, 'opencode', 'opencode.json');
}

export function backupSuffix(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-');
}

export function pluginDirFromScript(scriptDir) {
  return resolve(scriptDir, '..', 'plugin', 'opencode-buddy');
}

export { dirname };
