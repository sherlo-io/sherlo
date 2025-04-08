import { useEffect } from 'react';
import { RunnerBridge, SherloModule } from '../../../../helpers';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isStorybook7 } from '../../../helpers';
import { MetadataCollectorRef } from '../MetadataCollector';
import { enhanceInspectorDataWithJsProperties } from './enhanceInspectorData';

function useTestStory(metadataCollectorRef: React.RefObject<MetadataCollectorRef>): void {
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

        const isStable = await SherloModule.stabilize(
          config.stabilization.requiredMatches,
          config.stabilization.intervalMs,
          config.stabilization.timeoutMs
        ).catch((error) => {
          RunnerBridge.log('error checking if stable', { error: error.message });
          throw error;
        });

        RunnerBridge.log('checked if stable', { isStable });

        const inspectorData = await SherloModule.getInspectorData().catch((error) => {
          RunnerBridge.log('error getting inspector data', { error: error.message });
          throw error;
        });

        const metadataTree = metadataCollectorRef.current?.collectMetadata();

        // Enhance the inspector data with JS properties from metadata
        const enhancedInspectorData = metadataTree
          ? enhanceInspectorDataWithJsProperties(JSON.parse(inspectorData), metadataTree)
          : JSON.parse(inspectorData);

        RunnerBridge.log('got inspector data', { inspectorData: enhancedInspectorData });

        const containsError = inspectorData.includes('Something went wrong rendering your story');

        RunnerBridge.log('requesting screenshot from master script', {
          action: 'REQUEST_SNAPSHOT',
          hasError: containsError,
          inspectorData: !!enhancedInspectorData,
          isStable,
        });

        await RunnerBridge.send({
          action: 'REQUEST_SNAPSHOT',
          hasError: containsError,
          inspectorData: JSON.stringify(enhancedInspectorData),
          isStable,
          requestId: requestId,
          safeAreaMetadata: {
            shouldAddSafeArea: !nextSnapshot.parameters?.noSafeArea,
            insetBottom: insets.bottom,
            insetTop: insets.top,
            isStorybook7,
          },
        });
      } catch (error) {
        // @ts-ignore
        RunnerBridge.log('story capturing failed', { errorMessage: error?.message });
      }
    })();
  }, []);
}

export default useTestStory;
