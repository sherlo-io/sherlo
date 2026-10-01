import { useEffect } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MetadataProviderRef } from '../MetadataProvider';
import { getSealedCore } from '../../../../sealedCore/loadSealedCore';
import { StorybookView } from '../../../../types';
import { clearMocks } from '../../../../mocking';

/**
 * A launch with a story: the sealed core waits until the story is ready and reports it to the
 * runner (its testStory). This hook hands it the view, the screen's insets and the app's metadata,
 * and turns the story's mocks off however the walk ended - mocking stays in the SDK.
 */
function useTestStory({
  metadataProviderRef,
  view,
  enabled = true,
}: {
  metadataProviderRef: React.RefObject<MetadataProviderRef>;
  view?: StorybookView;
  /**
   * Whether the walk may run at all - false for a capture, which is driven over the socket instead
   * and reports nothing over protocol files (see useTestAllStories, the one place that reads
   * SherloModule.getDriver() to decide). Defaults to true.
   */
  enabled?: boolean;
}): void {
  const insets = useSafeAreaInsets();

  useEffect(() => {
    (async (): Promise<void> => {
      try {
        const core = getSealedCore();
        if (!enabled || !core) return;

        await core.testStory({
          view,
          insets,
          collectMetadata: () => metadataProviderRef?.current?.collectMetadata(),
        });
      } finally {
        // IS-07: the walk for this story is over - pass every mocked module through to its real
        // implementation again, however it ended.
        clearMocks();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

export default useTestStory;
