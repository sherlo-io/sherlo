/**
 * SHERLO'S PREVIEW ANNOTATION: what Sherlo adds to every story, through Storybook's public way of
 * adding to them.
 *
 * Sherlo's start wrapper (metro/applySherloTransforms.js) hands it to Storybook's start() after the
 * project's own annotations, so its decorator is the innermost of the project's, right around the
 * story. On React Native Storybook does NOT await loaders before its first render: its view sets
 * the first story's context at once, so a loader's promise is awaited by nobody. The decorator
 * therefore holds the story itself, whoever picked it - the runner, `sherlo open`, a person in the
 * story browser, or Storybook as it starts - until the story's mocks are installed.
 */
import React from 'react';
import RunnerBridge from '../helpers/RunnerBridge';
import SherloModule from '../SherloModule';
import SherloStoryErrorBoundary from './components/SherloStoryErrorBoundary';
import { StoryOfTheApp } from '../storyOfTheApp';
import { activateMocksForStory } from './storyMockActivation';

/** As much of the context Storybook hands a decorator as Sherlo reads: the story's id. */
type StoryContext = { id: string };

/**
 * Install the story's mocks, then, in testing mode, wait out the run's initialStoryRenderDelayMs
 * when it sets one. An install that throws is logged and does not hold the story any longer.
 */
export async function prepareStoryForRender(storyId: string): Promise<void> {
  try {
    await activateMocksForStory(storyId);
  } catch (error) {
    RunnerBridge.log('Installing the story mocks failed', { storyId, error: String(error) });
  }

  if (SherloModule.getMode() !== 'testing') return;

  const delayMs = SherloModule.getConfigOrDefault().initialStoryRenderDelayMs;
  if (delayMs === undefined) return;
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}

/**
 * Render nothing until the story's mocks are installed, then the story, mounted fresh for each
 * story id: a story that reads a mocked module once, as it mounts, reads the mock.
 */
function HoldStoryForItsMocks({
  storyId,
  renderStory,
}: {
  storyId: string;
  renderStory: () => React.ReactElement;
}): React.ReactElement | null {
  const [preparedStoryId, setPreparedStoryId] = React.useState<string | undefined>(undefined);

  React.useEffect(() => {
    let storyChanged = false;
    prepareStoryForRender(storyId).then(() => {
      if (!storyChanged) setPreparedStoryId(storyId);
    });
    return () => {
      storyChanged = true;
    };
  }, [storyId]);

  if (preparedStoryId !== storyId) return null;
  return <React.Fragment key={storyId}>{renderStory()}</React.Fragment>;
}

/**
 * Hold the story for its mocks. In testing mode, also wrap it in Sherlo's error boundary, which
 * records what it throws, and in the component that marks where the app's own views start.
 */
function holdStoryForItsMocks(
  Story: React.ComponentType,
  context: StoryContext
): React.ReactElement {
  const held = <HoldStoryForItsMocks storyId={context.id} renderStory={() => <Story />} />;
  if (SherloModule.getMode() !== 'testing') return held;

  return (
    <SherloStoryErrorBoundary storyId={context.id}>
      <StoryOfTheApp>{held}</StoryOfTheApp>
    </SherloStoryErrorBoundary>
  );
}

const sherloAnnotation = {
  decorators: [holdStoryForItsMocks],
};

export default sherloAnnotation;
