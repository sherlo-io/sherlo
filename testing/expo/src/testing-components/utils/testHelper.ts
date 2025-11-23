/**
 * Test helper module with a default export
 * Used for testing default export mocking functionality
 */
const TestHelper = {
  getValue: () => 'original-value',
  getNumber: () => 42,
  getObject: () => ({ key: 'original' }),
};

export default TestHelper;
