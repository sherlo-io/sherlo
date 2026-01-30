import Storybook from './.rnstorybook'; // Sherlo-enabled Storybook

// Sherlo requires Storybook access to run visual tests
//
// Want to switch between Storybook and your app?
// See how: https://sherlo.io/docs/setup?storybook=integrated#storybook-access
export default function App() {
  return <Storybook />;
}
