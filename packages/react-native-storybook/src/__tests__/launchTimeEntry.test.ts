// Shells written in plan (storybook-both-setups): task sdk-launch-entry makes each green.
describe('the launch-time entry', () => {
  it.todo("the old setup calls Storybook's metro wrapper and leaves the entry alone");
  it.todo("the default setup calls Storybook's own newer wrapper with Storybook turned on");
  it.todo('finds the app entry the way the bundler does, and refuses when there is none');
  it.todo("only the bundle's own entry request resolves to the generated launch entry");
  it.todo('any other import of the Storybook entry file is refused');
  it.todo("a web bundle keeps the app's entry");
});
