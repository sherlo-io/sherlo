/**
 * The scenes-only road: an app with scene files and no Storybook is wrapped by
 * wrapTheAppInStoryOfTheApp, rendered here for real, and the record of its views is read the way a
 * capture reads it (collectAppMetadata).
 */
import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { __getWrapperComponentProvider } from './__mocks__/react-native';
import { collectAppMetadata, rememberAppMetadataCollector } from '../appMetadata';
import { getSealedCore } from '../sealedCore/loadSealedCore';
import type { Metadata } from '../sealedCore/seam';
import SherloModule from '../SherloModule';
import { wrapTheAppInStoryOfTheApp } from '../storyOfTheApp';

const THE_SCREENS_VIEWS: Metadata = {
  viewProps: { 7: { style: { color: 'red' }, testID: 'title' } } as never,
  texts: ['Hello'],
  generations: [],
};

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  rememberAppMetadataCollector(undefined);
  vi.restoreAllMocks();
});

describe('the scenes-only wrapper', () => {
  it("a scenes-only launch gives the record text and style on the views of the app's screen", () => {
    const core = getSealedCore()!;
    const merge = vi.spyOn(core, 'mergeGenerations').mockReturnValue(THE_SCREENS_VIEWS);
    wrapTheAppInStoryOfTheApp();
    const Wrapper = __getWrapperComponentProvider()!() as React.ComponentType<{
      children: React.ReactNode;
    }>;

    let renderer: ReturnType<typeof create> | undefined;
    act(() => {
      renderer = create(
        <Wrapper>
          <div>the app's screen</div>
        </Wrapper>
      );
    });

    expect(collectAppMetadata()).toBe(THE_SCREENS_VIEWS);
    expect(merge).toHaveBeenCalledTimes(1);
    act(() => renderer!.unmount());
    expect(collectAppMetadata()).toBeUndefined();
  });

  it("a scenes-only launch puts the scene's id on a view, so the capture keeps the views' text and style", () => {
    vi.spyOn(SherloModule, 'getMode').mockReturnValue('testing');
    vi.spyOn(SherloModule, 'getLastState').mockReturnValue({
      nextSnapshot: { storyId: 'inbox--full' },
    } as never);
    wrapTheAppInStoryOfTheApp();
    const Wrapper = __getWrapperComponentProvider()!() as React.ComponentType<{
      children: React.ReactNode;
    }>;

    let renderer: ReturnType<typeof create> | undefined;
    act(() => {
      renderer = create(
        <Wrapper>
          <div>the app's screen</div>
        </Wrapper>
      );
    });

    // The core's own rule (sherlo-runner core/js/src/captureTransport.ts, namesTheStory): the
    // reading names the story when some view of it carries testID equal to the story id.
    const namesTheStory = (viewProps: Record<number, { testID?: string }>, storyId: string) =>
      Object.values(viewProps).some((props) => props.testID === storyId);
    const view = renderer!.root.findByType('View' as never);
    expect(namesTheStory({ 1: view.props }, 'inbox--full')).toBe(true);
    expect(view.props.collapsable).toBe(false);
    act(() => renderer!.unmount());
  });
});
