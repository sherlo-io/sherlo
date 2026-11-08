/**
 * A project.pbxproj in the shape Xcode writes, holding the native targets a test names, for the
 * tests of the Xcode project reader (metro/xcodeProject.js) and of what reads through it.
 */

/** A native target to lay: its name, its product type, and its build configurations. */
export type FixtureTarget = {
  name: string;
  productType: string;
  configurations: string[];
};

/** The product types of a test target and of an extension, beside the reader's application one. */
export const UNIT_TEST_PRODUCT_TYPE = 'com.apple.product-type.bundle.unit-test';
export const APP_EXTENSION_PRODUCT_TYPE = 'com.apple.product-type.app-extension';

/** A 24-character id, as Xcode gives every object, made from a counter so each is unique. */
function objectId(kind: string, index: number): string {
  return `${kind}${String(index).padStart(24 - kind.length, '0')}`;
}

/**
 * The project file's text, with the targets' ids `TARGET...` in order (the first target's id is
 * `targetIdOf(0)`). Each configuration carries a buildSettings block with a key that ends in
 * `name`, so a reader that looks inside it misreads.
 */
export function pbxprojWith(targets: FixtureTarget[]): string {
  const configurations: string[] = [];
  const lists: string[] = [];
  const nativeTargets: string[] = [];
  let configurationCount = 0;

  targets.forEach((target, targetIndex) => {
    const configurationIds = target.configurations.map((name) => {
      const id = objectId('CONF', configurationCount++);
      configurations.push(
        `\t\t${id} /* ${name} */ = {\n\t\t\tisa = XCBuildConfiguration;\n` +
          `\t\t\tbuildSettings = {\n\t\t\t\tPRODUCT_NAME = "$(TARGET_NAME)";\n\t\t\t\tname = Wrong;\n\t\t\t};\n` +
          `\t\t\tname = "${name}";\n\t\t};`
      );
      return id;
    });
    const listId = objectId('LIST', targetIndex);
    lists.push(
      `\t\t${listId} /* Build configuration list for PBXNativeTarget "${target.name}" */ = {\n` +
        `\t\t\tisa = XCConfigurationList;\n\t\t\tbuildConfigurations = (\n` +
        configurationIds.map((id) => `\t\t\t\t${id} /* config */,\n`).join('') +
        `\t\t\t);\n\t\t\tdefaultConfigurationName = Release;\n\t\t};`
    );
    nativeTargets.push(
      `\t\t${targetIdOf(targetIndex)} /* ${target.name} */ = {\n\t\t\tisa = PBXNativeTarget;\n` +
        `\t\t\tbuildConfigurationList = ${listId} /* Build configuration list for PBXNativeTarget "${target.name}" */;\n` +
        `\t\t\tbuildPhases = (\n\t\t\t);\n\t\t\tname = "${target.name}";\n` +
        `\t\t\tproductName = "${target.name}";\n\t\t\tproductType = "${target.productType}";\n\t\t};`
    );
  });

  return [
    '// !$*UTF8*$!',
    '{',
    '\tobjects = {',
    '/* Begin PBXNativeTarget section */',
    ...nativeTargets,
    '/* End PBXNativeTarget section */',
    '/* Begin XCBuildConfiguration section */',
    ...configurations,
    '/* End XCBuildConfiguration section */',
    '/* Begin XCConfigurationList section */',
    ...lists,
    '/* End XCConfigurationList section */',
    '\t};',
    '}',
    '',
  ].join('\n');
}

/** The id `pbxprojWith` gives the target at this index. */
export function targetIdOf(index: number): string {
  return objectId('TARGET', index);
}
