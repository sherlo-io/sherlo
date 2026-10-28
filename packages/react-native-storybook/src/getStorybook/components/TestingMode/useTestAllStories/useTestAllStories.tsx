import { isDrivenByRunner } from '../../../../runnerWalk';
import { MetadataProviderRef } from '../MetadataProvider';
import useSetInitialTestingData from './useSetInitialTestingData';
import useTestStory from './useTestStory';

function useTestAllStories({
  metadataProviderRef,
}: {
  metadataProviderRef: React.RefObject<MetadataProviderRef>;
}) {
  // THE RUNNER'S OWN LOOP - sending the runner the first list of stories (below) and reporting
  // each one back over the connection (useTestStory) - may run only for a boot a runner is
  // driving. A capture's boot produces the exact same `config`/`lastState` shape a run's does (see
  // SherloModuleCore on each platform), so those cannot tell the two apart. The JavaScript can:
  // a capture is driven over the bundler's capture address instead (captureTransport.ts), and a
  // runner it hands nothing to would otherwise be sent reports it never asked for. runnerWalk.ts
  // says which boot a runner drives.
  const drivenByRunner = isDrivenByRunner();

  useSetInitialTestingData({
    enabled: drivenByRunner,
  });

  useTestStory({
    metadataProviderRef,
    enabled: drivenByRunner,
  });
}

export default useTestAllStories;
