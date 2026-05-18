
import { StorybookView } from '../types';
import SherloModule from '../SherloModule';

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
    // BISECT: disabled to test if adapter.prepareForTesting is the regression
    // cause beyond polyfill. 1.6.3 had no adapter at all.
    if ((true as any)) { return; }
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
          // Match Storybook v10 importMap shape: drop __esModule and underscore-prefixed keys,
          // keep `default` (the meta) and the named story exports. Storybook's processCSFFile
          // expects exactly this shape; any extra key (e.g. __namedExportsOrder) is treated
          // as a story candidate and triggers a 'Cannot read property story of undefined' crash.
          const sanitized: Record<string, any> = { default: fileExports.default };
          for (const key of Object.keys(fileExports)) {
            if (key === 'default' || key === '__esModule' || key === '__namedExportsOrder' || key.startsWith('_')) continue;
            const val = fileExports[key];
            if (val == null) continue;
            sanitized[key] = val;
          }
          moduleExportsByImportPath[importPath] = sanitized;
        } catch (_) {
          continue;
        }
      }
    }

    // Apply importFn wrap on ALL Storybook versions. v10's processCSFFile is the
    // known crash site; v8/v9 may also crash the same way (also missing importMap
    // entries when story files' default export isn't bound at start() time).
    // Earlier comment claimed wrapping importFn on v8/v9 hangs - that was for an
    // older fallback shape. Our current fallback returns the Storybook importMap
    // shape verbatim (default + named exports), so memoization should be fine.
    preview.importFn = async (importPath: string) => {
      const original = await originalImportFn(importPath);
      if (original) {
        const meta = metaByImportPath[importPath];
        if (meta && !original.default) {
          return { ...original, default: meta };
        }
        return original;
      }
      return moduleExportsByImportPath[importPath];
    };

    // All Storybook versions' storyIndex can be incomplete for legacy/CSF3 files (only one
    // named export registered per file). Populating _storyIndex.entries fixes that.
    // Populate view._storyIndex.entries with every story we enumerate from raw
    // require.context. Storybook's storyIndex can be incomplete for legacy/CSF3
    // files (only one named export registered per file). When createPreparedStoryMapping
    // iterates entries, only that one story gets into _idToPrepared. Other
    // stories then fail to render via view.setStory(...) - Storybook stays on
    // its 'Please select a story to preview' placeholder, the runner captures
    // that, and auto-reports the snapshot as a render error.
    // Adding the missing entries lets Storybook process every enumerated story.
    const viewInternal = view as unknown as ViewInternal;
    if (viewInternal._storyIndex && viewInternal._storyIndex.entries) {
      const entries = viewInternal._storyIndex.entries;
      for (const importPath of Object.keys(moduleExportsByImportPath)) {
        const moduleExports = moduleExportsByImportPath[importPath];
        const metaInput = moduleExports.default || {};
        const titleStr = typeof metaInput.title === 'string' ? metaInput.title : '';
        if (!titleStr) continue;
        const namedExportsOrder: string[] = Array.isArray(moduleExports.__namedExportsOrder)
          ? moduleExports.__namedExportsOrder
          : Object.keys(moduleExports).filter((k: string) => k !== 'default' && k !== '__esModule' && k !== '__namedExportsOrder' && !k.startsWith('_'));
        for (const exportName of namedExportsOrder) {
          const storyExport = moduleExports[exportName];
          if (!storyExport) continue;
          const annotations: any = typeof storyExport === 'function' ? (storyExport.story || {}) : storyExport;
          const explicitName = typeof annotations.name === 'string' ? annotations.name : undefined;
          const storyName = explicitName || storyNameFromExport(exportName);
          const id = toId(titleStr, storyName);
          if (entries[id]) continue;
          entries[id] = { id, title: titleStr, name: storyName, importPath };
        }
      }
    }

    preview[PATCH_FLAG] = true;
  },
};

function readStoryEntries(): Array<{ titlePrefix?: string; directory?: string; req?: RawRequireContext }> {
  const stories = (globalThis as any).STORIES;
  if (!Array.isArray(stories)) return [];
  return stories;
}

function isStorybookV10OrLater(): boolean {
  try {
    const pkg = (require as any)('@storybook/react-native/package.json');
    const version = typeof pkg?.version === 'string' ? pkg.version : '0';
    const major = parseInt(version.split('.')[0], 10);
    return major >= 10;
  } catch (_) {
    // If package.json is unresolvable, assume NOT v10 to avoid applying
    // the patch to sb8/sb9 where it may break story preparation.
    return false;
  }
}

function readGlobalParameters(): Record<string, any> {
  try {
    const sbRnPreview = (require as any)('@storybook/react-native/preview');
    return (sbRnPreview && sbRnPreview.default && sbRnPreview.default.parameters) || {};
  } catch (_) {
    return {};
  }
}


export function getAdapter(_view: StorybookView): StorybookAdapter {
  return DefaultAdapter;
}
