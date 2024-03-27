import React, { ReactElement, useEffect, useRef, useState } from 'react';
import { Keyboard, Platform, StyleSheet, Text, View } from 'react-native';
import SherloEffectContext from '../../contexts/SherloEffectContext';
import { useMode } from '../withStorybook/ModeProvider';
import useRunnerBridge from '../../runnerBridge/useRunnerBridge';
import getGlobalStates from '../../utils/getGlobalStates';
import ErrorBoundary from './components/ErrorBoundry';
import SherloContext from './contexts/SherloContext';
import generateStorybookComponent from './generateStorybookComponent';
import {
  useAddon,
  useKeyboardStatusEffect,
  useOriginalMode,
  usePreviewMode,
  useSherloEffectExecutionEffect,
  useStoryEmitter,
  useTestingMode,
} from './hooks';
import setupErrorSilencing from './utils/setupErrorSilecing';

import { Snapshot, StorybookParams, StorybookView } from '../../types';

setupErrorSilencing();

const withSherlo = (view: StorybookView, params?: StorybookParams) => {
  const SherloStorybook = (): ReactElement => {
    // Index of a snapshots that we want to render and test
    const [testedIndex, setTestedIndex] = useState<number>();
    // Index of a snapshots that is currently rendered
    const [renderedStoryId, setRenderedStoryId] = useState<string>();
    // List of all snapshots that we want to test
    const [snapshots, setSnapshots] = useState<Snapshot[]>();

    const { mode, setMode } = useMode();
    const runnerBridge = useRunnerBridge(mode);

    const renderedStoryHasError = useRef(false);

    const { waitForKeyboardStatus } = useKeyboardStatusEffect(runnerBridge.log);
    const sherloEffectExecution = useSherloEffectExecutionEffect(runnerBridge.log);

    const emitStory = useStoryEmitter((id) => {
      runnerBridge.log('rendered story', { id });
      setRenderedStoryId(id);
    });

    useAddon({
      onPreviewStoryPress: () => {
        runnerBridge.log('setting preview mode');
        setMode('preview');
      },
    });

    const prepareSnapshotForTesting = async (snapshot: Snapshot): Promise<boolean> => {
      runnerBridge.log('prepareSnapshotForTesting', { viewId: snapshot.viewId });

      if (snapshot.sherloParameters?.defocus) {
        runnerBridge.log('defocusing focused input');

        await waitForKeyboardStatus('shown');

        if (Platform.OS === 'ios') {
          await waitForKeyboardStatus('hidden');
        } else {
          Keyboard.dismiss();
          Keyboard.dismiss();
          Keyboard.dismiss();
          Keyboard.dismiss();
          Keyboard.dismiss();
          Keyboard.dismiss();
          Keyboard.dismiss();
        }
      }

      const hasSherloEffect = await sherloEffectExecution.execute();

      return hasSherloEffect;
    };

    // Preview mode
    usePreviewMode(
      runnerBridge,
      renderedStoryId,
      testedIndex,
      snapshots,
      setMode,
      emitStory,
      prepareSnapshotForTesting,
      sherloEffectExecution,
      mode
    );

    // Testing mode
    useTestingMode(view, mode, setSnapshots, setTestedIndex, runnerBridge);

    // When testedIndex changes and it's not equal to renderedStoryId, emit story
    useEffect(() => {
      if (
        mode === 'testing' &&
        snapshots?.length &&
        testedIndex !== undefined &&
        // we only want to emit story if first story was already rendered by storybook initialization process
        renderedStoryId !== undefined
      ) {
        const testedSnapshot = snapshots[testedIndex];

        if (testedSnapshot.storyId !== renderedStoryId) {
          runnerBridge.log('emitting story', {
            storyId: testedSnapshot.storyId,
            testedIndex,
          });

          emitStory(testedSnapshot.storyId);
        }
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mode, renderedStoryId, testedIndex]);

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

      runnerBridge.log('attempt to test story', {
        testedIndex,
        renderedStoryId,
        renderedSnapshotViewId: renderedSnapshot.viewId,
      });

      const testStory = async (): Promise<void> => {
        const hasSherloEffect = await prepareSnapshotForTesting(renderedSnapshot);

        setTimeout(
          async () => {
            try {
              runnerBridge.log('requesting screenshot from master script', {
                action: 'REQUEST_SNAPSHOT',
                snapshotIndex: testedIndex,
                hasError: renderedStoryHasError.current,
              });

              const response = await runnerBridge.send({
                action: 'REQUEST_SNAPSHOT',
                snapshotIndex: testedIndex,
                hasError: renderedStoryHasError.current,
              });

              runnerBridge.log('received screenshot from master script', response);

              // This is to please TS, we should change typings so it's obvious what should be returned
              if (response?.action !== 'ACK_REQUEST_SNAPSHOT') {
                throw new Error('ACK_REQUEST_SNAPSHOT not received');
              }

              if (response.nextSnapshotIndex) {
                setTestedIndex(response.nextSnapshotIndex);

                const nextSnpashot = snapshots[response.nextSnapshotIndex];
                emitStory(nextSnpashot.storyId);
              }
            } catch (error) {
              runnerBridge.log('story capturing failed', { error });
            }
          },
          hasSherloEffect ? 10 * 1000 : 100
        );
      };

      testStory();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [testedIndex, renderedStoryId]);

    // Original mode
    useOriginalMode(view, mode, setSnapshots);

    // Storybook memoized for specific mode
    const memoizedStorybook = React.useMemo(() => {
      const testedStory = snapshots?.[testedIndex || 0];
      runnerBridge.log('memoizing storybook', {
        mode,
        testedIndex,
        testedStory,
        nullStorybook: testedStory === undefined || testedIndex === undefined || mode === undefined,
      });

      if (testedStory) {
        emitStory(testedStory.storyId);
      }

      // create storybook component for specific mode
      const Storybook = generateStorybookComponent({
        view,
        params,
        mode,
        initialSelection: testedStory?.storyId,
      });

      return <Storybook />;
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mode, testedIndex === undefined, snapshots === undefined]);

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
      <SherloContext.Provider
        value={{
          renderedSnapshot: snapshots?.find(({ storyId }) => storyId === renderedStoryId),
          mode,
        }}
      >
        <View style={StyleSheet.absoluteFillObject}>
          <ErrorBoundary
            onError={() => {
              renderedStoryHasError.current = true;
            }}
            log={runnerBridge.log}
          >
            <SherloEffectContext.Provider
              value={{
                log: runnerBridge.log,
                handleSherloEffect: sherloEffectExecution.register,
              }}
            >
              {memoizedStorybook}
            </SherloEffectContext.Provider>
          </ErrorBoundary>
        </View>
      </SherloContext.Provider>
    );
  };

  SherloStorybook.storage = params?.storage as any;

  return SherloStorybook;
};

export default withSherlo;
