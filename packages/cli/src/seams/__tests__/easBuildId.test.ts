import { describe, expect, it } from 'vitest';
import { easBuildIdIn } from '../easBuildId';

describe('the id of an EAS build in its output', () => {
  it('reads the id of the first build in the list eas build printed last', () => {
    const output = 'Uploading\n[debug] a line that starts with a bracket\n[{ "id": "abc-1" }]\n';
    expect(easBuildIdIn(output)).toBe('abc-1');
  });

  it('answers nothing when no list of builds is there', () => {
    expect(easBuildIdIn('Uploading\n[not json]\n')).toBeUndefined();
  });
});
