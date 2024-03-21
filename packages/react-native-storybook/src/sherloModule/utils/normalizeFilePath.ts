export const normalizeFilePath = (path: string): string =>
  path.startsWith('file://') ? path.slice(7) : path;
