import React, { PropsWithChildren, ReactElement, useContext, useEffect, useState } from 'react';
import { Mode } from '../withSherlo/withSherlo';

const ModeContext = React.createContext({} as ModeContextValue);

export type ModeContextValue = { mode: Mode };

const ModeProvider = ({ children, mode }: PropsWithChildren<ModeContextValue>): ReactElement => {
  return <ModeContext.Provider value={{ mode }}>{children}</ModeContext.Provider>;
};

export const useMode = (): { mode: Mode; setMode: (mode: Mode) => void } => {
  const { mode: initialMode } = useContext(ModeContext);

  const [mode, setMode] = useState<Mode | undefined>();

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  return { mode: mode || initialMode, setMode };
};

export default ModeProvider;
