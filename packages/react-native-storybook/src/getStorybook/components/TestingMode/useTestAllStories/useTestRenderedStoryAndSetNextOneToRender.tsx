import { useEffect } from 'react';
import { RunnerBridge, SherloModule } from '../../../../helpers';
import { Snapshot } from '../../../../types';

function useTestRenderedStoryAndSetNextOneToRender({
  setStoryToTestData,
  storiesToTest,
  storyToTestData,
  renderedStoryId,
}: {
  setStoryToTestData: React.Dispatch<
    React.SetStateAction<
      | {
          requestId: string;
          storyIndex: number;
        }
      | undefined
    >
  >;
  storiesToTest: Snapshot[] | undefined;
  storyToTestData:
    | {
        requestId: string;
        storyIndex: number;
      }
    | undefined;
  renderedStoryId: string | undefined;
}): void {
  const config = SherloModule.getConfig();

  useEffect(() => {
    if (
      !storiesToTest ||
      !storiesToTest.length ||
      renderedStoryId === undefined ||
      storyToTestData?.storyIndex === undefined
    ) {
      return;
    }

    const storyToTest = storiesToTest[storyToTestData.storyIndex];
    const isStoryAlreadyRendered = renderedStoryId === storyToTest.storyId;

    if (!isStoryAlreadyRendered) {
      return;
    }

    RunnerBridge.log('attempt to test story', {
      testedIndex: storyToTestData.storyIndex,
      renderedStoryId,
      renderedSnapshotViewId: storyToTest.viewId,
    });

    (async (): Promise<void> => {
      setTimeout(async () => {
        try {
          if (!storyToTestData.requestId) {
            throw new Error('No request ID');
          }

          await SherloModule.clearFocus();
          RunnerBridge.log('cleared focus');

          const isStable = await SherloModule.checkIfStable(
            config.stabilization.requiredMatches,
            config.stabilization.intervalMs,
            config.stabilization.timeoutMs
          ).catch((error) => {
            RunnerBridge.log('error checking if stable', { error: error.message });
            throw error;
          });

          RunnerBridge.log('checked if stable', { isStable });

          await SherloModule.clearFocus();
          RunnerBridge.log('cleared focus again');

          const inspectorData = await SherloModule.getInspectorData().catch((error) => {
            RunnerBridge.log('error getting inspector data', { error: error.message });
            throw error;
          });

          RunnerBridge.log('got inspector data', { inspectorData });

          const containsError = inspectorData.includes('Something went wrong rendering your story');

          RunnerBridge.log('requesting screenshot from master script', {
            action: 'REQUEST_SNAPSHOT',
            snapshotIndex: storyToTestData.storyIndex,
            hasError: containsError,
            inspectorData: !!inspectorData,
            isStable,
          });

          const response = await RunnerBridge.send({
            action: 'REQUEST_SNAPSHOT',
            snapshotIndex: storyToTestData.storyIndex,
            hasError: containsError,
            inspectorData,
            isStable,
            requestId: storyToTestData.requestId,
          });

          RunnerBridge.log('received screenshot from master script', response);

          if (response.nextSnapshotIndex !== undefined) {
            setStoryToTestData({
              requestId: response.requestId,
              storyIndex: response.nextSnapshotIndex,
            });
          }
        } catch (error) {
          // @ts-ignore
          RunnerBridge.log('story capturing failed', { errorMessage: error?.message });
        }
        // Sometimes even though the renderedStoryId is set, the story is not really yet rendered
        // so we wait additional 100ms
      }, 100);
    })();
  }, [renderedStoryId]);
}

export default useTestRenderedStoryAndSetNextOneToRender;
