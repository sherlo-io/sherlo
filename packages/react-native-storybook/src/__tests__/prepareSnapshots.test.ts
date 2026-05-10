import prepareSnapshots from '../getStorybook/components/TestingMode/useTestAllStories/prepareSnapshots';
import { StoryMeta } from '../storybook/adapter';

const makeMeta = (overrides: Partial<StoryMeta> = {}): StoryMeta => ({
  id: 'components-button--primary',
  title: 'components/Button',
  name: 'Primary',
  parameters: {},
  ...overrides,
});

describe('prepareSnapshots', () => {
  it('converts story metas into snapshots', () => {
    const result = prepareSnapshots({ storyMetas: [makeMeta()] });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      viewId: 'components-button--primary-deviceHeight',
      mode: 'deviceHeight',
      displayName: 'components/Button - Primary',
      storyId: 'components-button--primary',
      componentTitle: 'components/Button',
      storyTitle: 'Primary',
    });
  });

  it('handles multiple stories', () => {
    const result = prepareSnapshots({
      storyMetas: [
        makeMeta(),
        makeMeta({ id: 'components-button--secondary', name: 'Secondary' }),
        makeMeta({
          id: 'components-avatar--basic',
          title: 'components/Avatar',
          name: 'Basic',
        }),
      ],
    });

    expect(result).toHaveLength(3);
  });

  it('extracts figmaUrl from parameters.design.url', () => {
    const result = prepareSnapshots({
      storyMetas: [
        makeMeta({
          id: 'btn--primary',
          parameters: { design: { url: 'https://figma.com/file/abc123' } },
        }),
      ],
    });

    expect(result[0].sherloParameters).toEqual({
      figmaUrl: 'https://figma.com/file/abc123',
    });
  });

  it('preserves existing sherlo parameters alongside figmaUrl', () => {
    const result = prepareSnapshots({
      storyMetas: [
        makeMeta({
          id: 'btn--primary',
          parameters: {
            sherlo: { platform: 'ios' },
            design: { url: 'https://figma.com/file/abc123' },
          },
        }),
      ],
    });

    expect(result[0].sherloParameters).toEqual({
      figmaUrl: 'https://figma.com/file/abc123',
      platform: 'ios',
    });
  });

  it('handles story with no sherlo parameters', () => {
    const result = prepareSnapshots({
      storyMetas: [makeMeta({ id: 'btn--primary', parameters: {} })],
    });

    expect(result[0].sherloParameters).toEqual({});
  });

  it('handles empty story list', () => {
    const result = prepareSnapshots({ storyMetas: [] });

    expect(result).toHaveLength(0);
  });

  it('constructs viewId as storyId-mode', () => {
    const result = prepareSnapshots({
      storyMetas: [makeMeta({ id: 'components-card--default' })],
    });

    expect(result[0].viewId).toBe('components-card--default-deviceHeight');
  });

  it('constructs displayName as title - name', () => {
    const result = prepareSnapshots({
      storyMetas: [makeMeta({ id: 'ui-modal--open', title: 'UI/Modal', name: 'Open' })],
    });

    expect(result[0].displayName).toBe('UI/Modal - Open');
  });

  it('passes through raw parameters', () => {
    const customParams = {
      backgrounds: { default: 'dark' },
      viewport: { defaultViewport: 'mobile1' },
    };
    const result = prepareSnapshots({
      storyMetas: [makeMeta({ id: 'btn--primary', parameters: customParams })],
    });

    expect(result[0].parameters).toEqual(customParams);
  });

  it('emits empty argTypes and args (deprecated fields)', () => {
    const result = prepareSnapshots({ storyMetas: [makeMeta()] });

    expect(result[0].argTypes).toEqual({});
    expect(result[0].args).toEqual({});
  });
});
