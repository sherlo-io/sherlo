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

import { Story, StorybookView, getStorybookUIType } from '../../types';

setupErrorSilencing();

export type Mode = 'app' | 'testing' | 'preview' | 'original' | 'verification';

const withSherlo =
  (view: StorybookView, getStorybookUIArgs: Parameters<getStorybookUIType>[0]) =>
  (): ReactElement => {
    const [testedIndex, setTestedIndex] = useState<number>();
    const [renderedStoryId, setRenderedStoryId] = useState<string>();
    const [stories, setStories] = useState<Story[]>();
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

    const prepareStory = async (story: any): Promise<boolean> => {
      runnerBridge.log('prepareStory', { storyId: story.id });

      if (story.parameters.sherlo?.defocus) {
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
      stories,
      setMode,
      emitStory,
      prepareStory,
      sherloEffectExecution,
      mode
    );

    // Testing mode
    useTestingMode(view, mode, setStories, setTestedIndex, runnerBridge);

    useEffect(() => {
      if (
        mode === 'testing' &&
        stories &&
        testedIndex !== undefined &&
        renderedStoryId !== undefined
      ) {
        const testedStory = stories[testedIndex];

        if (testedStory.storyId !== renderedStoryId) {
          runnerBridge.log('emitting story', {
            id: testedStory.storyId,
            testedIndex,
          });

          emitStory(testedStory.storyId);
        }
      }
    }, [mode, renderedStoryId, testedIndex]);

    // make screenshot attempts every time renderedStoryId is set
    useEffect(() => {
      if (
        !stories ||
        renderedStoryId === undefined ||
        testedIndex === undefined ||
        renderedStoryId !== stories[testedIndex].storyId
      ) {
        return;
      }

      const selectedStory = stories[testedIndex];

      runnerBridge.log('attempt to test story', {
        storiesLength: stories?.length,
        testedIndex,
        renderedStoryId,
        selectedStoryId: selectedStory.id,
      });

      if (selectedStory.storyId === renderedStoryId) {
        const testStory = async (): Promise<void> => {
          const hasSherloEffect = await prepareStory(stories[testedIndex]);

          setTimeout(
            async () => {
              try {
                runnerBridge.log('requesting screenshot from master script');

                const testedStory = stories[testedIndex];

                if (testedStory !== undefined) {
                  // dont change to destructed arguments, it will fail when sherlo object is undefined
                  const figmaUrl = testedStory.parameters?.sherlo?.figmaUrl;

                  const nextIndex = testedIndex + 1;
                  const nextStory = stories[nextIndex];

                  const nextState = {
                    index: nextIndex,
                    storyId: nextStory?.id,
                    storyDisplayName: nextStory?.displayName,
                    timestamp: Date.now(),
                  };

                  await runnerBridge.send({
                    action: 'REQUEST_SNAPSHOT',
                    displayName: testedStory.displayName,
                    id: testedStory.id,
                    figmaUrl,
                    hasError: renderedStoryHasError.current,
                    nextState,
                  });

                  runnerBridge.updateState(nextState, true);

                  runnerBridge.log('received screenshot from master script');

                  // for android we dont go to next story because runner resets the app with new statexp
                  if (Platform.OS === 'ios') {
                    // go to next story
                    if (testedIndex + 1 < stories.length) {
                      setTestedIndex(nextIndex);
                      emitStory(nextStory.storyId);
                    } else {
                      await runnerBridge.send({ action: 'END' });
                    }
                  }
                } else {
                  runnerBridge.log('will send END signal', {
                    testedIndex,
                    storiesLength: stories.length,
                  });
                  await runnerBridge.send({ action: 'END' });
                }
              } catch (error) {
                runnerBridge.log('story capturing failed', { error });
              }
            },
            hasSherloEffect ? 10 * 1000 : 100
          );
        };

        testStory();
      }
    }, [testedIndex, renderedStoryId]);

    // Original mode
    useOriginalMode(view, mode, setStories);

    // Storybook memoized for specific mode
    const memoizedStorybook = React.useMemo(() => {
      const testedStory = stories?.[testedIndex || 0];
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
        getStorybookUIArgs,
        mode,
        initialSelection: testedStory?.storyId,
      });

      return <Storybook />;
    }, [mode, testedIndex === undefined, stories === undefined]);

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
          renderedStory: stories?.find(({ id }) => id === renderedStoryId),
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

export default withSherlo;
