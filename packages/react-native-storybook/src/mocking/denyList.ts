// Module specifiers (and `@scope/*` prefixes) that must never be mockable, since mocking them
// would break Storybook's own runtime rather than the app under test. Not enforced here - Phase
// 2 (Metro scan/shims) reads this list to skip mock generation for matching specifiers.
export const MOCK_DENY_LIST = ['react', 'react-native', '@storybook/*', '@sherlo/*'] as const;
