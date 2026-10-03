import SherloModule from '../../../../SherloModule';
import { StorybookView } from '../../../../types';
import { MetadataProviderRef } from '../MetadataProvider';
import useSetInitialTestingData from './useSetInitialTestingData';
import useTestStory from './useTestStory';

function useTestAllStories({
  view,
  metadataProviderRef,
}: {
  view: StorybookView;
  metadataProviderRef: React.RefObject<MetadataProviderRef>;
}) {
  // THE RUNNER'S OWN LOOP - asking the runner for the first list of stories (below) and reporting
  // each one back over protocol files (useTestStory) - may run only for a boot a runner is
  // driving. A capture's boot now produces the exact same `config`/`lastState` shape a run's does
  // (see SherloModuleCore on each platform), so lastState being present or absent can no longer
  // tell the two apart the way it used to; SherloModule.getDriver() is the explicit value that
  // still can, checked here, once, before either half of the loop is allowed to run. A capture is
  // driven over the socket instead (captureTransport.ts) and must write nothing to protocol.sherlo -
  // a runner it hands nothing to would otherwise be asked to answer files it never receives.
  const drivenByRunner = SherloModule.getDriver() !== 'capture';

  useSetInitialTestingData({
    view,
    enabled: drivenByRunner,
  });

  useTestStory({
    metadataProviderRef,
    view,
    enabled: drivenByRunner,
  });
}

export default useTestAllStories;
