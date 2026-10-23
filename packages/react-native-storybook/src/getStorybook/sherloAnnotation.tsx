/**
 * SHERLO'S PREVIEW ANNOTATION: what Sherlo adds to every story, through Storybook's public way of
 * adding to them.
 *
 * Sherlo's start wrapper (metro/applySherloTransforms.js) hands it to Storybook's start() after the
 * project's own annotations, so its decorator is the innermost of the project's, right around the
 * story. Storybook awaits every loader before it renders a story, which is what lets one loader
 * install a story's mocks in time, whoever picked the story: the runner, `sherlo open`, a person
 * in the story browser, or Storybook itself as it starts.
 */
import React from 'react';
import SherloModule from '../SherloModule';
import SherloStoryErrorBoundary from './components/SherloStoryErrorBoundary';
import { StoryOfTheApp } from '../storyOfTheApp';
import { activateMocksForStory } from './storyMockActivation';

/** As much of the context Storybook hands a decorator or a loader as Sherlo reads: the story's id. */
type StoryContext = { id: string };

/**
 * In testing mode, wrap the story in Sherlo's error boundary, which records what it throws, and in
 * the component that marks where the app's own views start. Anywhere else, the story as it is.
 */
function wrapStoryForTesting(
  Story: React.ComponentType,
  context: StoryContext
): React.ReactElement {
  if (SherloModule.getMode() !== 'testing') return <Story />;

  return (
    <SherloStoryErrorBoundary storyId={context.id}>
      <StoryOfTheApp>
        <Story />
      </StoryOfTheApp>
    </SherloStoryErrorBoundary>
  );
}

/** Install the story's mocks; Storybook renders it only once they are in. */
async function installStoryMocks(context: StoryContext): Promise<void> {
  await activateMocksForStory(context.id);
}

/** In testing mode, hold the story back by the run's initialStoryRenderDelayMs, when it sets one. */
async function waitTheRunsRenderDelay(): Promise<void> {
  if (SherloModule.getMode() !== 'testing') return;

  const delayMs = SherloModule.getConfigOrDefault().initialStoryRenderDelayMs;
  if (delayMs === undefined) return;
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}

const sherloAnnotation = {
  decorators: [wrapStoryForTesting],
  loaders: [installStoryMocks, waitTheRunsRenderDelay],
};

export default sherloAnnotation;
