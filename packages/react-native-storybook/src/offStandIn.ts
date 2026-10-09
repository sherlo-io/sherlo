/**
 * THE SDK IN A BUILD WITHOUT SHERLO.
 *
 * With SHERLO_BUILD off, or unset in a release build, the bundler answers every import of
 * `@sherlo/react-native-storybook` with this file (metro/withStorybook.js). It exports every name
 * src/index.ts exports, with the same types, so the app's own code still compiles and runs - and it
 * imports nothing of Sherlo's native module and nothing of Storybook, so neither reaches the bundle.
 *
 * Nothing here works: both modes are false, a mock declaration is shaped like one but is never
 * read, and openStorybook says why it opens nothing rather than failing silently.
 *
 * The declarations are written out here rather than imported from ./mocking: an import would put
 * those modules in a bundle that is meant to hold this file alone of Sherlo's.
 */
import { Alert } from 'react-native';

import type { ModuleMockDeclaration } from './mocking/mockDeclaration';
import type {
  NetworkMockDeclaration,
  RequestAnswer,
  RequestMatcher,
} from './mocking/networkDeclaration';

export type { MockDeclaration } from './mocking/mockDeclaration';
export type {
  HttpMethod,
  NetworkMockDeclaration,
  NetworkRule,
  RequestAnswer,
  RequestMatcher,
} from './mocking/networkDeclaration';
export type * from './types';

export const isStorybookMode = false;

export const isRunningVisualTests = false;

export function openStorybook(): void {
  Alert.alert(
    'Storybook is not in this build',
    'This build was made without Storybook. To include it in a release build, set SHERLO_BUILD to app-and-storybook.'
  );
}

export function mock<M>(
  _importModule: () => Promise<M>,
  definition: Partial<M> | ((original: M) => Partial<M>)
): ModuleMockDeclaration {
  return {
    kind: 'module',
    moduleKey: () => Promise.resolve(undefined),
    definition: definition as ModuleMockDeclaration['definition'],
  };
}

export function mockRequest<Body = unknown>(
  matcher: RequestMatcher,
  answer: RequestAnswer<Body>
): NetworkMockDeclaration {
  return { kind: 'network', rule: { matcher, answer } };
}

mockRequest.passthrough = (): NetworkMockDeclaration => ({ kind: 'network', passthrough: true });

export function mockClock(moment: string | number | Date): ModuleMockDeclaration {
  return {
    kind: 'module',
    moduleKey: () => Promise.resolve(undefined),
    definition: { moment } as ModuleMockDeclaration['definition'],
  };
}

export function mockRandom(seed: number): ModuleMockDeclaration {
  return {
    kind: 'module',
    moduleKey: () => Promise.resolve(undefined),
    definition: { seed } as ModuleMockDeclaration['definition'],
  };
}

export class UnmockedRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnmockedRequestError';
  }
}

// The typecheck keeps this file's exports the SDK's own: a name the SDK exports and this file
// lacks, or one of another type, fails here.
type MustBeTrue<Condition extends true> = Condition;
export type StandInHasEverySdkExport = MustBeTrue<
  typeof import('./offStandIn') extends typeof import('./index') ? true : false
>;
