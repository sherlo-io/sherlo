import { describe, it } from 'vitest';

describe('sherlo test builds what the gate refused, then pushes', () => {
  it.todo(
    'builds every platform the staged gate refused, then pushes the builds on the standard road'
  );
  it.todo(
    'a mixed run builds only the refused platform and stages the other onto its stored app build, in one test'
  );
  it.todo('names why a platform needed a new app build only when native code changed');
  it.todo(
    'a platform that needs no build reuses its stored app build and its row says which test it came from'
  );
  it.todo(
    'in EAS mode, a refused platform is built on EAS and nothing is compiled on this machine'
  );
  it.todo('in EAS mode, a JavaScript-only change starts no EAS build and takes the staged road');
  it.todo(
    "warns once when the eas.json profile keeps variables on Expo's servers, and builds anyway"
  );
  it.todo('refuses a bundle that holds no stories, naming build.env, before anything is uploaded');
  it.todo('a push that builds its app hands --bundle-dir to the standard road');
  it.todo(
    'a --platform job joins the run its CI run shares instead of opening one, whether it built or not'
  );
  it.todo('a --platform job with no CI run id warns and runs as a test of its own');
});
