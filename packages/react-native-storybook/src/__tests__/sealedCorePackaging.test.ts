// Shells: each name is a rule the book marks on "The sealed core" and "Working on the SDK". The
// bodies come with the code.

describe('what the published package carries', () => {
  it.todo('the published files carry the JS core as an asset for iOS and Android');

  it.todo('the podspec vendors the C core xcframework');

  it.todo('the published files carry a C core library for every Android ABI');

  it.todo('the published files carry no readable source of either core');

  it.todo('the published bundler plugin is a minified bundle that requires no file of its own source');

  it.todo('a pack builds both sealed parts before it packs');

  it.todo('no built sealed part is committed');

  it.todo('a release build refuses the test public key');
});
