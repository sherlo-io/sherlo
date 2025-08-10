import { Snapshot, StorybookView, StoryId } from '../../../../types';

function prepareSnapshots(view: StorybookView): Snapshot[] {
  let snapshots: Snapshot[] = [];

  Object.values(view._idToPrepared).forEach((rawStory) => {
    let sherloParameters = rawStory.parameters.sherlo || {};

    if (rawStory.parameters?.design?.url) {
      sherloParameters = { figmaUrl: rawStory.parameters.design.url, ...sherloParameters };
    }

    snapshots.push({
      viewId: rawStory.id,
      displayName: `${rawStory.title} - ${rawStory.name}`,
      sherloParameters,

      componentId: rawStory.componentId,
      componentTitle: rawStory.title,
      storyId: rawStory.id as StoryId,
      storyTitle: rawStory.name,

      parameters: rawStory.parameters,
      argTypes: rawStory.argTypes,
      args: rawStory.initialArgs,
    });
  });

  return snapshots.reverse();
}

export default prepareSnapshots;
