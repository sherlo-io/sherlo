import { useEffect, useRef } from 'react';

const EVENTS = {
  STORY_CHANGED: 'storyChanged',
  STORY_PREPARED: 'storyPrepared',
  REQUEST_STORY_INDEX: 'requestStoryIndex',
  SET_STORY_INDEX: 'setStoryIndex', // SB 7/8+ preview channel
  SET_STORIES: 'setStories', // legacy alias in some RN builds
  STORY_INDEX_INVALIDATED: 'storyIndexInvalidated',
} as const;

type IndexEntry = { id: string; title: string; name: string; importPath?: string };
type IndexPayload =
  | { entries?: Record<string, IndexEntry> } // SB 7/8 shape
  | Record<string, IndexEntry>; // older “bare entries” shape

type PreparedPayload = {
  id: string;
  name?: string; // often present on newer builds
  title?: string; // sometimes missing on RN
  kind?: string; // legacy alias for title
  parameters?: { fileName?: string; [k: string]: any };
};

// last-resort humanizers from the id, e.g. "testing-components-testinfo--basic"
function startCase(s: string) {
  return s.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
function deriveFromId(storyId: string) {
  const [rawTitle, rawName] = storyId.split('--');
  const variantName = rawName ? startCase(rawName) : undefined;
  // You can’t perfectly restore "/" vs " " from the kebab title,
  // but a decent human title is still useful:
  const title = rawTitle ? startCase(rawTitle) : undefined;
  return { title, variantName };
}

export default function useStorybookEventListener(): void {
  const init = useRef(false);
  const metaByIdRef = useRef(
    new Map<string, { title?: string; name?: string; importPath?: string }>()
  );

  useEffect(() => {
    if (init.current) return;
    init.current = true;

    const view = (global as any).view;
    const channel = view?._channel;

    if (!channel) {
      return;
    }

    // Helper function to store story ID in global for mock resolution
    const storeStoryId = (storyId: string) => {
      console.warn(`[SHERLO] useStorybookEventListener: Setting story ID to "${storyId}"`);
      (global as any).__SHERLO_CURRENT_STORY_ID__ = storyId;
    };

    // 1) storyPrepared often yields name + parameters.fileName (file path)
    // This fires when a story is initially loaded (including on app startup)
    const onPrepared = (p: PreparedPayload) => {
      console.log(`[SHERLO] onPrepared`, p);
      const prev = metaByIdRef.current.get(p.id) || {};
      metaByIdRef.current.set(p.id, {
        title: p.title ?? p.kind ?? prev.title, // title/kind
        name: p.name ?? prev.name,
        importPath: p.parameters?.fileName ?? prev.importPath, // file path
      });

      // Store story ID when story is prepared (handles initial load case)
      if (p.id) {
        storeStoryId(p.id);
      }
    };

    // 2) story index (different shapes/aliases depending on version)
    const onSetIndex = (payload: IndexPayload) => {
      console.log(`[SHERLO] onSetIndex`, payload);
      const entries = (payload as any).entries ?? payload;
      if (!entries) return;
      for (const [id, e] of Object.entries(entries)) {
        const prev = metaByIdRef.current.get(id) || {};
        metaByIdRef.current.set(id, {
          title: (e as IndexEntry).title ?? prev.title,
          name: (e as IndexEntry).name ?? prev.name,
          importPath: (e as IndexEntry).importPath ?? prev.importPath,
        });
      }
    };

    channel.on(EVENTS.STORY_PREPARED, onPrepared);
    channel.on(EVENTS.SET_STORY_INDEX, onSetIndex);
    channel.on(EVENTS.SET_STORIES as any, onSetIndex); // legacy

    // Keep fresh if the index is invalidated (file changed, HMR, etc.)
    channel.on(EVENTS.STORY_INDEX_INVALIDATED, () => {
      metaByIdRef.current.clear();
      channel.emit(EVENTS.REQUEST_STORY_INDEX);
    });

    // Seed once
    channel.emit(EVENTS.REQUEST_STORY_INDEX);

    // 3) On navigation, assemble best-available metadata with fallbacks
    channel.on(EVENTS.STORY_CHANGED, (storyId: string) => {
      const meta = metaByIdRef.current.get(storyId);
      let title = meta?.title;
      let variantName = meta?.name;
      const importPath = meta?.importPath;

      if (!title || !variantName) {
        const fromId = deriveFromId(storyId);
        title = title ?? fromId.title;
        variantName = variantName ?? fromId.variantName;
      }

      // Store story ID in global variable for mock files to read at runtime
      // Mock files will call getCurrentStory() which reads from this global
      storeStoryId(storyId);

      if (!meta) {
        // If we still had nothing, ask again (harmless if already sent)
        channel.emit(EVENTS.REQUEST_STORY_INDEX);
      }
    });

    return () => {
      channel.off(EVENTS.STORY_PREPARED, onPrepared);
      channel.off(EVENTS.SET_STORY_INDEX, onSetIndex);
      channel.off(EVENTS.SET_STORIES as any, onSetIndex);
      channel.off(EVENTS.STORY_INDEX_INVALIDATED, () => {});
      channel.off(EVENTS.STORY_CHANGED, () => {});
    };
  }, []);
}
