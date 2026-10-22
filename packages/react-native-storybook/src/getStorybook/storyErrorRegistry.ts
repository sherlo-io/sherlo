import type { StoryError } from '../sealedCore/seam';
import { mockFailureOf } from '../mocking/activateStoryMocks';

const registry = new Map<string, StoryError>();
export function recordStoryError(id: string, e: StoryError): void {
  registry.set(id, e);
}
// What the story threw, or - when it threw nothing - why one of its mocks did not take effect.
export function readStoryError(id: string): StoryError | undefined {
  return registry.get(id) ?? mockFailureOf(id);
}
export function clearStoryError(id: string): void {
  registry.delete(id);
}
