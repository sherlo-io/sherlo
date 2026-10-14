// Pins what the release workflows do: when a release stops before it commits, what an alpha and a public release publish.
// Shells written in plan for epic release-process; the builder fills each `it.todo` as a real `it(...)`.

describe('the release workflows', () => {
  it.todo(
    "A release whose pinned core's source tree is on no commit of sherlo-runner's default branch or of a runner release branch stops before it commits anything"
  );
  it.todo('a public release stops before it commits anything when main cannot move forward to it');
  it.todo(
    'an alpha release publishes version-alpha.N under the alpha tag and leaves main, the git tags and the GitHub release alone'
  );
  it.todo('a public release whose version npm already has skips the publish and carries on');
  it.todo('a public release tags v and its version');
  it.todo('a public release updates main and creates a GitHub release');
  it.todo('release_to_dev starts only on a dispatch, never on a push');
});
