module.exports = {
  dependency: {
    platforms: {
      android: {
        sourceDir: './android',
        packageImportPath: 'import io.sherlo.storybookreactnative.SherloModulePackage;',
        packageInstance: 'new SherloModulePackage()',
      },
      ios: {},
    },
  },
};
