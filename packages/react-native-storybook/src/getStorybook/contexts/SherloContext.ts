import { createContext } from 'react';
import { Snapshot, StorybookViewMode } from '../../types';

interface SherloContextType {
  mode?: StorybookViewMode;
  renderedSnapshot?: Snapshot;
}

const SherloContext = createContext<SherloContextType>({});

export default SherloContext;
