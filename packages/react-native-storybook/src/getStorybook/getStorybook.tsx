import { ReactElement } from 'react';
import { SherloModule } from '../helpers';
import { StorybookParams, StorybookView } from '../types';
import { TestingMode, VerificationMode } from './components';
import { getStorybookComponent } from './helpers';
import { useHideSplashScreen } from './hooks';

function getStorybook(view: StorybookView, params?: StorybookParams): () => ReactElement {
  return () => {
    useHideSplashScreen();

    const mode = SherloModule.getMode();

    if (mode === 'testing') {
      return <TestingMode view={view} params={params} />;
    }

    if (mode === 'verification') {
      return <VerificationMode />;
    }

    const Storybook = getStorybookComponent({ view, params });

    return <Storybook />;
  };
}

export default getStorybook;
