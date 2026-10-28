import { useEffect } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MetadataProviderRef } from '../MetadataProvider';
import { walkTheStoryForTheRunner } from '../../../../runnerWalk';

/**
 * A launch with a story: the sealed core waits until the story is ready and reports it to the
 * runner (its testStory). This hook hands it the screen's insets and the app's metadata, and turns
 * the story's mocks off however the walk ended - mocking stays in the SDK.
 */
function useTestStory({
  metadataProviderRef,
  enabled = true,
}: {
  metadataProviderRef: React.RefObject<MetadataProviderRef>;
  /**
   * Whether the walk may run at all - false for a capture, which is driven over the bundler's
   * capture address instead and reports nothing to a runner (see useTestAllStories, the one place
   * that decides). Defaults to true.
   */
  enabled?: boolean;
}): void {
  const insets = useSafeAreaInsets();

  useEffect(() => {
    // No walk happens for a capture: the mocks turned on for its story must stay on.
    if (!enabled) return;

    walkTheStoryForTheRunner({
      insets,
      collectMetadata: () => metadataProviderRef?.current?.collectMetadata(),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

export default useTestStory;
