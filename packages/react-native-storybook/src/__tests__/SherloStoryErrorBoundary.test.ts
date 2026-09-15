/**
 * Component-level tests for SherloStoryErrorBoundary - the one place a
 * story's render-time throw is observable (see getStorybook.tsx). Exercises
 * the class directly (constructor -> getDerivedStateFromError -> render())
 * rather than through a renderer, since `react` is only a peerDependency and
 * is not installed in this workspace (see src/__tests__/__mocks__/react.ts).
 */
import SherloStoryErrorBoundary from '../getStorybook/components/SherloStoryErrorBoundary';

interface ReportedFailure {
  storyId: string;
  name: string;
  message: string;
  stack: string;
  componentStack: string;
}

function installHost(): { reportStoryError: (failure: ReportedFailure) => void } {
  const reportStoryError = vi.fn();
  (globalThis as unknown as { __SHERLO_HOST__?: unknown }).__SHERLO_HOST__ = { reportStoryError };
  return { reportStoryError: reportStoryError as unknown as (failure: ReportedFailure) => void };
}

afterEach(() => {
  delete (globalThis as unknown as { __SHERLO_HOST__?: unknown }).__SHERLO_HOST__;
});

describe('SherloStoryErrorBoundary', () => {
  it('getDerivedStateFromError catches the thrown value into state', () => {
    const error = new Error('story blew up');

    const derived = SherloStoryErrorBoundary.getDerivedStateFromError(error);

    expect(derived).toEqual({ caught: true, error });
  });

  it('render() returns null once caught - no rethrow, no children rendered - and reports the failure exactly once with the correct shape', () => {
    const { reportStoryError } = installHost();
    const error = new Error('story blew up');
    error.stack = 'Error: story blew up\n    at Story (/Users/dev/app/src/App.tsx:10:5)';

    const instance = new SherloStoryErrorBoundary({
      storyId: 'button--primary',
      children: 'should never be rendered' as never,
    });
    Object.assign(
      instance.state as object,
      SherloStoryErrorBoundary.getDerivedStateFromError(error)
    );

    let result: unknown;
    expect(() => {
      result = instance.render();
    }).not.toThrow();

    expect(result).toBeNull();
    expect(reportStoryError).toHaveBeenCalledOnce();
    expect(reportStoryError).toHaveBeenCalledWith({
      storyId: 'button--primary',
      name: 'Error',
      message: 'story blew up',
      stack: expect.any(String),
      componentStack: '',
    });
  });

  it('render() passes children through unchanged when nothing has been caught', () => {
    const instance = new SherloStoryErrorBoundary({
      storyId: 'button--primary',
      children: 'ok' as never,
    });

    expect(instance.render()).toBe('ok');
  });

  it('does not throw and still returns null when no host is attached (globalThis.__SHERLO_HOST__ absent)', () => {
    const error = new Error('boom');
    const instance = new SherloStoryErrorBoundary({ storyId: 'x', children: undefined });
    Object.assign(
      instance.state as object,
      SherloStoryErrorBoundary.getDerivedStateFromError(error)
    );

    let result: unknown;
    expect(() => {
      result = instance.render();
    }).not.toThrow();
    expect(result).toBeNull();
  });
});
