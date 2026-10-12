/**
 * WHERE THE APP BEGINS, for ./componentNames: the one piece of it that needs a renderer.
 *
 * Render this around the app's story and nothing else. Every native view the story draws is then
 * named for the app's components above it, and everything outside this - Storybook's story view,
 * its error boundary, Sherlo's own - is left nameless, because none of it is the app.
 *
 * It draws nothing of its own: it hands back exactly the story it was given.
 */
import { type ReactNode, useEffect } from 'react';
import { useFiber } from 'its-fine';
import { rememberStoryOfTheApp } from './componentNames';

export function StoryOfTheApp({ children }: { children: ReactNode }): ReactNode {
  const fiber = useFiber();

  useEffect(() => {
    rememberStoryOfTheApp(fiber);
    return () => rememberStoryOfTheApp(undefined);
  }, [fiber]);

  return children;
}
