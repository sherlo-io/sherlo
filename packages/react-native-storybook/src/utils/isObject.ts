function isObject(obj: unknown): boolean {
  return typeof obj === 'object' && !Array.isArray(obj) && obj !== null;
}

export default isObject;
