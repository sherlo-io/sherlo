const { withMainApplication } = require('@expo/config-plugins');

module.exports = function withSherloTurboModule(config) {
  return withMainApplication(config, (mod) => {
    let contents = mod.modResults.contents;

    // Add Java import for your TurboModule package
    if (!contents.includes('import io.sherlo.storybookreactnative.SherloTurboPackage;')) {
      contents = contents.replace(
        /(package .*?;\n)/,
        `$1import io.sherlo.storybookreactnative.SherloTurboPackage;\n`
      );
    }

    // Register your TurboModule in getPackages()
    if (!contents.includes('new SherloTurboPackage()')) {
      contents = contents.replace(
        /return Arrays\.?<ReactPackage>asList\(([\s\S]*?)\)/,
        (match, inside) => {
          const cleaned = inside.trim().replace(/,\s*$/, '');
          return `return Arrays.<ReactPackage>asList(${cleaned}, new SherloTurboPackage())`;
        }
      );
    }

    mod.modResults.contents = contents;
    return mod;
  });
};
