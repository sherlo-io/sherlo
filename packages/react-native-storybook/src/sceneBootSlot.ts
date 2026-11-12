/**
 * THE SLOT THE SDK'S MAIN ENTRY IMPORTS FOR THE SCENE BOOT (src/sceneBoot.ts).
 *
 * This module is empty on purpose. Sherlo's bundler config answers the entry's import of it with
 * the scene boot only when the project has scenes (metro/withStorybook.js, withSceneBoot), so a
 * bundle with scenes off holds no scene code. A bundle made without Sherlo's bundler config holds
 * no scene boot either.
 */
export {};
