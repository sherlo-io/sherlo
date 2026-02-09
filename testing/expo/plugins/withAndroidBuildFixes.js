const { withAppBuildGradle, withGradleProperties } = require('@expo/config-plugins');

const withAndroidBuildFixes = (config) => {
  // 1. Increase Memory in gradle.properties
  config = withGradleProperties(config, (config) => {
    const properties = [
      { key: 'org.gradle.jvmargs', value: '-Xmx4g -XX:MaxMetaspaceSize=1g' }
    ];

    properties.forEach((prop) => {
      const existing = config.modResults.find((item) => item.key === prop.key);
      if (existing) {
        existing.value = prop.value;
      } else {
        config.modResults.push({
          type: 'property',
          key: prop.key,
          value: prop.value,
        });
      }
    });

    return config;
  });

  // 2. Disable strict linting in app/build.gradle
  config = withAppBuildGradle(config, (config) => {
    const lintConfig = `
android {
    lintOptions {
        checkReleaseBuilds false
        abortOnError false
    }
    lint {
        checkReleaseBuilds false
        abortOnError false
    }
}
`;
    // Append to the end of the file. Gradle merges multiple 'android' blocks.
    if (!config.modResults.contents.includes('checkReleaseBuilds false')) {
      config.modResults.contents += lintConfig;
    }
    return config;
  });

  return config;
};

module.exports = withAndroidBuildFixes;
