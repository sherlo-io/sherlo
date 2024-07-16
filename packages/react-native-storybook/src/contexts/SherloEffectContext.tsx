import { createContext } from 'react';

type SherloEffectContext = {
  log: (key: string, parameters?: Record<string, any>) => void;
  handleSherloEffect?: (effect: () => void) => void;
};

const SherloEffectContext = createContext<SherloEffectContext>({
  handleSherloEffect: () => {},
  log: () => {},
});

export default SherloEffectContext;
