import React from 'react';
import { AppOrStorybookMode } from '../types';

type AppOrStorybookModeContext = {
  mode: AppOrStorybookMode;
  setMode: (mode: AppOrStorybookMode) => void;
};

const AppOrStorybookModeContext = React.createContext({} as AppOrStorybookModeContext);

export default AppOrStorybookModeContext;
