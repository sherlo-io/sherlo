/**
 * Resolver for redirecting imports to mock files
 * Checks if a module has mocks and redirects to the generated mock file
 */

import * as fs from 'fs';
import { getMockFilePath } from './pathNormalization';

/**
 * Creates a resolver function that redirects mocked modules to mock files
 *
 * @param projectRoot - The project root directory
 * @param baseResolver - The base resolver function from Metro
 * @param hasStoryFiles - Whether story files exist (optimization: skip check if false)
 * @returns A resolver function that redirects to mock files when available
 */
export function createMockResolver(
  projectRoot: string,
  baseResolver: (context: any, moduleName: string, platform: string | null) => any,
  hasStoryFiles: boolean = true
) {
  return (context: any, moduleName: string, platform: string | null) => {
    // Early exit if no story files exist - no mocks possible, skip file system check
    // This optimization eliminates unnecessary fs.existsSync() calls in production builds
    if (!hasStoryFiles) {
      return baseResolver(context, moduleName, platform);
    }

    // Check if this package/module has mocks and redirect to mock file
    // Mock files are pre-generated during withSherlo setup (before Metro initializes)
    // IMPORTANT: We MUST check fs.existsSync() before returning the path
    // Metro will try to compute SHA-1 for any file path we return, even if it doesn't exist
    const mockFilePath = getMockFilePath(moduleName, projectRoot);
    
    // Only check if file exists - don't return path if it doesn't exist
    // This prevents Metro from trying to compute SHA-1 for non-existent files
    if (!fs.existsSync(mockFilePath)) {
      // Mock file doesn't exist yet - fall back to real module
      // Don't return the mock file path even if we think it might exist
      // Metro will try to compute SHA-1 for any path we return
      return baseResolver(context, moduleName, platform);
    }

    // File exists - safe to return the path
    console.log(`[SHERLO] Resolver: Redirecting "${moduleName}" to mock file (${mockFilePath})`);
    return {
      type: 'sourceFile',
      filePath: mockFilePath,
    };
  };
}

