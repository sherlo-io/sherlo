/**
 * WHAT THE APP'S OWN VIEWS ARE, published out of the renderer for the road that has no renderer on
 * it.
 *
 * Every view of the app on screen carries facts only the fibers know: the story id on the view
 * Storybook wraps the story in, the style and the testID a view was given, whether it draws an
 * image loaded over the network. The component that renders the app collects those facts and hands
 * them to whoever asks (./getStorybook/components/TestingMode/MetadataProvider).
 *
 * A test run asks through a React ref, because it runs inside the renderer and has one to hold. A
 * capture is plain JavaScript, started before any component mounts, so it has no ref: the collector
 * is published here instead and read back when a story is captured. This is the same seam
 * ./componentNames is for the app's component names, and the same one ./storyErrorRegistry is for a
 * broken story.
 *
 * This file keeps no React: it is the seam, not a reader.
 */
import type { Metadata } from './getStorybook/components/TestingMode/MetadataProvider';

/** How the app's views are read while the component that renders them is mounted. */
type CollectAppMetadata = () => Metadata;

/** The reading of the app currently on screen, or nothing while no app renders. */
let theCollector: CollectAppMetadata | undefined;

/** The app is rendered and its views can be read this way; `undefined` forgets the reading. */
export function rememberAppMetadataCollector(collect: CollectAppMetadata | undefined): void {
  theCollector = collect;
}

/**
 * Publish the app's reading of its views for as long as the app is rendered, and withdraw it when it
 * is not. Returns the withdrawal, which is what the effect that called this hands back to React.
 *
 * The two halves belong together because a reading left behind is worse than none at all: the next
 * capture would read a renderer that is no longer there and answer from views that are gone.
 */
export function publishAppMetadata(theAppsReading: CollectAppMetadata): () => void {
  rememberAppMetadataCollector(theAppsReading);
  return () => rememberAppMetadataCollector(undefined);
}

/**
 * The app's views as the renderer that drew them reads them - every view by its native tag, with
 * the story id it carries - or nothing before the app has rendered.
 */
export function collectAppMetadata(): Metadata | undefined {
  return theCollector?.();
}
