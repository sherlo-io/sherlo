import { describe, it } from 'vitest';

describe('Node vouches only for scenes drawn the same', () => {
  it.todo('a scene with identical paint lists at base and head is vouched for');
  it.todo(
    'a scene that touched an unkitted native call or changed native code is never vouched for'
  );
});
