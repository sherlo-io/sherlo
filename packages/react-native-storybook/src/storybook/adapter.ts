import { StorybookView } from '../types';
import SherloModule from '../SherloModule';
import { mergeMockSet } from '../mocking/mergeMocks';
import { MockSet } from '../mocking/types';

export interface StoryMeta {
  id: string;
  title: string;
  name: string;
  parameters: Record<string, any>;
  /**
   * Project-root-relative import path of the story file (e.g. "./src/Button.stories.tsx").
   * Used by Diff Scope to map storyId → source file without static reconstruction.
   * Sourced from _storyIndex.entries[id].importPath; derived from the require.context
   * directory + filename for the primary (titled) path.
   */
  importPath?: string;
  /**
   * Module Mocking (SHERLO-1735): the story's mock set, already merged per module key
   * across global/meta/story parameters (precedence story > meta > global - see
   * mergeMockSet). Computed from the three RAW `parameters.sherlo.mocks` levels, not
   * from `parameters` above - that field is a shallow spread of all three levels, so a
   * story's `parameters.sherlo` replaces meta's and global's wholesale and the
   * per-key mock precedence would otherwise be lost.
   */
  mocks: MockSet;
}

const SANITIZE_REGEX = /[ '–-―′¿'`~!@#$%^&*()_|+\-=?;:'",.<>{}[\]\\/]/gi;

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
  _storyIndex?: {
    entries?: Record<string, { id: string; title: string; name: string; importPath: string }>;
  };
  // Storybook's live Preview instance (PreviewWithSelection). Not on the public
  // StorybookView type, so - like the other internal fields here and in
  // getStorybook.tsx - it is reached through a cast. `storyStoreValue` is the
  // StoryStore that Storybook builds once the preview is ready; its
  // `projectAnnotations.parameters` holds the composed PROJECT (preview-level)
  // parameters, including `parameters.sherlo.mocks` declared in the app's
  // .rnstorybook/preview.ts. This is the only runtime source of global-level
  // mocks on device (see readGlobalParameters).
  _preview?: {
    storyStoreValue?: {
      projectAnnotations?: { parameters?: Record<string, any> };
    };
  };
}

export function enumerateStories(view: StorybookView): StoryMeta[] {
  const indexEntries = (view as unknown as ViewInternal)._storyIndex?.entries ?? {};
  const storyEntries = readStoryEntries();
  const globalParams = readGlobalParameters(view);
  const globalMocks: MockSet = globalParams?.sherlo?.mocks ?? {};
  const result: StoryMeta[] = [];
  const seen = new Set<string>();

  // Cache for auto-titled files (no title: in default export): maps the
  // require.context filename (= importPath) to the file's raw exports and
  // default-export meta. The fallback pass below uses this to merge
  // story-level parameters when recovering auto-titled stories from
  // _storyIndex.entries, instead of emitting only globalParams.
  const cachedAutoTitled: Record<
    string,
    {
      meta: { title?: string; parameters?: Record<string, any> };
      fileExports: Record<string, any>;
    }
  > = {};

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
        if (
          exportKey === 'default' ||
          exportKey === '__esModule' ||
          exportKey === '__namedExportsOrder' ||
          exportKey.startsWith('_')
        ) {
          continue;
        }
        const storyExport = fileExports[exportKey];
        if (!storyExport) continue;
        const annotations: Record<string, any> =
          typeof storyExport === 'function'
            ? (storyExport as any).story || {}
            : (storyExport as Record<string, any>);
        const explicitName = typeof annotations.name === 'string' ? annotations.name : undefined;
        const exportKeyName = storyNameFromExport(exportKey);
        const displayName = explicitName ?? exportKeyName;
        const exportKeyId = toId(titleStr, exportKeyName);
        // Layered ID resolution - prefer Storybook's real id, synthesize only when absent:
        // 1) exact: SDK-computed export-key id matches an index key (common case)
        // 2) divergent slug: match by importPath + display name (handles curly-apostrophe,
        //    digit/acronym casing, and other slug divergences between storyNameFromExport
        //    and Storybook's own normalisation)
        // 3) genuinely absent from the index (e.g. v10 require.context-only): synthesize
        let resolvedId: string | undefined = indexEntries[exportKeyId]?.id;
        if (!resolvedId) {
          const match = Object.values(indexEntries).find(
            (e) => e.importPath === primaryImportPath && e.name === displayName
          );
          resolvedId = match?.id;
        }
        const id = resolvedId ?? exportKeyId;
        if (seen.has(id)) continue;
        seen.add(id);
        const parameters = {
          ...(globalParams ?? {}),
          ...(meta.parameters ?? {}),
          ...(annotations.parameters ?? {}),
        };
        const metaMocks: MockSet = meta.parameters?.sherlo?.mocks ?? {};
        const storyMocks: MockSet = annotations.parameters?.sherlo?.mocks ?? {};
        result.push({
          id,
          title: titleStr,
          name: displayName,
          parameters,
          importPath: primaryImportPath,
          mocks: mergeMockSet(globalMocks, metaMocks, storyMocks),
        });
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
        if (
          exportKey === 'default' ||
          exportKey === '__esModule' ||
          exportKey === '__namedExportsOrder' ||
          exportKey.startsWith('_')
        ) {
          continue;
        }
        const storyExport = cached.fileExports[exportKey];
        if (!storyExport) continue;
        const ann: Record<string, any> =
          typeof storyExport === 'function'
            ? (storyExport as any).story || {}
            : (storyExport as Record<string, any>);
        const explicitName = typeof ann.name === 'string' ? ann.name : undefined;
        const computedName = explicitName || storyNameFromExport(exportKey);
        if (computedName === indexEntry.name) {
          storyAnnotations = ann;
          break;
        }
      }
      const metaMocks: MockSet = cached.meta.parameters?.sherlo?.mocks ?? {};
      const storyMocks: MockSet = storyAnnotations.parameters?.sherlo?.mocks ?? {};
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
        mocks: mergeMockSet(globalMocks, metaMocks, storyMocks),
      });
    } else {
      result.push({
        id,
        title: indexEntry.title,
        name: indexEntry.name,
        parameters: { ...(globalParams ?? {}) },
        importPath: indexEntry.importPath,
        mocks: globalMocks,
      });
    }
  }

  if (result.length === 0 && SherloModule.getMode() === 'testing') {
    console.warn(
      '[Sherlo] enumerated zero stories - check storybook.requires.ts or your Storybook config'
    );
  }

  return result;
}

function readStoryEntries(): Array<{
  titlePrefix?: string;
  directory?: string;
  req?: RawRequireContext;
}> {
  const stories = (globalThis as any).STORIES;
  if (!Array.isArray(stories)) return [];
  return stories;
}

// Preview-level (global) parameters, sourced from Storybook's live preview object.
//
// On device the app's `.rnstorybook/preview.ts` annotations are composed into
// view._preview.storyStoreValue.projectAnnotations, the SAME merged project object
// getStorybook.tsx reads via view._preview; it carries `parameters.sherlo.mocks`.
//
// TIMING: this composition is ASYNCHRONOUS - Storybook populates storyStoreValue
// during preview init (view._preview.ready() resolves at that point). On a fresh boot,
// enumerateStories can run BEFORE it, so this returns {} and global-level mocks are
// absent. That is by design here: callers that must include global mocks (the mock
// activation path) re-read once the preview is ready - see storyMockActivation. Do NOT
// assume this is populated on the first call.
//
// The old source - require('@storybook/react-native/preview') - resolves to an
// internal package stub that never carries the user's project annotations, so
// global-level mocks were silently dropped on device (SHERLO-1743, Defect 1).
function readGlobalParameters(view: StorybookView): Record<string, any> {
  const preview = (view as unknown as ViewInternal)._preview;
  return preview?.storyStoreValue?.projectAnnotations?.parameters ?? {};
}
