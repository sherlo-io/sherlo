import { UNUSED_FAKE_LINE, unusedFakeLine } from '../../mocking/unusedFakeLine';

describe('the line an unused fake travels in', () => {
  it('the line names the module and the layer, and reads back to both', () => {
    const line = unusedFakeLine('pkg/analytics', 'shared setup');

    expect(UNUSED_FAKE_LINE.exec(line)?.slice(1)).toEqual(['pkg/analytics', 'shared setup']);
  });
});
