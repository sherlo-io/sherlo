import { useEffect, useMemo, useRef, useState, ReactElement } from 'react';
import { Keyboard, Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { RunnerBridge, SherloModule } from '../helpers';
import { getGlobalStates } from '../utils';
import { Snapshot, StorybookParams, StorybookView } from '../types';
import { ErrorBoundary } from './components';
import { SherloContext } from './contexts';
import generateStorybookComponent from './generateStorybookComponent';
import { useKeyboardStatusEffect, useOriginalMode, useStoryEmitter, useTestingMode } from './hooks';
import { setupErrorSilencing } from './utils';

setupErrorSilencing();

function getStorybook(view: StorybookView, params?: StorybookParams): () => ReactElement {
  const SherloStorybook = () => {
    // Index of a snapshots that we want to render and test
    const [testedIndex, setTestedIndex] = useState<number>();
    // Index of a snapshots that is currently rendered
    const [renderedStoryId, setRenderedStoryId] = useState<string>();
    // List of all snapshots that we want to test
    const [snapshots, setSnapshots] = useState<Snapshot[]>();

    const mode = SherloModule.getInitialMode();

    // Safe area handling
    const [shouldAddSafeArea, setShouldAddSafeArea] = useState(mode === 'testing');
    const insets = useSafeAreaInsets();

    const renderedStoryHasError = useRef(false);

    const { waitForKeyboardStatus } = useKeyboardStatusEffect(RunnerBridge.log);

    const emitStory = useStoryEmitter({
      onEmit: (snapshot) => {
        setShouldAddSafeArea(!snapshot.parameters?.noSafeArea);
      },
      updateRenderedStoryId: (snapshot) => {
        RunnerBridge.log('rendered story', { id: snapshot.storyId });
        setRenderedStoryId(snapshot.storyId);
      },
    });

    const prepareSnapshotForTesting = async (snapshot: Snapshot): Promise<void> => {
      RunnerBridge.log('prepareSnapshotForTesting', { viewId: snapshot.viewId });

      if (snapshot.sherloParameters?.defocus) {
        RunnerBridge.log('defocusing focused input');

        await waitForKeyboardStatus('shown');

        if (Platform.OS === 'ios') {
          await waitForKeyboardStatus('hidden');
        } else {
          // We call Keyboard.dismiss() multiple times because for some reason it sometimes doesn't work on the first try
          for (let i = 0; i < 7; i++) {
            Keyboard.dismiss();
          }
        }
      }
    };

    // Testing mode
    useTestingMode(view, mode, setSnapshots, setTestedIndex, RunnerBridge);

    // When testedIndex changes and it's not equal to renderedStoryId, emit story
    useEffect(() => {
      if (mode === 'testing' && snapshots?.length && testedIndex !== undefined) {
        const testedSnapshot = snapshots[testedIndex];

        if (testedSnapshot.storyId !== renderedStoryId) {
          RunnerBridge.log('emitting story', {
            storyId: testedSnapshot.storyId,
            testedIndex,
          });

          emitStory(testedSnapshot);
        }
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mode, renderedStoryId, testedIndex, snapshots?.length]);

    // make screenshot attempts every time renderedStoryId is set
    useEffect(() => {
      if (
        !snapshots?.length ||
        renderedStoryId === undefined ||
        testedIndex === undefined ||
        renderedStoryId !== snapshots[testedIndex].storyId
      ) {
        return;
      }

      const renderedSnapshot = snapshots[testedIndex];

      RunnerBridge.log('attempt to test story', {
        testedIndex,
        renderedStoryId,
        renderedSnapshotViewId: renderedSnapshot.viewId,
      });

      const testStory = async (): Promise<void> => {
        await prepareSnapshotForTesting(renderedSnapshot);

        setTimeout(async () => {
          try {
            RunnerBridge.log('requesting screenshot from master script', {
              action: 'REQUEST_SNAPSHOT',
              snapshotIndex: testedIndex,
              hasError: renderedStoryHasError.current,
            });

            const response = await RunnerBridge.send({
              action: 'REQUEST_SNAPSHOT',
              snapshotIndex: testedIndex,
              hasError: renderedStoryHasError.current,
            });

            RunnerBridge.log('received screenshot from master script', response);

            if (response.nextSnapshotIndex !== undefined) {
              const nextSnapshot = snapshots[response.nextSnapshotIndex];

              setTestedIndex(response.nextSnapshotIndex);
              emitStory(nextSnapshot);
            }
          } catch (error) {
            RunnerBridge.log('story capturing failed', { error });
          }
        }, 100);
      };

      testStory();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [testedIndex, renderedStoryId]);

    // Original mode
    useOriginalMode(view, mode, setSnapshots);

    // Storybook memoized for specific mode
    const memoizedStorybook = useMemo(() => {
      RunnerBridge.log('memoizing storybook', {
        mode,
      });

      // create storybook component for specific mode
      const Storybook = generateStorybookComponent({
        view,
        params,
        storybookRenderMode: mode === 'testing' ? 'sherlo' : 'default',
      });

      return <Storybook />;
    }, [mode]);

    // Verification test
    if (getGlobalStates().isVerifySetupTest) {
      return (
        <View
          style={{
            ...StyleSheet.absoluteFillObject,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <Text>✔️ SHERLO SETUP WAS DONE CORRECTLY</Text>
        </View>
      );
    }

    return (
      <SafeAreaProvider>
        <SherloContext.Provider
          value={{
            renderedSnapshot: snapshots?.find(({ storyId }) => storyId === renderedStoryId),
            mode,
          }}
        >
          <View
            style={[StyleSheet.absoluteFillObject, shouldAddSafeArea && { paddingTop: insets.top }]}
          >
            <ErrorBoundary
              onError={() => {
                renderedStoryHasError.current = true;
              }}
              log={RunnerBridge.log}
            >
              {memoizedStorybook}
            </ErrorBoundary>
          </View>
        </SherloContext.Provider>
      </SafeAreaProvider>
    );
  };

  return SherloStorybook;
}

export default getStorybook;
