import { useEffect, useState } from 'react';
import { useMode } from '../hoc/withStorybook/ModeProvider';

const useSherloEnabled = (): boolean | undefined => {
  const { mode } = useMode();
  const [sherloEnabled, setSherloEnabled] = useState(false);

  useEffect(() => {
    if (mode) {
      setSherloEnabled(true);
    }
  }, [mode]);

  return sherloEnabled;
};

export default useSherloEnabled;
