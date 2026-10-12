import { describe, it } from 'vitest';

// Shells written in plan (epic runner-without-files); task rwf-sdk-bundler-line fills them.
describe('the Sherlo line', () => {
  it.todo("the bundler's relay and an in-process driver are two callers of the same line");
  it.todo(
    'a hello whose protocol version the line does not speak is refused, naming both versions'
  );
});
