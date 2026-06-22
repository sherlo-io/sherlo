/**
 * Computes a native fingerprint for the project using @expo/fingerprint.
 *
 * The fingerprint hashes native inputs: ios/ + android/ dirs, native npm deps,
 * Podfile.lock / Gradle files, config plugins, patches. It works on bare React
 * Native projects (not only Expo apps).
 *
 * Returns the fingerprint hash string on success, or null when:
 *   - @expo/fingerprint is not installed in the project.
 *   - The project has no native directories (JS-only / EAS Update path).
 *   - Any other computation error.
 *
 * The API treats a missing nativeFingerprint as "safe unknown" and bails to
 * FULL capture, so returning null is always the conservative path.
 */
export async function computeNativeFingerprint(projectRoot: string): Promise<string | null> {
  try {
    // Dynamic import so the CLI still works without @expo/fingerprint installed.
    const { createFingerprintAsync } = await import('@expo/fingerprint');
    const fingerprint = await createFingerprintAsync(projectRoot);
    return fingerprint.hash ?? null;
  } catch {
    return null;
  }
}
