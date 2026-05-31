/**
 * Unit tests for the extracted network image detection helpers.
 * Imports the real module - no inline reimplementation.
 */

import {
  REMOTE_IMAGE_COMPONENTS,
  isNetworkImageSourceFilter,
  isNetworkImageSource,
  isNetworkImageComponent,
} from '../getStorybook/components/TestingMode/networkImageDetection';

describe('isNetworkImageSourceFilter', () => {
  it('returns true for HTTPS URL', () => {
    expect(isNetworkImageSourceFilter('https://example.com/image.png')).toBe(true);
  });

  it('returns true for HTTP URL', () => {
    expect(isNetworkImageSourceFilter('http://cdn.example.com/image.png')).toBe(true);
  });

  it('returns false for local network IP (192.168.x.x)', () => {
    expect(isNetworkImageSourceFilter('http://192.168.1.1/image.png')).toBe(false);
  });

  it('returns false for null/undefined', () => {
    expect(isNetworkImageSourceFilter(null as any)).toBe(false);
    expect(isNetworkImageSourceFilter(undefined as any)).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isNetworkImageSourceFilter('')).toBe(false);
  });

  it('returns false for non-http URL', () => {
    expect(isNetworkImageSourceFilter('file:///local/image.png')).toBe(false);
  });

  it('returns false for relative path', () => {
    expect(isNetworkImageSourceFilter('./image.png')).toBe(false);
  });

  it('returns false for data URI', () => {
    expect(isNetworkImageSourceFilter('data:image/png;base64,abc')).toBe(false);
  });
});

describe('isNetworkImageSource', () => {
  it('handles string source', () => {
    expect(isNetworkImageSource('https://example.com/img.png')).toBe(true);
  });

  it('handles object source with uri', () => {
    expect(isNetworkImageSource({ uri: 'https://example.com/img.png' })).toBe(true);
  });

  it('handles array source with one remote', () => {
    expect(
      isNetworkImageSource([
        { uri: 'file:///local.png' },
        { uri: 'https://example.com/img.png' },
      ])
    ).toBe(true);
  });

  it('returns false for null source', () => {
    expect(isNetworkImageSource(null)).toBe(false);
  });

  it('returns false for local object source', () => {
    expect(isNetworkImageSource({ uri: 'file:///local.png' })).toBe(false);
  });

  it('returns false for number source (require result)', () => {
    expect(isNetworkImageSource(42)).toBe(false);
  });

  it('returns false for local network address', () => {
    expect(isNetworkImageSource({ uri: 'http://192.168.0.1/img.png' })).toBe(false);
  });

  it('handles array of all local sources', () => {
    expect(
      isNetworkImageSource([
        { uri: 'file:///a.png' },
        { uri: 'file:///b.png' },
      ])
    ).toBe(false);
  });
});

describe('REMOTE_IMAGE_COMPONENTS coverage', () => {
  it('includes RN iOS image view', () => {
    expect(REMOTE_IMAGE_COMPONENTS.has('ReactImageView')).toBe(true);
  });

  it('includes RN Android image view', () => {
    expect(REMOTE_IMAGE_COMPONENTS.has('RCTImageView')).toBe(true);
  });

  it('includes FastImage iOS', () => {
    expect(REMOTE_IMAGE_COMPONENTS.has('FFFastImageView')).toBe(true);
  });

  it('includes FastImage Android', () => {
    expect(REMOTE_IMAGE_COMPONENTS.has('FastImageView')).toBe(true);
  });

  it('includes ExpoImage (shared iOS+Android)', () => {
    expect(REMOTE_IMAGE_COMPONENTS.has('ViewManagerAdapter_ExpoImage')).toBe(true);
  });

  it('includes TurboImage (shared iOS+Android)', () => {
    expect(REMOTE_IMAGE_COMPONENTS.has('TurboImageView')).toBe(true);
  });

  it('does not include arbitrary component', () => {
    expect(REMOTE_IMAGE_COMPONENTS.has('MyCustomImage')).toBe(false);
  });
});

describe('isNetworkImageComponent (fiber stub)', () => {
  function makeFiber(type: any, source: any) {
    return { type, pendingProps: { source }, memoizedProps: null };
  }

  it('returns true for ReactImageView with remote source', () => {
    const fiber = makeFiber('ReactImageView', { uri: 'https://example.com/img.png' });
    expect(isNetworkImageComponent(fiber)).toBe(true);
  });

  it('returns false for ReactImageView with local file source', () => {
    const fiber = makeFiber('ReactImageView', { uri: 'file:///local.png' });
    expect(isNetworkImageComponent(fiber)).toBe(false);
  });

  it('returns false for non-image component even with remote source', () => {
    const fiber = makeFiber('MyCustomComponent', { uri: 'https://example.com/img.png' });
    expect(isNetworkImageComponent(fiber)).toBe(false);
  });

  it('matches when componentName contains the remote-image class name (substring)', () => {
    const fiber = makeFiber('SomePrefix_ReactImageView', { uri: 'https://example.com/img.png' });
    expect(isNetworkImageComponent(fiber)).toBe(true);
  });

  it('falls back to memoizedProps when pendingProps is null', () => {
    const fiber: any = { type: 'ReactImageView', pendingProps: null, memoizedProps: { source: { uri: 'https://example.com/img.png' } } };
    expect(isNetworkImageComponent(fiber)).toBe(true);
  });

  it('returns false when no props at all', () => {
    const fiber: any = { type: 'ReactImageView', pendingProps: null, memoizedProps: null };
    expect(isNetworkImageComponent(fiber)).toBe(false);
  });

  it('reads alternative source props (src / srcSet / svgXmlData)', () => {
    expect(isNetworkImageComponent({ type: 'ReactImageView', pendingProps: { src: 'https://example.com/img.png' }, memoizedProps: null })).toBe(true);
    expect(isNetworkImageComponent({ type: 'ReactImageView', pendingProps: { srcSet: 'https://example.com/img.png' }, memoizedProps: null })).toBe(true);
    expect(isNetworkImageComponent({ type: 'ReactImageView', pendingProps: { svgXmlData: 'https://example.com/img.png' }, memoizedProps: null })).toBe(true);
  });

  it('returns false for typeless fiber', () => {
    expect(isNetworkImageComponent({ type: null, pendingProps: { source: { uri: 'https://example.com/img.png' } } })).toBe(false);
  });
});
