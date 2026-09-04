import React from 'react';
import { normalizeStack } from '../../normalizeStack';

interface Props {
  storyId: string;
  children?: React.ReactNode;
}

interface State {
  caught: boolean;
  error?: unknown;
}

interface SherloHost {
  reportStoryError: (failure: {
    storyId: string;
    name: string;
    message: string;
    stack: string;
    componentStack: string;
  }) => void;
}

function getHost(): SherloHost | undefined {
  return (globalThis as unknown as { __SHERLO_HOST__?: SherloHost }).__SHERLO_HOST__;
}

/**
 * The only POSITION from which a story's throw is observable: Storybook React
 * Native wraps every story in its own ErrorBoundary whose entire error
 * handling is a `console.log`, so from anywhere outside it, a story that
 * threw is indistinguishable from a story that renders a red-bordered box. A
 * decorator wraps the story component while Storybook's boundary wraps the
 * decorator, so a boundary rendered here catches FIRST and recovers the
 * error object.
 *
 * It decides nothing beyond that: it reports through the seam
 * (host.reportStoryError) and renders null - not the caught children, not a
 * rethrow - so what a failed story MEANS, how it is surfaced, and whether a
 * run continues all stay private and replaceable without a customer rebuild.
 */
class SherloStoryErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { caught: false };
  }

  static getDerivedStateFromError(error: unknown): State {
    return { caught: true, error };
  }

  render(): React.ReactNode {
    if (this.state.caught) {
      // React does not call componentDidCatch when render() re-throws - it
      // treats a boundary that throws from render as a failed boundary and
      // escalates to the parent. Reporting happens here instead, and this
      // boundary does not re-throw.
      try {
        const err = this.state.error as any;
        getHost()?.reportStoryError({
          storyId: this.props.storyId,
          name: (err && err.name) || 'Error',
          message: (err && err.message) || String(err),
          stack: normalizeStack((err && err.stack) || ''),
          componentStack: '',
        });
      } catch (_) {}
      return null;
    }
    return this.props.children;
  }
}

export default SherloStoryErrorBoundary;
