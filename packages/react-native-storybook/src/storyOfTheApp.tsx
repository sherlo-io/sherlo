/**
 * WHERE THE APP BEGINS, for ./componentNames: the one piece of it that needs a renderer.
 *
 * Render this around the app's story and nothing else. Every native view the story draws is then
 * named for the app's components above it, and everything outside this - Storybook's story view,
 * its error boundary, Sherlo's own - is left nameless, because none of it is the app.
 *
 * It draws nothing of its own: it hands back exactly the story it was given.
 */
import { type ReactNode, useEffect } from 'react';
import { AppRegistry, View } from 'react-native';
import { useFiber } from 'its-fine';
import { rememberStoryOfTheApp } from './componentNames';
import SherloModule from './SherloModule';
import { MetadataProvider } from './getStorybook/components/TestingMode/MetadataProvider';

export function StoryOfTheApp({ children }: { children: ReactNode }): ReactNode {
  const fiber = useFiber();

  useEffect(() => {
    rememberStoryOfTheApp(fiber);
    return () => rememberStoryOfTheApp(undefined);
  }, [fiber]);

  return children;
}

/**
 * For an app with scene files and no Storybook: render the app's own root inside StoryOfTheApp, so
 * the walk of the app's views has a top to start from. There is no decorator on that road, and the
 * app is the customer's. Whatever registers the root (AppRegistry.registerComponent, Expo's
 * registerRootComponent), React Native wraps it in the wrapper component given here, which hands
 * back the root it was given. Called by the launch entry before the app's entry runs.
 */
export function wrapTheAppInStoryOfTheApp(): void {
  AppRegistry.setWrapperComponentProvider(() => TheAppsWrapper);
}

/**
 * MetadataProvider is the same one Storybook's testing mode renders: it publishes the collector a
 * capture reads the views' text and style through, and it holds the FiberProvider StoryOfTheApp
 * reads its fiber through (its-fine).
 */
function TheAppsWrapper({ children }: { children: ReactNode }): ReactNode {
  // Storybook's story view is a View whose testID is the story's id (@storybook/react-native's
  // StoryView), and the capture core keeps the collector's reading only when a view carries the
  // story's id (captureTransport.ts, namesTheStory). A scene's id is the launch's storyId, known
  // at render (SherloModule.getLastState), as sceneBoot.ts reads it. The view fills the screen as
  // the app's root would and is not collapsed, so it stays a native view.
  const sceneId =
    SherloModule.getMode() === 'testing'
      ? SherloModule.getLastState()?.nextSnapshot.storyId
      : undefined;
  const app = <StoryOfTheApp>{children}</StoryOfTheApp>;
  return (
    <MetadataProvider>
      {sceneId ? (
        <View testID={sceneId} collapsable={false} style={{ flex: 1 }}>
          {app}
        </View>
      ) : (
        app
      )}
    </MetadataProvider>
  );
}
