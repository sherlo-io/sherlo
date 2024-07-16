import { createContext } from 'react';
import { Snapshot } from '../../types';
import { SherloMode } from '../getStorybook';

interface SherloContextType {
  mode?: SherloMode;
  renderedSnapshot?: Snapshot;
}

const SherloContext = createContext<SherloContextType>({});

export default SherloContext;
