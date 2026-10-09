module.exports = {
  preset: 'react-native',
  // A test file over five seconds fails the run, naming itself: the limit every suite shares.
  reporters: ['default', ['@sherlo-io/time-limits/jest', { limit: 'ordinary' }]],
};
