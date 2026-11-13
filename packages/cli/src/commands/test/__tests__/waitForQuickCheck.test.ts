import { describe, it } from 'vitest';

describe('the command waits for the quick check', () => {
  it.todo("asks for the test's status until no platform is running its quick check");
  it.todo('stops asking after the wait limit and returns the last answer');
  it.todo('shows one waiting line while it waits and none when no quick check runs');
  it.todo('never waits when the quick check is not needed');
});
