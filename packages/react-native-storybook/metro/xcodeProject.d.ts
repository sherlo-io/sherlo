/** The types of ./xcodeProject.js, the reader of an app's Xcode project files. */

/** The product type of a target that builds an app, as opposed to a test bundle or an extension. */
export const APPLICATION_PRODUCT_TYPE: 'com.apple.product-type.application';

/** One native target of an Xcode project. */
export type NativeTarget = {
  id: string;
  name: string | undefined;
  productType: string | undefined;
  /** The target's own build configurations, spelled as the project spells them. */
  configurations: string[];
};

export function readNativeTargets(pbxproj: string): NativeTarget[];

export function readXcodeProjects(
  iosFolder: string
): Array<{ container: string; targets: NativeTarget[] }>;
