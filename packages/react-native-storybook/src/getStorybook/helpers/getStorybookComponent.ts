import { StorybookParams, StorybookView } from '../../types';

function getStorybookComponent({
  params = {},
  view,
}: {
  view: StorybookView;
  params?: StorybookParams;
}): () => JSX.Element {
  if (!view?.getStorybookUI) {
    throw new Error(
      'Storybook framework not found in the bundle. ' +
        'Make sure the Metro withStorybook wrapper does not have "enabled" set to false.'
    );
  }

  const getUI = (view as any).__sherloOriginalGetStorybookUI || view.getStorybookUI;
  return getUI(params);
}

export default getStorybookComponent;
