import { describe, it } from 'vitest';

describe('sockets are held or refused in a scene, never real', () => {
  it.todo(
    'a socket no rule matches never reaches the network: it is refused, listed as WS, and errors the story'
  );
  it.todo("'pending' holds the socket CONNECTING for good, fires nothing, and is listed nowhere");
  it.todo("React DevTools' standalone socket on 8097 is refused");
});
