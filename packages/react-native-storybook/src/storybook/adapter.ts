
import { StorybookView } from '../types';
import SherloModule from '../SherloModule';

export interface StoryMeta {
  id: string;
  title: string;
  name: string;
  parameters: Record<string, any>;
}

const SANITIZE_REGEX = /[ '–-―′¿'`~!@#$%^&*()_|+\-=?;:'",.<>\{\}\[\]\\\/]/gi;

function sanitize(str: string): string {
  return str
    .toLowerCase()
    .replace(SANITIZE_REGEX, '-')
    .replace(/-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
}

export function toId(kind: string, name?: string): string {
  return name ? sanitize(kind) + '--' + sanitize(name) : sanitize(kind);
}

export function storyNameFromExport(key: string): string {
  return key
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .replace(/^[a-z]/, (c) => c.toUpperCase())
    .replace(/_/g, ' ')
    .trim();
}

interface RawRequireContext {
  keys(): string[];
  (filename: string): Record<string, any>;
}

interface ViewInternal {
  _storyIndex?: { entries?: Record<string, { id: string; title: string; name: string; importPath: string }> };
}

export function enumerateStories(view: StorybookView): StoryMeta[] {
    const indexEntries = (view as unknown as ViewInternal)._storyIndex?.entries ?? {};
    const storyEntries = readStoryEntries();
    const globalParams = readGlobalParameters();
    const result: StoryMeta[] = [];
    const seen = new Set<string>();

    // Primary source: raw require.context per story entry. Storybook v10's
    // _storyIndex.entries can be incomplete for legacy/CSF3 files (only one
    // named export registered per file), so we cannot rely on it as the
    // source of truth. We iterate every file via the require.context that
    // storybook.requires.ts hands us, then for each named export build a
    // storyId via toId(title, name).
    for (const entry of storyEntries) {
      if (!entry.req || !entry.directory) continue;
      for (const filename of entry.req.keys()) {
        let fileExports: Record<string, any> | null;
        try {
          fileExports = entry.req(filename);
        } catch (_) {
          continue;
        }
        if (!fileExports || !fileExports.default || typeof fileExports.default !== 'object') continue;
        const meta = fileExports.default as { title?: string; parameters?: Record<string, any> };
        const titleStr = typeof meta.title === 'string' ? meta.title : '';
        if (!titleStr) continue;
        for (const exportKey of Object.keys(fileExports)) {
          if (exportKey === 'default' || exportKey === '__esModule' || exportKey === '__namedExportsOrder' || exportKey.startsWith('_')) continue;
          const storyExport = fileExports[exportKey];
          if (!storyExport) continue;
          const annotations: Record<string, any> = typeof storyExport === 'function'
            ? ((storyExport as any).story || {})
            : (storyExport as Record<string, any>);
          const explicitName = typeof annotations.name === 'string' ? annotations.name : undefined;
          const storyName = explicitName || storyNameFromExport(exportKey);
          const id = toId(titleStr, storyName);
          if (seen.has(id)) continue;
          seen.add(id);
          const parameters = {
            ...(globalParams ?? {}),
            ...(meta.parameters ?? {}),
            ...(annotations.parameters ?? {}),
          };
          result.push({ id, title: titleStr, name: storyName, parameters });
        }
      }
    }

    // Fallback: if storyEntries was empty for some reason, also include
    // anything in _storyIndex.entries that we have not already emitted.
    // Stops a misconfigured app from receiving zero snapshots.
    for (const id of Object.keys(indexEntries)) {
      if (seen.has(id)) continue;
      const indexEntry = indexEntries[id];
      result.push({
        id,
        title: indexEntry.title,
        name: indexEntry.name,
        parameters: { ...(globalParams ?? {}) },
      });
    }

    if (result.length === 0 && SherloModule.getMode() === 'testing') {
      console.warn('[Sherlo] enumerated zero stories - check storybook.requires.ts or your Storybook config');
    }

    return result;
}

function readStoryEntries(): Array<{ titlePrefix?: string; directory?: string; req?: RawRequireContext }> {
  const stories = (globalThis as any).STORIES;
  if (!Array.isArray(stories)) return [];
  return stories;
}

function readGlobalParameters(): Record<string, any> {
  try {
    const sbRnPreview = (require as any)('@storybook/react-native/preview');
    return (sbRnPreview && sbRnPreview.default && sbRnPreview.default.parameters) || {};
  } catch (_) {
    return {};
  }
}


