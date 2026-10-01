// Shells: each name is a rule the book marks on "The sealed core". The bodies come with the code.

describe('loading the sealed core', () => {
  it.todo('the SDK loads the JS core once, when it is imported, in every mode');

  it.todo('the JavaScript evaluates the core in global scope with indirect eval');

  it.todo('the SDK installs the core with the host it hands it');

  it.todo('hands the core the fetch from before any mock wrapped it');

  it.todo('a core whose seam this SDK does not speak is never installed');

  it.todo('a core whose seam this SDK does not speak fails the compatibility check in testing mode');
});

describe('running with no core', () => {
  it.todo("a native build with no core loader still renders Storybook, with Sherlo's features off");

  it.todo('a native build with no core loader fails the compatibility check in testing mode');

  it.todo("a core that throws while it evaluates still leaves Storybook rendering, with Sherlo's features off");

  it.todo("with no core, a person's Storybook still turns on the mocks of the story they select");
});
