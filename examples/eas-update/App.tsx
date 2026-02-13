/**
 * App entry point
 *
 * Sherlo requires Storybook access to run visual tests
 *
 * Want to switch between Storybook and your app?
 * Learn how: https://sherlo.io/docs/setup?storybook=integrated#storybook-access
 */

import Storybook from './.rnstorybook'; // Modified for Sherlo

export default function App() {
  return <Storybook />;
}
