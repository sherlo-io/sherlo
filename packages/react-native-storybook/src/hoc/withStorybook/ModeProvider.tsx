import React, { PropsWithChildren, ReactElement, useContext } from 'react';
import { WithStorybookMode } from './withStorybook';

const ModeContext = React.createContext({} as ModeContextValue);

export type ModeContextValue = {
  mode: WithStorybookMode;
  setMode: (mode: WithStorybookMode) => void;
};

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
