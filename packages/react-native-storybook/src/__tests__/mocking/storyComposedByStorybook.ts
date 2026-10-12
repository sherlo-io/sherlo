/**
 * A story composed the way Storybook composes it, with Sherlo's annotation after the project's.
 *
 * Sherlo's annotation draws with React, and no React is installed beside this package, so a test
 * that imports this mocks React and the components Sherlo's decorator draws with first
 * (storyMockActivation.test.ts shows how).
 */
import { composeConfigs, composeStory } from 'storybook/internal/preview-api';
import sherloAnnotation from '../../getStorybook/sherloAnnotation';

/**
 * The story `exportName` of the file titled `title`, as Storybook composes it with the project's
 * annotations and Sherlo's after them, as Sherlo's start wrapper hands them over. Its `load()`
 * runs Storybook's own loaders, which Storybook awaits before it renders the story; calling it
 * renders the story, which reads `mockable`'s label into `labelsRendered`.
 */
export function storyAsStorybookComposesIt(
  title: string,
  exportName: string,
  mockable: { label: string },
  labelsRendered: string[]
) {
  return storyComposedFrom([sherloAnnotation], title, exportName, mockable, labelsRendered);
}

/**
 * The same story, composed from the `annotationsHanded` to Storybook itself, as start() or
 * updateView() was handed them: whatever is not among them, Sherlo's annotation included, has no
 * part in how the story loads and renders.
 */
export function storyComposedFrom(
  annotationsHanded: unknown[],
  title: string,
  exportName: string,
  mockable: { label: string },
  labelsRendered: string[]
) {
  const rendersTheLabel = {
    render: () => {
      labelsRendered.push(mockable.label);
      return null;
    },
  };
  return composeStory(
    {},
    { title },
    composeConfigs([rendersTheLabel, ...annotationsHanded] as never[]),
    {},
    exportName
  );
}
