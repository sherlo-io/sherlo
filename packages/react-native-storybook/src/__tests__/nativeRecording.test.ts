/**
 * The app records what each story asked of native, for the quick check to replay.
 */

// Shells for task qck-sdk-recorder (epic quick-check-knows-no-library). Each `it.todo` becomes a real `it(...)` with the exact same name.
describe('what the app records for each story', () => {
  it.todo(
    'a test run records every native module call with its answer for each story and device setup'
  );
  it.todo(
    "a test run records every event a native view sent, each view's place, the commit points and the picture moment"
  );
  it.todo('a story that reaches native through a road the recorder cannot see is marked as blind');
  it.todo('an app on the old architecture sends no recording');
});
