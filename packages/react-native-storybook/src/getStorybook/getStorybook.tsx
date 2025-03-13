import { useEffect, useMemo, useState, ReactElement } from 'react';
import { StyleSheet, Text, useColorScheme, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Theme, ThemeProvider, darkTheme, theme } from '@storybook/react-native-theming';
import { RunnerBridge, SherloModule } from '../helpers';
import { Snapshot, StorybookParams, StorybookView } from '../types';
import { SherloContext } from './contexts';
import generateStorybookComponent from './generateStorybookComponent';
import { useHideSplashScreen, useOriginalMode, useStoryEmitter, useTestingMode } from './hooks';
import { setupErrorSilencing } from './utils';
import deepmerge from 'deepmerge';
import { Layout } from './components';
import { VERIFICATION_TEST_ID } from '../constants';

setupErrorSilencing();

function getStorybook(view: StorybookView, params?: StorybookParams): () => ReactElement {
  const SherloStorybook = () => {
    // Index of a snapshots that we want to render and test
    const [testedIndex, setTestedIndex] = useState<number>();
    // Index of a snapshots that is currently rendered
    const [renderedStoryId, setRenderedStoryId] = useState<string>();
    // List of all snapshots that we want to test
    const [snapshots, setSnapshots] = useState<Snapshot[]>();

    const mode = SherloModule.getMode();
    const config = SherloModule.getConfig();

    // Safe area handling
    const [shouldAddSafeArea, setShouldAddSafeArea] = useState(mode === 'testing');
    const [currentRequestId, setCurrentRequestId] = useState<string>();

    const colorScheme = useColorScheme();
    const defaultTheme = colorScheme === 'dark' ? darkTheme : theme;
    const [appliedTheme, setAppliedTheme] = useState(defaultTheme);

    const emitStory = useStoryEmitter({
      updateRenderedStoryId: (storyId) => {
        RunnerBridge.log('rendered story', { id: storyId });
        setRenderedStoryId(storyId);
      },
    });

    useHideSplashScreen();

    // Testing mode
    useTestingMode(view, mode, setSnapshots, setTestedIndex, setCurrentRequestId, RunnerBridge);

    // When testedIndex changes and it's not equal to renderedStoryId, emit story
    useEffect(() => {
      if (mode === 'testing' && snapshots?.length && testedIndex !== undefined) {
        const testedSnapshot = snapshots[testedIndex];

        if (testedSnapshot.storyId !== renderedStoryId) {
          RunnerBridge.log('emitting story', {
            storyId: testedSnapshot.storyId,
            testedIndex,
          });

          setShouldAddSafeArea(!testedSnapshot.parameters?.noSafeArea);
          setAppliedTheme(deepmerge(defaultTheme, testedSnapshot.parameters?.theme ?? {}));
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
        setTimeout(async () => {
          try {
            if (!currentRequestId) {
              throw new Error('No current request ID');
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

            const containsError = inspectorData.includes(
              'Something went wrong rendering your story'
            );

            RunnerBridge.log('requesting screenshot from master script', {
              action: 'REQUEST_SNAPSHOT',
              snapshotIndex: testedIndex,
              hasError: containsError,
              inspectorData: !!inspectorData,
              isStable,
            });

            const response = await RunnerBridge.send({
              action: 'REQUEST_SNAPSHOT',
              snapshotIndex: testedIndex,
              hasError: containsError,
              inspectorData,
              isStable,
              requestId: currentRequestId,
            });

            RunnerBridge.log('received screenshot from master script', response);

            if (response.nextSnapshotIndex !== undefined) {
              const nextSnapshot = snapshots[response.nextSnapshotIndex];

              setCurrentRequestId(response.requestId);
              setShouldAddSafeArea(!nextSnapshot.parameters?.noSafeArea);
              setAppliedTheme(deepmerge(defaultTheme, nextSnapshot.parameters?.theme ?? {}));
              setTestedIndex(response.nextSnapshotIndex);
              emitStory(nextSnapshot);
            }
          } catch (error) {
            // @ts-ignore
            RunnerBridge.log('story capturing failed', { errorMessage: error?.message });
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
    if (mode === 'verification') {
      return (
        <View
          testID={VERIFICATION_TEST_ID}
          style={{
            ...StyleSheet.absoluteFillObject,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <Text>✔️ SHERLO SETUP WAS DONE CORRECTLY</Text>
          <Text>make sure to remove addVerificationMenuItem from your code now</Text>
        </View>
      );
    }

    // ThemeProvider setup reflects original setup from the storybook package
    // We need to replicate it to assure it's working in the same way as in onDeviceUI mode
    // https://github.com/storybookjs/react-native/blob/next/packages/react-native/src/View.tsx
    return (
      <ThemeProvider theme={appliedTheme as Theme}>
        <SafeAreaProvider>
          <SherloContext.Provider
            value={{
              renderedSnapshot: snapshots?.find(({ storyId }) => storyId === renderedStoryId),
              mode,
            }}
          >
            <Layout shouldAddSafeArea={shouldAddSafeArea}>{memoizedStorybook}</Layout>
          </SherloContext.Provider>
        </SafeAreaProvider>
      </ThemeProvider>
    );
  };

  return SherloStorybook;
}

export default getStorybook;
