const { withMainApplication } = require('@expo/config-plugins');

module.exports = function withSherloTurboModule(config) {
  return withMainApplication(config, (mod) => {
    let contents = mod.modResults.contents;

    // Add Kotlin import for TurboModule package
    if (!contents.includes('import io.sherlo.storybookreactnative.SherloTurboPackage')) {
      contents = contents.replace(
        /(import .*?\n\n)/s,
        `$1import io.sherlo.storybookreactnative.SherloTurboPackage\n\n`
      );
    }

    // Register TurboModule in getPackages() for Kotlin
    if (!contents.includes('SherloTurboPackage()')) {
      contents = contents.replace(
        /(val packages = PackageList\(this\).packages(?:[\s\S]*?)return packages)/,
        (match) => {
          // Calculate the indentation by finding the whitespace before "return packages"
          const indentMatch = match.match(/(\s+)return packages/);
          const indent = indentMatch ? indentMatch[1] : '            '; // fallback indent if not found

          // Add the package before the return statement with proper indentation
          return match.replace(
            /return packages/,
            `// Add Sherlo TurboModule\n${indent}packages.add(SherloTurboPackage())\n${indent}return packages`
          );
        }
      );
    }

    mod.modResults.contents = contents;
    return mod;
  });
};
