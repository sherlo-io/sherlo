function getGlobalStates() {
  return {
    isVerifySetupTest: global.SHERLO_VERIFY_SETUP,
    isIntegrationTest: !!global.SHERLO_VERIFY_CONFIG || global.SHERLO_VERIFY_SETUP,
    testConfig: typeof global.SHERLO_VERIFY_CONFIG === 'object' ? global.SHERLO_VERIFY_CONFIG : {},
  };
}

export default getGlobalStates;
