import { useContext } from 'react';
import { AppOrStorybookModeContext } from './contexts';

function useSherlo(): {
  openStorybook: () => void;
} {
  const { setMode } = useContext(AppOrStorybookModeContext);

  const openStorybook = () => setMode('storybook');

  return { openStorybook };
}

export default useSherlo;
