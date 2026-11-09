import { targetIdOf } from '../../../../react-native-storybook/src/__tests__/xcodeProjectFixture';

/**
 * A shared scheme in Xcode's shape, whose BuildAction builds the targets at these indexes of a
 * `pbxprojWith` project file and which archives with `archiveConfiguration`. Its TestAction names
 * the second target, as Xcode's own schemes name their test bundle.
 */
export function schemeXmlWith(buildsTargets: number[], archiveConfiguration?: string): string {
  const reference = (index: number) =>
    `<BuildableReference\n   BuildableIdentifier = "primary"\n   BlueprintIdentifier = "${targetIdOf(index)}"\n` +
    `   ReferencedContainer = "container:App.xcodeproj">\n</BuildableReference>`;
  const entries = buildsTargets
    .map(
      (index) =>
        `<BuildActionEntry buildForRunning = "YES">\n${reference(index)}\n</BuildActionEntry>\n`
    )
    .join('');
  const archiveAction = archiveConfiguration
    ? `<ArchiveAction\n   buildConfiguration = "${archiveConfiguration}"\n   revealArchiveInOrganizer = "YES">\n</ArchiveAction>\n`
    : '';
  return (
    `<Scheme>\n<BuildAction parallelizeBuildables = "YES">\n<BuildActionEntries>\n${entries}</BuildActionEntries>\n</BuildAction>\n` +
    `<TestAction buildConfiguration = "Debug">\n<Testables>\n<TestableReference>\n${reference(1)}\n</TestableReference>\n</Testables>\n</TestAction>\n` +
    `${archiveAction}</Scheme>\n`
  );
}
