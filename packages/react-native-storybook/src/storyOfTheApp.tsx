/**
 * WHERE THE APP BEGINS, for ./componentNames: the one piece of it that needs a renderer.
 *
 * Render this around the app's story and nothing else. Every native view the story draws is then
 * named for the app's components above it, and everything outside this - Storybook's story view,
 * its error boundary, Sherlo's own - is left nameless, because none of it is the app.
 *
 * It draws nothing of its own: it hands back exactly the story it was given.
 */
import { type ReactNode, useEffect, useState } from 'react';
import { AppRegistry, View } from 'react-native';
import { useFiber } from 'its-fine';
import { rememberStoryOfTheApp } from './componentNames';
import { logTheLine } from './connection/appLine';
import { idOfTheTestingLaunch, sceneOfTheCaptureOfAnAppWithStorybook } from './captureLaunch';
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
  AppRegistry.setWrapperComponentProvider(() => TheScenesOnlyWrapper);
}

/** A scenes-only launch's scene is the launch's storyId, known at render, as sceneBoot.ts reads it. */
function TheScenesOnlyWrapper({ children }: { children: ReactNode }): ReactNode {
  const sceneId = idOfTheTestingLaunch();
  return <TheAppsWrapper sceneId={sceneId}>{children}</TheAppsWrapper>;
}

/**
 * For a capture launch of an app with its own Storybook: install, before the app's entry runs, a
 * wrapper that wraps the app's root as the scenes-only launch does (wrapTheAppInStoryOfTheApp). An
 * entry that sets its own wrapper later wins, as on the scenes-only road. Whether this wrapper wraps
 * is decided once, when the root first renders, by what the launch asks for (./captureLaunch): a
 * scene of the bundle that is not also a story of Storybook's index. A story is never wrapped as a
 * scene, whenever its getStorybook runs.
 */
export function installTheWrapperThatWrapsWhenSherlosStorybookIsAbsent(): void {
  AppRegistry.setWrapperComponentProvider(() => TheAppsWrapperWhenNoSherlosStorybook);
}

function TheAppsWrapperWhenNoSherlosStorybook({ children }: { children: ReactNode }): ReactNode {
  const [sceneId] = useState(sceneOfTheCaptureOfAnAppWithStorybook);
  return sceneId ? <TheAppsWrapper sceneId={sceneId}>{children}</TheAppsWrapper> : children;
}

/**
 * MetadataProvider is the same one Storybook's testing mode renders: it publishes the collector a
 * capture reads the views' text and style through, and it holds the FiberProvider StoryOfTheApp
 * reads its fiber through (its-fine).
 */
function TheAppsWrapper({
  children,
  sceneId,
}: {
  children: ReactNode;
  sceneId: string | undefined;
}): ReactNode {
  useEffect(() => {
    if (sceneId) logTheLine(`scene ${sceneId} root rendered`);
  }, [sceneId]);
  // Storybook's story view is a View whose testID is the story's id (@storybook/react-native's
  // StoryView), and the capture core keeps the collector's reading only when a view carries the
  // story's id (captureTransport.ts, namesTheStory). The view fills the screen as the app's root
  // would and is not collapsed, so it stays a native view.
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
