/**
 * THE RUNNER'S WALK OF A LAUNCH'S STORY, shared by the Storybook road (useTestStory) and an app of
 * scenes and no Storybook (./sceneBoot): the one place that says when a runner drives a boot and
 * how the story is handed to the sealed core and answered.
 */
import { bundlerOrigin } from './bundlerOrigin';
import { clearMocks } from './mocking';
import { getSealedCore } from './sealedCore/loadSealedCore';
import type { Metadata, SafeAreaInsets } from './sealedCore/seam';

/**
 * Whether a runner drives this boot. A capture's boot produces the same `config`/`lastState` shape
 * a run's does, but a capture is asked for by a bundler and its bundle came from that bundler,
 * while a run installs a build whose bundle is loaded from the device.
 */
export function isDrivenByRunner(): boolean {
  return bundlerOrigin() === null;
}

/**
 * The launch's story goes to the sealed core, which waits until it is ready and reports it to the
 * runner. However the walk ended, every mocked module passes through to its real implementation
 * again (IS-07).
 */
export async function walkTheStoryForTheRunner(story: {
  insets: SafeAreaInsets;
  collectMetadata: () => Metadata | undefined;
}): Promise<void> {
  try {
    const core = getSealedCore();
    if (!core) return;

    await core.testStory(story);
  } finally {
    clearMocks();
  }
}
