import { createContext } from 'react';
import { Story } from '../../../types';
import { Mode } from '../../withStorybook/ModeProvider';

interface SherloContextType {
  mode?: Mode;
  renderedStory?: Story;
}

const SherloContext = createContext<SherloContextType>({});

export default SherloContext;
