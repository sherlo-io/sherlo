import { useEffect } from 'react';
import { getSealedCore } from '../../../../sealedCore/loadSealedCore';

/**
 * A run's first launch: the sealed core lists the stories and sends them to the runner (its
 * startTestSession). With no core, Sherlo's features are off.
 */
function useSetInitialTestingData({
  enabled = true,
}: {
  /**
   * Whether this boot may send the runner its stories at all - false for a capture, which has no
   * runner behind it to answer this (see useTestAllStories, the one place that decides).
   * Defaults to true.
   */
  enabled?: boolean;
}): void {
  useEffect(() => {
    const core = getSealedCore();
    if (!enabled || !core) return;

    core.startTestSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

export default useSetInitialTestingData;
