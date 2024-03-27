import { createContext } from 'react';
import { Snapshot } from '../../../types';
import { Mode } from '../../withStorybook/ModeProvider';

interface SherloContextType {
  mode?: Mode;
  renderedSnapshot?: Snapshot;
}

const SherloContext = createContext<SherloContextType>({});

export default SherloContext;
