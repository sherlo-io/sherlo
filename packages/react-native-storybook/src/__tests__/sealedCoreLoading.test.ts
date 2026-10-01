// Shells: each name is a rule the book marks on "The sealed core". The bodies come with the code.

describe('loading the sealed core', () => {
  it('the SDK loads the JS core once, when it is imported, in every mode', () => {});

  it('the JavaScript evaluates the core in global scope with indirect eval', () => {});

  it('the SDK installs the core with the host it hands it', () => {});

  it('hands the core the fetch from before any mock wrapped it', () => {});

  it('a core whose seam this SDK does not speak is never installed', () => {});

  it('a core whose seam this SDK does not speak fails the compatibility check in testing mode', () => {});
});

describe('running with no core', () => {
  it("a native build with no core loader still renders Storybook, with Sherlo's features off", () => {});

  it('a native build with no core loader fails the compatibility check in testing mode', () => {});

  it("a core that throws while it evaluates still leaves Storybook rendering, with Sherlo's features off", () => {});

  it("with no core, a person's Storybook still turns on the mocks of the story they select", () => {});
});
