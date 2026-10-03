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

/**
 * When the component that publishes here (MetadataProvider) first rendered in this boot -
 * `Date.now()` at the first call this file ever saw with a real collector, kept even once the
 * provider later unmounts and this is called with `undefined` again. Every restart tears down the
 * whole JS module (see captureTransport.ts's file header on Android's ProcessPhoenix and iOS's
 * bridge reload), so "this boot" is exactly this module's own lifetime - there is no stale value
 * to carry from a boot before it.
 */
let firstRenderedAt: number | undefined;

/** The app is rendered and its views can be read this way; `undefined` forgets the reading. */
export function rememberAppMetadataCollector(collect: CollectAppMetadata | undefined): void {
  if (collect && firstRenderedAt === undefined) {
    firstRenderedAt = Date.now();
  }
  theCollector = collect;
}

/**
 * The app's views as the renderer that drew them reads them - every view by its native tag, with
 * the story id it carries - or nothing before the app has rendered.
 */
export function collectAppMetadata(): Metadata | undefined {
  return theCollector?.();
}

/**
 * When the provider that publishes here first rendered in this boot, or `undefined` before it ever
 * has - read by a capture that found no metadata naming its story, to say whether the provider had
 * rendered at all yet rather than leaving that guessed at (see captureTransport.ts's
 * metadataOfTheApp).
 */
export function providerFirstRenderedAt(): number | undefined {
  return firstRenderedAt;
}

/** Test-only: forget the first-render timestamp, the way a fresh boot's module would never have set it. */
export function __resetProviderFirstRenderedAtForTests(): void {
  firstRenderedAt = undefined;
}
