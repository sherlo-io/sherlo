import React, { PropsWithChildren, ReactElement, useContext } from 'react';

export type Mode = 'app' | 'testing' | 'preview' | 'original';

const ModeContext = React.createContext({} as ModeContextValue);

export type ModeContextValue = { mode: Mode; setMode: (mode: Mode) => void };

const ModeProvider = ({
  children,
  mode,
  setMode,
}: PropsWithChildren<ModeContextValue>): ReactElement => {
  return <ModeContext.Provider value={{ mode, setMode }}>{children}</ModeContext.Provider>;
};

export const useMode = (): ModeContextValue => {
  const modeContext = useContext(ModeContext);
  return modeContext;
};

export default ModeProvider;
