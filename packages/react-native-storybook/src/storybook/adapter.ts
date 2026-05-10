import { StorybookView } from '../types';

export interface StoryMeta {
  id: string;
  title: string;
  name: string;
  parameters: Record<string, any>;
}

export interface StorybookAdapter {
  enumerateStories(view: StorybookView): StoryMeta[];
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
  return name ? `${sanitize(kind)}--${sanitize(name)}` : sanitize(kind);
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

const DefaultAdapter: StorybookAdapter = {
  enumerateStories(view): StoryMeta[] {
    const entries = (view as unknown as ViewInternal)._storyIndex?.entries ?? {};
    const storyEntries = readStoryEntries();
    const globalParams = readGlobalParameters();

    const result: StoryMeta[] = [];

    for (const id of Object.keys(entries)) {
      const indexEntry = entries[id];
      const fileExports = resolveFileExports(indexEntry.importPath, storyEntries);
      if (!fileExports) continue;

      const meta = fileExports.default;
      if (!meta || typeof meta !== 'object') continue;

      const exportKey = findExportKeyForStory(fileExports, meta, indexEntry);
      if (!exportKey) continue;

      const story = fileExports[exportKey];
      if (!story || typeof story !== 'object') continue;

      const parameters = {
        ...(globalParams ?? {}),
        ...(meta.parameters ?? {}),
        ...(story.parameters ?? {}),
      };

      result.push({
        id,
        title: indexEntry.title,
        name: indexEntry.name,
        parameters,
      });
    }

    return result;
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
