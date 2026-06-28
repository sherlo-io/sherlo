export interface StoryError {
  name: string;
  message: string;
  stack: string;
  componentStack: string;
}
const registry = new Map<string, StoryError>();
export function recordStoryError(id: string, e: StoryError): void {
  registry.set(id, e);
}
export function readStoryError(id: string): StoryError | undefined {
  return registry.get(id);
}
export function clearStoryError(id: string): void {
  registry.delete(id);
}
