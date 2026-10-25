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
});
