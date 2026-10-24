import type { StoryError, StoryThrew } from '../sealedCore/seam';
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
// What the record's `threw` says: set by any error that ended the capture - the story's own, a
// refused request, or a mock that did not apply.
export function threwOf(id: string): StoryThrew | undefined {
  const error = readStoryError(id);
  return error && { name: error.name, message: error.message };
}
// Why the app crashed on `id`: the error recorded, else a plain saying that none was left. A
// crashed record never goes out without a cause.
export function causeOfCrash(id: string): StoryError {
  return (
    readStoryError(id) ?? {
      name: 'AppCrashed',
      message: 'the app crashed and left no error behind',
      stack: '',
      componentStack: '',
    }
  );
}
