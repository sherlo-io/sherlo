import { useMode } from '../hoc/withStorybook/ModeProvider';

interface UseSherlo {
  openStorybook: () => void;
}

const useSherlo = (): UseSherlo => {
  const { setMode } = useMode();

  return {
    openStorybook: () => {
      setMode('original');
    },
  };
};

export default useSherlo;
