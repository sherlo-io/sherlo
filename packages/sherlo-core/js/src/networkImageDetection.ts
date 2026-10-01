// Native view manager class names whose props.source / props.src can point to a network URI.
// Entries are deduplicated where iOS and Android use the same class name.
export const REMOTE_IMAGE_COMPONENTS = new Set([
  'ReactImageView', // RN iOS
  'RCTImageView', // RN Android
  'FFFastImageView', // FastImage iOS
  'FastImageView', // FastImage Android
  'ViewManagerAdapter_ExpoImage', // ExpoImage (shared iOS+Android)
  'TurboImageView', // TurboImage (shared iOS+Android)
]);

export function isNetworkImageSourceFilter(uri: string): boolean {
  if (!uri || typeof uri !== 'string') return false;
  return uri.startsWith('http') && !uri.includes('://192.168.');
}

export function isNetworkImageSource(source: any): boolean {
  if (!source) return false;

  if (Array.isArray(source)) {
    return source.some(isNetworkImageSource);
  }

  if (typeof source === 'string') {
    return isNetworkImageSourceFilter(source);
  }

  if (typeof source === 'object') {
    return isNetworkImageSourceFilter(source.uri);
  }

  return false;
}

export function isNetworkImageComponent(fiber: any): boolean {
  const { type, pendingProps, memoizedProps } = fiber;
  const componentName = typeof type === 'string' ? type : type?.displayName || type?.name;
  if (
    !componentName ||
    !Array.from(REMOTE_IMAGE_COMPONENTS).some((name) => componentName.includes(name))
  ) {
    return false;
  }

  const props = pendingProps || memoizedProps;
  if (!props) {
    return false;
  }

  const source = props.source || props.src || props.srcSet || props.svgXmlData;
  return isNetworkImageSource(source);
}
