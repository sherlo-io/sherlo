describe('writes to a mocked module', () => {
  it.todo(
    "a write during a story lands in that story's own layer, read before the mock and the real module"
  );
  it.todo("the story's writes are dropped when its mocks end");
  it.todo('a write with no story active goes to the real module');
  it.todo(
    'a write to a default-exported singleton object goes through to that object and is restored when the story ends'
  );
  it.todo('reading or listing the keys of a mocked module after a write never throws');
});
