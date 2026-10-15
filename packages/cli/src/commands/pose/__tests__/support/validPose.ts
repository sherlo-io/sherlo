/** A pose with nothing wrong with it - the thing the pose contract cases break in one way at a time. */
export function validPose(): Record<string, unknown> {
  return {
    pose: 1,
    argv: ['view', '7'],
    files: {},
    env: {},
    git: 'none',
    bundles: {},
    api: [{ call: 'getBuildStatus', with: { buildIndex: 7 }, answer: { runStatus: 'finished' } }],
    masks: {},
  };
}
