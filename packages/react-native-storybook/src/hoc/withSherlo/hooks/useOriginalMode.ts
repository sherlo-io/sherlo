import { useEffect } from 'react';
import { Story } from '../../../types';
import { Mode } from '../withSherlo';
import { prepareStories } from '../utils';
import { start } from '@storybook/react-native';

function useOriginalMode(
  view: ReturnType<typeof start>,
  mode: Mode,
  setStories: (stories: Story[]) => void
): void {
  useEffect(() => {
    if (mode === 'original' && Object.keys(view._idToPrepared).length > 0) {
      const filteredStories = prepareStories({
        view,
        splitByMode: false,
        dontFilter: true,
      });

      setStories(filteredStories);
    }
  }, [mode, Object.keys(view._idToPrepared).length]);
}

export default useOriginalMode;
