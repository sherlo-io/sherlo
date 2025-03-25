import { useEffect } from 'react';
import { RunnerBridge, SherloModule } from '../../../../helpers';

function useTestStory(): void {
  const config = SherloModule.getConfig();
  const lastState = SherloModule.getLastState();

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

        RunnerBridge.log('got inspector data', { inspectorData });

        const containsError = inspectorData.includes('Something went wrong rendering your story');

        RunnerBridge.log('requesting screenshot from master script', {
          action: 'REQUEST_SNAPSHOT',
          hasError: containsError,
          inspectorData: !!inspectorData,
          isStable,
        });

        await RunnerBridge.send({
          action: 'REQUEST_SNAPSHOT',
          hasError: containsError,
          inspectorData,
          isStable,
          requestId: requestId,
        });
      } catch (error) {
        // @ts-ignore
        RunnerBridge.log('story capturing failed', { errorMessage: error?.message });
      }
    })();
  }, []);
}

export default useTestStory;
