import { useEffect } from 'react';
import { RunnerBridge, SherloModule } from '../../../../helpers';
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
      setTimeout(async () => {
        console.log('getInspectorData');

        const inspectorData = await SherloModule.getInspectorData();

        console.log(
          JSON.stringify(
            {
              inspectorData,
            },
            null,
            2
          )
        );

        const fabricMetadata = await metadataProviderRef?.current?.collectMetadata();

        if (fabricMetadata) {
          const finalInspectorData = prepareInspectorData(
            inspectorData,
            fabricMetadata,
            lastState?.nextSnapshot.storyId || ''
          );

          console.log(
            JSON.stringify(
              {
                // storyId: lastState?.nextSnapshot.storyId,
                fabricMetadata,
                inspectorData,
                finalInspectorData,
              },
              null,
              2
            )
          );
        }
      }, 1000);

      try {
        if (!lastState) return;

        const { nextSnapshot, requestId } = lastState;

        RunnerBridge.log('attempt to test story', {
          nextSnapshot,
          requestId,
        });

        const isStable = await SherloModule.stabilize(
          config.stabilization.requiredMatches,
          config.stabilization.intervalMs,
          config.stabilization.timeoutMs,
          !!config.stabilization.saveScreenshots
        ).catch((error) => {
          RunnerBridge.log('error checking if stable', { error: error.message });
          throw error;
        });

        RunnerBridge.log('checked if stable', { isStable });

        const inspectorData = await SherloModule.getInspectorData().catch((error) => {
          RunnerBridge.log('error getting inspector data', { error: error.message });
          throw error;
        });

        const fabricMetadata = metadataProviderRef?.current?.collectMetadata();

        const containsError = fabricMetadata?.texts.includes(
          'Something went wrong rendering your story'
        );

        let finalInspectorData = undefined;
        let safeAreaMetadata = undefined;

        if (!containsError) {
          finalInspectorData = fabricMetadata
            ? prepareInspectorData(inspectorData, fabricMetadata, nextSnapshot.storyId)
            : inspectorData;

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
        });

        await RunnerBridge.send({
          action: 'REQUEST_SNAPSHOT',
          hasError: containsError,
          inspectorData: JSON.stringify(finalInspectorData),
          isStable,
          requestId: requestId,
          safeAreaMetadata,
        });
      } catch (error) {
        // @ts-ignore
        RunnerBridge.log('story capturing failed', { errorMessage: error?.message });
      }
    })();
  }, []);
}

export default useTestStory;
