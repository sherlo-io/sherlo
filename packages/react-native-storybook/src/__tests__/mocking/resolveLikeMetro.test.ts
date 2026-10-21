describe('a mocked name resolved the way the bundler resolves it', () => {
  it.todo('a mocked name that is only a bundler alias registers the file the bundler uses');
  it.todo(
    "a mocked name that is an alias Node can also resolve registers the bundler's file, not Node's"
  );
  it.todo(
    'a relative, a package and a symlinked monorepo name each register the file the bundler uses'
  );
  it.todo('the stand-in requires the real module by its absolute path, never back through itself');
});
