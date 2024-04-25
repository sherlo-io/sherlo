function getGlobalStates() {
  return {
    isVerifySetupTest: global.SHERLO_VERIFY_SETUP,
    testConfig:
      typeof global.SHERLO_TEST_CONFIG === 'object' ? global.SHERLO_TEST_CONFIG : undefined,
  };
}

export default getGlobalStates;
