
import { StorybookView } from '../types';
import SherloModule from '../SherloModule';

export interface StoryMeta {
  id: string;
  title: string;
  name: string;
  parameters: Record<string, any>;
  /**
   * Project-root-relative import path of the story file (e.g. "./src/Button.stories.tsx").
   * Used by TurboSnap to map storyId → source file without static reconstruction.
   * Sourced from _storyIndex.entries[id].importPath; derived from the require.context
   * directory + filename for the primary (titled) path.
   */
  importPath?: string;
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

    // Cache for auto-titled files (no title: in default export): maps the
    // require.context filename (= importPath) to the file's raw exports and
    // default-export meta. The fallback pass below uses this to merge
    // story-level parameters when recovering auto-titled stories from
    // _storyIndex.entries, instead of emitting only globalParams.
    const cachedAutoTitled: Record<string, {
      meta: { title?: string; parameters?: Record<string, any> };
      fileExports: Record<string, any>;
    }> = {};

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
        if (!titleStr) {
          // Auto-titled story: the title is resolved by Storybook at runtime
          // and lives only in _storyIndex.entries. Cache the raw exports so the
          // fallback pass can merge story-level parameters correctly.
          // Key by the importPath format that _storyIndex.entries uses:
          // `${directory}/${filename.substring(2)}` - mirrors what
          // @storybook/react-native/dist/index.js builds at line ~1224.
          // require.context keys are context-root-relative ("./Button.stories.tsx")
          // while importPath is project-root-relative ("./src/Button.stories.tsx"),
          // so keying by filename alone always misses the lookup below.
          const importPathKey = `${entry.directory}/${filename.substring(2)}`;
          cachedAutoTitled[importPathKey] = { meta, fileExports };
          continue;
        }
        const primaryImportPath = `${entry.directory}/${filename.substring(2)}`;
        for (const exportKey of Object.keys(fileExports)) {
          if (exportKey === 'default' || exportKey === '__esModule' || exportKey === '__namedExportsOrder' || exportKey.startsWith('_')) continue;
          const storyExport = fileExports[exportKey];
          if (!storyExport) continue;
          const annotations: Record<string, any> = typeof storyExport === 'function'
            ? ((storyExport as any).story || {})
            : (storyExport as Record<string, any>);
          const explicitName = typeof annotations.name === 'string' ? annotations.name : undefined;
          const exportKeyName = storyNameFromExport(exportKey);
          const exportKeyId = toId(titleStr, exportKeyName);
          // ID is always export-key-based: Storybook keys its store by export key, not display name.
          // Prefer the real index ID when available; synthesize only when genuinely absent from index.
          const id = indexEntries[exportKeyId]?.id ?? exportKeyId;
          if (seen.has(id)) continue;
          seen.add(id);
          const parameters = {
            ...(globalParams ?? {}),
            ...(meta.parameters ?? {}),
            ...(annotations.parameters ?? {}),
          };
          result.push({ id, title: titleStr, name: explicitName ?? exportKeyName, parameters, importPath: primaryImportPath });
        }
      }
    }

    // Fallback: include anything in _storyIndex.entries not already emitted.
    // This covers auto-titled stories (title resolved by Storybook only at
    // runtime) and any stories missed by the primary path. For auto-titled
    // stories the cachedAutoTitled map supplies the raw file exports so we
    // can merge story-level parameters rather than emitting only globalParams.
    for (const id of Object.keys(indexEntries)) {
      if (seen.has(id)) continue;
      const indexEntry = indexEntries[id];
      const cached = cachedAutoTitled[indexEntry.importPath];
      if (cached) {
        // Find the named export whose computed story name matches the index entry.
        let storyAnnotations: Record<string, any> = {};
        for (const exportKey of Object.keys(cached.fileExports)) {
          if (exportKey === 'default' || exportKey === '__esModule' || exportKey === '__namedExportsOrder' || exportKey.startsWith('_')) continue;
          const storyExport = cached.fileExports[exportKey];
          if (!storyExport) continue;
          const ann: Record<string, any> = typeof storyExport === 'function'
            ? ((storyExport as any).story || {})
            : (storyExport as Record<string, any>);
          const explicitName = typeof ann.name === 'string' ? ann.name : undefined;
          const computedName = explicitName || storyNameFromExport(exportKey);
          if (computedName === indexEntry.name) {
            storyAnnotations = ann;
            break;
          }
        }
        result.push({
          id,
          title: indexEntry.title,
          name: indexEntry.name,
          parameters: {
            ...(globalParams ?? {}),
            ...(cached.meta.parameters ?? {}),
            ...(storyAnnotations.parameters ?? {}),
          },
          importPath: indexEntry.importPath,
        });
      } else {
        result.push({
          id,
          title: indexEntry.title,
          name: indexEntry.name,
          parameters: { ...(globalParams ?? {}) },
          importPath: indexEntry.importPath,
        });
      }
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


