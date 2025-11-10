/**
 * Utility module with complex object and constant exports for testing mocks
 */

/**
 * Nested object export
 */
export const config = {
  app: {
    name: 'MyApp',
    version: '1.0.0',
    settings: {
      theme: 'light',
      language: 'en',
    },
  },
  api: {
    baseUrl: 'https://api.example.com',
    timeout: 5000,
  },
};

/**
 * Array as export (not a function returning array)
 */
export const supportedLanguages = ['en', 'fr', 'de', 'es', 'ja'];

/**
 * Array of objects as export
 */
export const menuItems = [
  { id: 1, label: 'Home', path: '/' },
  { id: 2, label: 'About', path: '/about' },
  { id: 3, label: 'Contact', path: '/contact' },
];

/**
 * Constant with null value
 */
export const nullableValue: string | null = null;

/**
 * Constant with undefined value
 */
export const undefinedValue: string | undefined = undefined;

/**
 * Number constant
 */
export const MAX_RETRIES = 3;

/**
 * Boolean constant
 */
export const ENABLED = true;

/**
 * String constant
 */
export const APP_TITLE = 'Original App Title';

