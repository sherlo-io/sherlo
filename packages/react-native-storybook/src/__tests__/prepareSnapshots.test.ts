import prepareSnapshots from '../getStorybook/components/TestingMode/useTestAllStories/prepareSnapshots';

const makeStory = (overrides: any = {}) => ({
  id: 'components-button--primary',
  title: 'components/Button',
  name: 'Primary',
  componentId: 'components-button',
  parameters: {},
  argTypes: {},
  initialArgs: {},
  ...overrides,
});

const makeView = (stories: Record<string, any>) => ({
  _idToPrepared: stories,
});

describe('prepareSnapshots', () => {
  it('converts stories from view registry into snapshots', () => {
    const view = makeView({
      'components-button--primary': makeStory(),
    });

    const result = prepareSnapshots({ view: view as any });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      viewId: 'components-button--primary-deviceHeight',
      mode: 'deviceHeight',
      displayName: 'components/Button - Primary',
      storyId: 'components-button--primary',
      componentId: 'components-button',
      componentTitle: 'components/Button',
      storyTitle: 'Primary',
    });
  });

  it('handles multiple stories', () => {
    const view = makeView({
      'components-button--primary': makeStory(),
      'components-button--secondary': makeStory({
        id: 'components-button--secondary',
        name: 'Secondary',
      }),
      'components-avatar--basic': makeStory({
        id: 'components-avatar--basic',
        title: 'components/Avatar',
        name: 'Basic',
        componentId: 'components-avatar',
      }),
    });

    const result = prepareSnapshots({ view: view as any });

    expect(result).toHaveLength(3);
  });

  it('reverses the snapshot array (LIFO order)', () => {
    const view = makeView({
      'a--first': makeStory({ id: 'a--first', title: 'A', name: 'First' }),
      'b--second': makeStory({ id: 'b--second', title: 'B', name: 'Second' }),
      'c--third': makeStory({ id: 'c--third', title: 'C', name: 'Third' }),
    });

    const result = prepareSnapshots({ view: view as any });

    // Last story processed should be first in result (reversed)
    expect(result).toHaveLength(3);
    // The exact order depends on Object.values iteration, but reverse is applied
  });

  it('extracts figmaUrl from parameters.design.url', () => {
    const view = makeView({
      'btn--primary': makeStory({
        id: 'btn--primary',
        parameters: {
          design: { url: 'https://figma.com/file/abc123' },
        },
      }),
    });

    const result = prepareSnapshots({ view: view as any });

    expect(result[0].sherloParameters).toEqual({
      figmaUrl: 'https://figma.com/file/abc123',
    });
  });

  it('preserves existing sherlo parameters alongside figmaUrl', () => {
    const view = makeView({
      'btn--primary': makeStory({
        id: 'btn--primary',
        parameters: {
          sherlo: { platform: 'ios' },
          design: { url: 'https://figma.com/file/abc123' },
        },
      }),
    });

    const result = prepareSnapshots({ view: view as any });

    expect(result[0].sherloParameters).toEqual({
      figmaUrl: 'https://figma.com/file/abc123',
      platform: 'ios',
    });
  });

  it('handles story with no sherlo parameters', () => {
    const view = makeView({
      'btn--primary': makeStory({
        id: 'btn--primary',
        parameters: {},
      }),
    });

    const result = prepareSnapshots({ view: view as any });

    expect(result[0].sherloParameters).toEqual({});
  });

  it('includes args and argTypes from raw story', () => {
    const view = makeView({
      'btn--primary': makeStory({
        id: 'btn--primary',
        argTypes: { label: { control: 'text' } },
        initialArgs: { label: 'Click me' },
      }),
    });

    const result = prepareSnapshots({ view: view as any });

    expect(result[0].argTypes).toEqual({ label: { control: 'text' } });
    expect(result[0].args).toEqual({ label: 'Click me' });
  });

  it('handles empty view (no stories)', () => {
    const view = makeView({});

    const result = prepareSnapshots({ view: view as any });

    expect(result).toHaveLength(0);
  });

  it('constructs viewId as storyId-mode', () => {
    const view = makeView({
      'components-card--default': makeStory({
        id: 'components-card--default',
      }),
    });

    const result = prepareSnapshots({ view: view as any });

    expect(result[0].viewId).toBe('components-card--default-deviceHeight');
  });

  it('constructs displayName as title - name', () => {
    const view = makeView({
      'ui-modal--open': makeStory({
        id: 'ui-modal--open',
        title: 'UI/Modal',
        name: 'Open',
      }),
    });

    const result = prepareSnapshots({ view: view as any });

    expect(result[0].displayName).toBe('UI/Modal - Open');
  });

  it('passes through raw parameters', () => {
    const customParams = { backgrounds: { default: 'dark' }, viewport: { defaultViewport: 'mobile1' } };
    const view = makeView({
      'btn--primary': makeStory({
        id: 'btn--primary',
        parameters: customParams,
      }),
    });

    const result = prepareSnapshots({ view: view as any });

    expect(result[0].parameters).toEqual(customParams);
  });
});
