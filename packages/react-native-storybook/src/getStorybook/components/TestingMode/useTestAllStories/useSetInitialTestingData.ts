import { useEffect } from 'react';
import { StorybookView } from '../../../../types';
import { getSealedCore } from '../../../../sealedCore/loadSealedCore';

/**
 * A run's first launch: the sealed core lists the stories and sends them to the runner (its
 * startTestSession). With no core, Sherlo's features are off.
 */
function useSetInitialTestingData({
  view,
  enabled = true,
}: {
  view: StorybookView;
  /**
   * Whether this boot may start the protocol-file handshake at all - false for a capture, which
   * has no runner behind it to answer this (see useTestAllStories, the one place that reads
   * SherloModule.getDriver() to decide). Defaults to true.
   */
  enabled?: boolean;
}): void {
  useEffect(() => {
    const core = getSealedCore();
    if (!enabled || !core) return;

    core.startTestSession(view);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

export default useSetInitialTestingData;
