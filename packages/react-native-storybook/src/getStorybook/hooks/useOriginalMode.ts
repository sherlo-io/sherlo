import { start } from '@storybook/react-native';
import { useEffect } from 'react';
import { Snapshot, StorybookViewMode } from '../../types';
import { prepareSnapshots } from '../utils';

function useOriginalMode(
  view: ReturnType<typeof start>,
  mode: StorybookViewMode,
  setSnapshots: (snapshots: Snapshot[]) => void
): void {
  useEffect(() => {
    if (mode === 'original' && Object.keys(view._idToPrepared).length > 0) {
      const snapshots = prepareSnapshots({
        view,
        splitByMode: false,
      });

      setSnapshots(snapshots);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, Object.keys(view._idToPrepared).length]);
}

export default useOriginalMode;
