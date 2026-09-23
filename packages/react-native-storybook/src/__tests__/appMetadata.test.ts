/**
 * THE SEAM THE APP'S OWN VIEWS ARE PUBLISHED ON - what a capture reads when it has no renderer.
 *
 * A test run reads the app's views through a React ref it holds inside the renderer. A capture is
 * plain JavaScript started before anything mounts, so it has no ref: it reads whatever the mounted
 * provider published here (see the write side in
 * ../getStorybook/components/TestingMode/MetadataProvider).
 *
 * WHAT IS HELD HERE IS THE PUBLISHING ITSELF, which is the half a capture depends on and the half
 * nothing else reads. The reading of the views - which native tag carries which class, and what is
 * on screen in words - is the provider's own work and is read off the fibers.
 *
 * The component that publishes is not rendered in this test: this package has no React renderer
 * installed, and no test in it mounts a component. The sibling seam for the app's component names
 * (./componentNames.test.ts) is held the same way, and for the same reason.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { collectAppMetadata, rememberAppMetadataCollector } from '../appMetadata';
import type { Metadata } from '../getStorybook/components/TestingMode/MetadataProvider';

/** What the app published about itself, as the provider builds it: views by tag, and the words. */
const THE_APPS_VIEWS: Metadata = {
  viewProps: { 5: { className: 'RCTText', testID: 'components-button--primary' } },
  texts: ['Primary'],
};

const OTHER_VIEWS: Metadata = {
  viewProps: { 7: { className: 'RCTView' } },
  texts: [],
};

// The seam is one module the whole app shares, so a test that published an app has to forget it
// again or every test after it reads an app that is no longer on screen.
afterEach(() => rememberAppMetadataCollector(undefined));

describe('the app publishes its own views where a capture can read them', () => {
  it('reads the app back for as long as it is rendered', () => {
    rememberAppMetadataCollector(() => THE_APPS_VIEWS);

    // A capture reads the same reading the provider would have answered its own renderer with.
    expect(collectAppMetadata()).toEqual(THE_APPS_VIEWS);
  });

  it('reads nothing once the app is gone', () => {
    rememberAppMetadataCollector(() => THE_APPS_VIEWS);
    expect(collectAppMetadata()).toEqual(THE_APPS_VIEWS);

    // The provider hands this back to React as its unmount cleanup. A reading left behind would be
    // a capture answering from views that are no longer on screen.
    rememberAppMetadataCollector(undefined);
    expect(collectAppMetadata()).toBeUndefined();
  });

  it('reads the app that is on screen now, not the one before it', () => {
    rememberAppMetadataCollector(() => THE_APPS_VIEWS);

    // The provider's fiber changes as the app re-renders, which publishes a fresh reading.
    rememberAppMetadataCollector(() => OTHER_VIEWS);

    expect(collectAppMetadata()).toEqual(OTHER_VIEWS);
  });
});
