import { useEffect } from 'react';
import { Snapshot } from '../../../types';
import { prepareSnapshots } from '../utils';
import { start } from '@storybook/react-native';
import { Mode } from '../../withStorybook/ModeProvider';

function useOriginalMode(
  view: ReturnType<typeof start>,
  mode: Mode,
  setSnapshots: (snapshots: Snapshot[]) => void
): void {
  useEffect(() => {
    if (mode === 'original' && Object.keys(view._idToPrepared).length > 0) {
      const snpashots = prepareSnapshots({
        view,
        splitByMode: false,
        dontFilter: true,
      });

      setSnapshots(snpashots);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, Object.keys(view._idToPrepared).length]);
}

export default useOriginalMode;
