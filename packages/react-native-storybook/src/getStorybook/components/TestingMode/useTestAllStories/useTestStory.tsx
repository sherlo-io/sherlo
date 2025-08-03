import { useEffect } from 'react';
import { RunnerBridge } from '../../../../helpers';
import SherloModule from '../../../../SherloModule';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isStorybook7 } from '../../../helpers';
import { MetadataProviderRef } from '../MetadataProvider';
import { prepareInspectorData } from './prepareInspectorData';

function useTestStory({
  metadataProviderRef,
}: {
  metadataProviderRef: React.RefObject<MetadataProviderRef>;
}): void {
  const config = SherloModule.getConfig();
  const lastState = SherloModule.getLastState();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    (async (): Promise<void> => {
      try {
        if (!lastState) return;

        const { nextSnapshot, requestId } = lastState;

        RunnerBridge.log('attempt to test story', {
          nextSnapshot,
          requestId,
        });

        // We wait until the story is displayed in the UI
        // before we start stabilizing and taking screenshots
        // This is to avoid taking screenshots of the loading state
        let storyIsDisplayed = false;
        let waitCount = 0;
        do {
          await new Promise((resolve) => setTimeout(resolve, 500));
          waitCount++;

          const controlFabricMetadata = JSON.stringify(
            metadataProviderRef?.current?.collectMetadata()
          );

          if (controlFabricMetadata.includes(nextSnapshot.storyId)) {
            RunnerBridge.log('story is displayed', {
              waitCount,
            });
            storyIsDisplayed = true;
          } else {
            RunnerBridge.log('story is not displayed', {
              waitCount,
            });
          }
        } while (!storyIsDisplayed);

        const isStable = await SherloModule.stabilize(
          config.stabilization.requiredMatches,
          config.stabilization.minScreenshotsCount,
          config.stabilization.intervalMs,
          config.stabilization.timeoutMs,
          !!config.stabilization.saveScreenshots,
          config.stabilization.threshold,
          config.stabilization.includeAA
        ).catch((error) => {
          RunnerBridge.log('error checking if stable', { error: error.message });
          throw error;
        });

        RunnerBridge.log('checked if stable', { isStable });

        let inspectorData;
        while (!inspectorData) {
          inspectorData = await SherloModule.getInspectorData().catch((error) => {
            RunnerBridge.log('error getting inspector data', { error: JSON.stringify(error) });
          });
        }

        RunnerBridge.log('got inspector data');

        const fabricMetadata = metadataProviderRef?.current?.collectMetadata();

        RunnerBridge.log('got fabric metadata');

        const containsError = fabricMetadata?.texts.includes(
          'Something went wrong rendering your story'
        );

        let finalInspectorData = inspectorData;
        let hasRemoteImage = false;
        let hasRemoteVideo = false;
        let safeAreaMetadata;

        if (!containsError) {
          if (fabricMetadata) {
            const preparedInspectorData = prepareInspectorData(
              inspectorData,
              fabricMetadata,
              nextSnapshot.storyId
            );
            finalInspectorData = preparedInspectorData.inspectorData;
            hasRemoteImage = preparedInspectorData.hasRemoteImage;
            hasRemoteVideo = preparedInspectorData.hasRemoteVideo;
          }

          safeAreaMetadata = {
            shouldAddSafeArea: !nextSnapshot.parameters?.noSafeArea,
            insetBottom: Math.round(insets.bottom * finalInspectorData.density),
            insetTop: Math.round(insets.top * finalInspectorData.density),
            isStorybook7,
          };
        }

        RunnerBridge.log('inspector data', {
          fabricMetadata,
          inspectorData,
          finalInspectorData,
        });

        RunnerBridge.log('requesting screenshot from master script', {
          action: 'REQUEST_SNAPSHOT',
          hasError: containsError,
          finalInspectorData: !!finalInspectorData,
          isStable,
          requestId: requestId,
          safeAreaMetadata,
          hasRemoteImage,
          hasRemoteVideo,
        });

        await RunnerBridge.send({
          action: 'REQUEST_SNAPSHOT',
          hasError: containsError,
          inspectorData: JSON.stringify(finalInspectorData),
          isStable,
          requestId: requestId,
          safeAreaMetadata,
          hasRemoteImage,
          hasRemoteVideo,
        });
      } catch (error) {
        // @ts-ignore
        RunnerBridge.log('story capturing failed', { errorMessage: error?.message });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

export default useTestStory;
