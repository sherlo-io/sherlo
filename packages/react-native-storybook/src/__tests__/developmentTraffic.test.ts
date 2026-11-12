import { describe, expect, it } from 'vitest';
import { isReactDevToolsAddress } from '../developmentTraffic';

describe('the app’s own development traffic', () => {
  it('loopback on the React DevTools port is development traffic and another port is not', () => {
    expect(isReactDevToolsAddress('localhost', 8097)).toBe(true);
    expect(isReactDevToolsAddress('10.0.2.2', 8097)).toBe(true);
    expect(isReactDevToolsAddress('localhost', 8098)).toBe(false);
    expect(isReactDevToolsAddress('api.example', 8097)).toBe(false);
  });
});
