import React from 'react';
import { normalizeStack } from '../../normalizeStack';
import { RunnerBridge } from '../../helpers';
import { recordStoryError } from '../storyErrorRegistry';

interface Props {
  storyId: string;
  children?: React.ReactNode;
}

interface State {
  caught: boolean;
  error?: unknown;
}

class SherloStoryErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { caught: false };
  }

  static getDerivedStateFromError(error: unknown): State {
    return { caught: true, error };
  }

  componentDidCatch(error: unknown, _info: React.ErrorInfo): void {
    // Note: this method is NOT called when render() re-throws the error because
    // React treats a boundary that throws from render as a failed boundary and
    // escalates to the parent. Recording happens in render() instead.
    console.log('[sherlo:boundary] componentDidCatch storyId=', this.props.storyId, 'error=', (error && (error as any).message) || String(error));
    RunnerBridge.log('SherloStoryErrorBoundary componentDidCatch', { storyId: this.props.storyId, errorMessage: (error as any)?.message });
  }

  render(): React.ReactNode {
    if (this.state.caught) {
      // Record to registry here (not in componentDidCatch) because componentDidCatch
      // is skipped when render re-throws - React escalates to the parent boundary instead.
      try {
        const err = this.state.error as any;
        recordStoryError(this.props.storyId, {
          name: (err && err.name) || 'Error',
          message: (err && err.message) || String(err),
          stack: normalizeStack((err && err.stack) || ''),
          componentStack: '',
        });
      } catch (_) {}
      throw this.state.error;
    }
    return this.props.children;
  }
}

export default SherloStoryErrorBoundary;
