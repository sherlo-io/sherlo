
import { StorybookView } from '../types';

export interface StoryMeta {
  id: string;
  title: string;
  name: string;
  parameters: Record<string, any>;
}

export interface StorybookAdapter {
  enumerateStories(view: StorybookView): StoryMeta[];
  prepareForTesting(view: StorybookView): void;
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
  _preview?: { importFn?: (importPath: string) => Promise<any> };
}

const PATCH_FLAG = '__sherloImportFnPatched';

const DefaultAdapter: StorybookAdapter = {
  enumerateStories(view): StoryMeta[] {
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

    return result;
  },

  prepareForTesting(view): void {
    const preview = (view as unknown as ViewInternal)._preview as
      | { importFn?: (importPath: string) => Promise<any>; [k: string]: any }
      | undefined;
    if (!preview) { return; }
    if (typeof preview.importFn !== 'function') { return; }
    if (preview[PATCH_FLAG]) { return; }

    const originalImportFn = preview.importFn.bind(preview);

    const metaByImportPath: Record<string, any> = {};
    const moduleExportsByImportPath: Record<string, any> = {};
    const storyEntries = readStoryEntries();
    for (const entry of storyEntries) {
      if (!entry.req || !entry.directory) continue;
      for (const filename of entry.req.keys()) {
        try {
          const fileExports = entry.req(filename);
          if (!fileExports || !fileExports.default) continue;
          const importPath = entry.directory + '/' + filename.substring(2);
          metaByImportPath[importPath] = fileExports.default;
          // Sanitize for Storybook v10 processCSFFile:
          //  - drop __esModule and any underscore-prefixed keys (processCSFFile may iterate
          //    Object.keys and treat __esModule as a story export, crashing on .story access)
          //  - synthesize __namedExportsOrder from the remaining named exports
          const sanitized: Record<string, any> = { default: fileExports.default };
          const namedKeys: string[] = [];
          for (const key of Object.keys(fileExports)) {
            if (key === 'default' || key === '__esModule' || key === '__namedExportsOrder' || key.startsWith('_')) continue;
            sanitized[key] = fileExports[key];
            namedKeys.push(key);
          }
          sanitized.__namedExportsOrder = namedKeys;
          moduleExportsByImportPath[importPath] = sanitized;
        } catch (_) {
          continue;
        }
      }
    }

    preview.importFn = async (importPath: string) => {
      const original = await originalImportFn(importPath);
      const meta = metaByImportPath[importPath];
      if (original && meta && !original.default) {
        return { ...original, default: meta };
      }
      return original;
    };

    preview[PATCH_FLAG] = true;

    const STORE_PATCH_FLAG = '__sherloStoreImportFnPatched';
    const wrappedImportFn = preview.importFn;
    const patchStoreInstance = (store: any): void => {
      if (!store) { return; }
      if (store[STORE_PATCH_FLAG]) { return; }
      if (typeof store.importFn !== 'function') { return; }
      store.importFn = wrappedImportFn;
      store[STORE_PATCH_FLAG] = true;

      // Storybook RN v10's processCSFFileWithCache memoized closure is broken for
      // legacy/CSF3 module shapes when fed through its captured (unpatched) importFn.
      // Calling the original always crashes inside normalizeStory ('story of undefined').
      // We bypass the closure entirely and build the CSF file struct ourselves from
      // the raw require.context module exports we already collected.
      const buildCSFFile = (moduleExports: any, importPath: string, fallbackTitle: string): any => {
        const metaInput = moduleExports.default || {};
        const titleStr = (typeof metaInput.title === 'string' && metaInput.title) || fallbackTitle || importPath;
        const metaId = toId(titleStr);
        const meta: any = {
          id: metaId,
          title: titleStr,
          parameters: metaInput.parameters || {},
          args: metaInput.args || {},
          argTypes: metaInput.argTypes || {},
          decorators: Array.isArray(metaInput.decorators) ? metaInput.decorators : [],
          loaders: Array.isArray(metaInput.loaders) ? metaInput.loaders : [],
          component: metaInput.component,
          subcomponents: metaInput.subcomponents,
          tags: Array.isArray(metaInput.tags) ? metaInput.tags : [],
          play: metaInput.play,
          render: metaInput.render,
        };
        const stories: Record<string, any> = {};
        const namedExportsOrder: string[] = Array.isArray(moduleExports.__namedExportsOrder)
          ? moduleExports.__namedExportsOrder
          : Object.keys(moduleExports).filter(k => k !== 'default' && k !== '__esModule' && k !== '__namedExportsOrder' && !k.startsWith('_'));
        for (const exportName of namedExportsOrder) {
          const storyExport = moduleExports[exportName];
          if (!storyExport) continue;
          const isFunction = typeof storyExport === 'function';
          const annotations: any = isFunction ? (storyExport.story || {}) : storyExport;
          const explicitName = typeof annotations.name === 'string' ? annotations.name : undefined;
          const storyName = explicitName || storyNameFromExport(exportName);
          const storyId = toId(titleStr, storyName);
          const render = isFunction
            ? storyExport
            : (typeof annotations.render === 'function' ? annotations.render : undefined);
          stories[storyId] = {
            id: storyId,
            exportName,
            name: storyName,
            title: titleStr,
            render,
            parameters: annotations.parameters || {},
            args: annotations.args || {},
            argTypes: annotations.argTypes || {},
            decorators: Array.isArray(annotations.decorators) ? annotations.decorators : [],
            loaders: Array.isArray(annotations.loaders) ? annotations.loaders : [],
            tags: Array.isArray(annotations.tags) ? annotations.tags : [],
            play: annotations.play,
            moduleExport: storyExport,
          };
        }
        return { meta, stories };
      };

      store.processCSFFileWithCache = function ownedProcessCSFFileWithCache(...args: any[]) {
        const incomingExports = args[0];
        const importPath = typeof args[1] === 'string' ? args[1] : '';
        const title = typeof args[2] === 'string' ? args[2] : '';
        const finalExports = incomingExports && typeof incomingExports === 'object'
          ? incomingExports
          : moduleExportsByImportPath[importPath];
        if (!finalExports) { return undefined; }
        return buildCSFFile(finalExports, importPath, title);
      };
    };

    let storyStoreValueRef: any = (preview as any).storyStoreValue;
    if (storyStoreValueRef) {
      patchStoreInstance(storyStoreValueRef);
    }
    try {
      Object.defineProperty(preview, 'storyStoreValue', {
        configurable: true,
        enumerable: true,
        get() {
          return storyStoreValueRef;
        },
        set(value: any) {
          storyStoreValueRef = value;
          if (value) patchStoreInstance(value);
        },
      });
    } catch (_) { /* swallow */ }
  },
};

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

function resolveFileExports(
  importPath: string,
  storyEntries: Array<{ directory?: string; req?: RawRequireContext }>
): Record<string, any> | null {
  for (const entry of storyEntries) {
    if (!entry.req || !entry.directory) continue;
    if (!importPath.startsWith(entry.directory + '/')) continue;
    const relative = importPath.slice(entry.directory.length + 1);
    const reqKey = './' + relative;
    try {
      return entry.req(reqKey);
    } catch (_) {
      return null;
    }
  }
  return null;
}

function findExportKeyForStory(
  fileExports: Record<string, any>,
  meta: any,
  indexEntry: { id: string; name: string; title: string }
): string | null {
  for (const key of Object.keys(fileExports)) {
    if (key === 'default' || key === '__esModule' || key === '__namedExportsOrder') continue;
    const value = fileExports[key];
    if (!value) continue;
    const candidateId = toId(meta.title ?? indexEntry.title, storyNameFromExport(key));
    if (candidateId === indexEntry.id) return key;
  }
  return null;
}

export function getAdapter(_view: StorybookView): StorybookAdapter {
  return DefaultAdapter;
}
