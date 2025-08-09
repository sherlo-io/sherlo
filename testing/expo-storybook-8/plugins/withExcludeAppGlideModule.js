const { withProjectBuildGradle, createRunOncePlugin } = require('@expo/config-plugins');

const SUBPROJECTS_BLOCK = `
// Added by with-exclude-app-glide-module
subprojects { subproject ->
    // Prefer keeping FastImage's AppGlideModule and exclude Expo Image's
    if (subproject.name.contains('expo-image')) {
        subproject.afterEvaluate {
            def androidExt = subproject.extensions.findByName('android')
            if (androidExt != null) {
                androidExt.sourceSets.main.java.exclude('**/ExpoImageAppGlideModule.kt')
            }
        }
    }
}
`;

const withExcludeAppGlideModule = (config) => {
  return withProjectBuildGradle(config, (config) => {
    const gradle = config.modResults;
    // Ensure a single Glide AppGlideModule is not packaged by any library
    const extOpen = /ext\s*\{/;
    if (extOpen.test(gradle.contents)) {
      gradle.contents = gradle.contents.replace(/ext\s*\{([\s\S]*?)\}/, (m, body) => {
        if (body.includes('excludeAppGlideModule')) return m;
        return m.replace(body, `${body}\n    excludeAppGlideModule = true`);
      });
    } else {
      gradle.contents = `ext {\n    excludeAppGlideModule = true\n}\n` + gradle.contents;
    }
    if (!gradle.contents.includes('with-exclude-app-glide-module')) {
      gradle.contents += `\n${SUBPROJECTS_BLOCK}`;
    }
    return config;
  });
};

module.exports = createRunOncePlugin(
  withExcludeAppGlideModule,
  'with-exclude-app-glide-module',
  '1.0.1'
);
