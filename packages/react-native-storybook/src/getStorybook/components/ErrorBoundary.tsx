import React, { ReactNode } from 'react';
import { LogFn } from '../../helpers/runnerBridge';

class ErrorBoundary extends React.Component<{
  children: ReactNode;
  log: LogFn;
  onError: () => void;
}> {
  componentDidCatch(error: unknown) {
    this.props.log('error boundry error', { error });
    this.props.onError();
    throw error;
  }

  render() {
    return this.props.children;
  }
}

export default ErrorBoundary;