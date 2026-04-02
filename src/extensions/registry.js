// Compiler extension registry
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const EXTENSION_PLUGINS = {
  '.kmx': './kmx-react.js',
};

const loadedPlugins = new Map();

export async function loadPluginsForFile(filePath) {
  if (!filePath) return [];
  const ext = filePath.match(/\.\w+$/)?.[0];
  if (!ext || !EXTENSION_PLUGINS[ext]) return [];
  const pluginPath = EXTENSION_PLUGINS[ext];
  if (!loadedPlugins.has(pluginPath)) {
    const mod = await import(pluginPath);
    loadedPlugins.set(pluginPath, mod.default);
  }
  return [loadedPlugins.get(pluginPath)];
}
