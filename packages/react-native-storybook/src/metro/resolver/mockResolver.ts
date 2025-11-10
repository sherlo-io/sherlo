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
 * @returns A resolver function that redirects to mock files when available
 */
export function createMockResolver(
  projectRoot: string,
  baseResolver: (context: any, moduleName: string, platform: string | null) => any
) {
  return (context: any, moduleName: string, platform: string | null) => {
    // Check if this package/module has mocks and redirect to mock file
    // Mock files are generated after transformer extracts mocks
    const mockFilePath = getMockFilePath(moduleName, projectRoot);

    if (fs.existsSync(mockFilePath)) {
      return {
        type: 'sourceFile',
        filePath: mockFilePath,
      };
    }

    // Fallback to default resolver
    return baseResolver(context, moduleName, platform);
  };
}

