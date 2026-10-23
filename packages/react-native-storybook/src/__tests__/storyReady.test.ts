import { describe, it } from 'vitest';

describe('a scene says when it is ready', () => {
  it.todo('starts the stillness check only once the named view is on screen');
  it.todo('a view named in gone must be absent before the scene is ready');
  it.todo('an error thrown while waiting beats the ready failure');
  it.todo('a mock failure is judged only after the scene settled');
  it.todo('ready is proved again before every capture');
});
