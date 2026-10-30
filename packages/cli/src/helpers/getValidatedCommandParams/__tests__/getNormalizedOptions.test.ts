import { describe, expect, it } from 'vitest';
import getNormalizedOptions from '../getNormalizedOptions';

describe('the options a push is given', () => {
  it("refuses a --devices that is not JSON, saying it must be the config's devices as JSON", () => {
    expect(() => getNormalizedOptions({ devices: 'pixel.7' } as any)).toThrow(
      "`--devices` must be the config's devices as JSON"
    );
  });
});
