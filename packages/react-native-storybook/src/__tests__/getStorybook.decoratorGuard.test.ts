/**
 * Tests the decorator-install guard in getStorybook.tsx: the boundary
 * decorator (SherloStoryErrorBoundary) must be installed once per preview,
 * not once per getStorybook() call - view.getStorybookUI (and therefore
 * getStorybook()) can be invoked more than once for the same preview (see
 * the comment at the guard's call site).
 *
 * SherloModule is mocked directly (rather than driven through the
 * react-native stub's __setNativeMode) because in this Vitest environment
 * TurboModuleRegistry.getEnforcing always returns null, so SherloModule
 * falls back to the dummy module, whose getMode() is hardcoded to 'default'
 * - there is no way to reach 'testing' mode through the real module wiring.
 */
import type { StorybookParams, StorybookView } from '../types';

// react-native-safe-area-context is a real npm package whose CJS build calls
// require('react') directly - that require is externalized by Vitest's SSR
// module runner and bypasses the react.ts alias entirely (unlike an ordinary
// ESM import graph). SafeAreaProvider is only referenced inside JSX in the
// component this file's getStorybook() *returns* - never invoked by these
// guard tests - so a stub identity component is enough to satisfy the import.
vi.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: 'SafeAreaProvider',
}));

vi.mock('../SherloModule', () => ({
  default: {
    getMode: () => 'testing',
    getConfig: () => ({
      stabilization: {
        requiredMatches: 3,
        minScreenshotsCount: 3,
        intervalMs: 500,
        timeoutMs: 5000,
        threshold: 0,
        includeAA: true,
      },
    }),
    notifyGetStorybookCalled: () => {},
  },
}));

function makeView(): { view: StorybookView; onGetProjectAnnotationsChanged: () => void } {
  const onGetProjectAnnotationsChanged = vi.fn();
  const getProjectAnnotations = vi.fn(async () => ({ decorators: [], loaders: [] }));
  const _preview = { getProjectAnnotations, onGetProjectAnnotationsChanged };
  const view = { _preview } as unknown as StorybookView;
  return {
    view,
    onGetProjectAnnotationsChanged: onGetProjectAnnotationsChanged as unknown as () => void,
  };
}

describe('getStorybook.tsx - decorator-install guard', () => {
  it('installs the boundary decorator once per preview, not once per call', async () => {
    const { default: getStorybook } = await import('../getStorybook/getStorybook');
    const { view, onGetProjectAnnotationsChanged } = makeView();
    const params: StorybookParams | undefined = undefined;

    getStorybook(view, params);
    getStorybook(view, params);
    getStorybook(view, params);

    expect(onGetProjectAnnotationsChanged).toHaveBeenCalledOnce();
    expect(
      (view._preview as unknown as { __sherloDecoratorInstalled?: boolean })
        .__sherloDecoratorInstalled
    ).toBe(true);
  });

  it('installs independently per distinct preview - a second, different view._preview does get its own decorator', async () => {
    const { default: getStorybook } = await import('../getStorybook/getStorybook');
    const a = makeView();
    const b = makeView();

    getStorybook(a.view);
    getStorybook(a.view);
    getStorybook(b.view);

    expect(a.onGetProjectAnnotationsChanged).toHaveBeenCalledOnce();
    expect(b.onGetProjectAnnotationsChanged).toHaveBeenCalledOnce();
  });
});
