/**
 * THE FOLDER A MAIN CONFIG SETUP PRINTS LOADS STORIES FROM, and the folder the person is told to
 * write them in: always one the app really has, never a default name it may not have. In order:
 * the folder of the app's own first story file (./hasStoriesOfItsOwn's walk); else `src`, when the
 * app has it; else the folder holding the root component (./rootComponentFile). An expo-router
 * app's root component sits in the router's folder, where every file is a route, so the folder
 * above that one is used. With none of these, the app's folder itself.
 *
 * Named from the app's folder, in posix form: `src/components`, `src`, `.`. The app's folder (`.`)
 * is loaded without its subfolders (../../../render/initLines storiesGlob), so the list never
 * reaches node_modules.
 */
import fs from 'fs';
import path from 'path';
import { EXPO_ROUTER_PACKAGE_NAME } from '../../../constants';
import { getCwd } from '../../../helpers';
import getDeclaredPackageVersion from '../requirements/getDeclaredPackageVersion';
import { firstStoryFile } from './hasStoriesOfItsOwn';
import rootComponentFile from './rootComponentFile';

async function folderForStories(): Promise<string> {
  const firstStory = firstStoryFile();
  if (firstStory) return path.posix.dirname(firstStory);

  if (fs.statSync(path.join(getCwd(), 'src'), { throwIfNoEntry: false })?.isDirectory()) {
    return 'src';
  }

  const hasExpoRouter = !!(await getDeclaredPackageVersion(EXPO_ROUTER_PACKAGE_NAME));
  const rootComponent = rootComponentFile(hasExpoRouter);
  if (!rootComponent.found) return '.';
  const rootComponentFolder = path.posix.dirname(rootComponent.file);
  return hasExpoRouter ? path.posix.dirname(rootComponentFolder) : rootComponentFolder;
}

export default folderForStories;
