/**
 * EVERY SCENE THE BUNDLE HOLDS, by its id (`chat--conversation`): the file that declares it, from
 * the project root as the bundler's scan names it (`./src/chat.scenes.tsx`), the scene's name in
 * that file, and a function that requires the file.
 *
 * This module is empty on purpose. Sherlo's bundler config answers the early-boot module's import
 * of it with the project's own list, written while the bundler starts (metro/sceneFiles.js,
 * writeBundledScenesModule), and requiring a scene file is left to the one launch that opens it.
 * A bundle made without Sherlo's bundler config holds no scenes.
 */
export type BundledScene = { filePath: string; sceneName: string; loadFile: () => unknown };

const bundledScenes: Record<string, BundledScene> = {};

export default bundledScenes;
