// Shells written in plan (storybook-both-setups): task sdk-sherlo-build-setting makes each green.
describe('the build setting says how much of Sherlo and Storybook a build carries', () => {
  it.todo('SHERLO_BUILD unset is off in a release build and app-and-storybook in a debug build');
  it.todo('an unknown SHERLO_BUILD value stops the bundler naming the three values');
  it.todo("a set SHERLO_BUILD wins over Storybook's enabled option and STORYBOOK_ENABLED");
});
