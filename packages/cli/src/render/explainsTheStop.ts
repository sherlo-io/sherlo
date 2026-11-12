/**
 * WHETHER THE RECORD EXPLAINS WHY A SCENE STOPPED, so the stock sign-in hint stays out of the way.
 *
 * Pure, like everything under ./: the scene's record in, a yes or no out.
 */
import type { SceneLeft } from './capturedScene';
import type { SceneStop } from './sceneStop';

/** Whether anything in the record explains why a scene stopped, so the stock sign-in hint stays out of the way. */
export function explainsTheStop(left: SceneLeft & { stop?: SceneStop }): boolean {
  return Boolean(
    left.threw ||
    left.stop ||
    left.mockNotApplied?.length ||
    left.unanswered?.length ||
    left.loggedErrors?.messages.length ||
    left.answerFindings?.length
  );
}
