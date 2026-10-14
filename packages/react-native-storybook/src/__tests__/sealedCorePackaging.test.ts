/**
 * Release workflows of the SDK (books/sherlo/working-on-the-sdk/releasing.md, books/sherlo/working-on-the-sdk/channels.md,
 * books/sherlo-brain/releases/shipping.md): release_to_dev starts only on a dispatch, and a release is built, tagged
 * and published on the dev, alpha or public channel as the book says.
 * Shells written in plan for epic release-process; the builder fills each `it.todo` as a real `it(...)`.
 */

describe('the release workflows', () => {
  it.todo('release_to_dev starts only on a dispatch, never on a push');
  it.todo("release_to_dev pushes the action release ref and tags it action-dev with the run's id");
  it.todo('a release builds the client libraries from LIBS_REF when one is given');
  it.todo(
    'an alpha release publishes version-alpha.N under the alpha tag and leaves main, the git tags and the GitHub release alone'
  );
  it.todo('a public release updates main and creates a GitHub release');
});
