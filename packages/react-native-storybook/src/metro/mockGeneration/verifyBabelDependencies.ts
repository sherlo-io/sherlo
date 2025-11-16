/**
 * Verifies that Babel dependencies are available for mock extraction
 * This runs during withSherlo setup to catch issues early
 */

import * as path from 'path';
import * as fs from 'fs';

export interface BabelVerificationResult {
  available: boolean;
  missing: string[];
  warnings: string[];
}

/**
 * Verifies that required Babel dependencies are available
 * Tries multiple resolution strategies to find dependencies
 * 
 * @param projectRoot - The project root directory
 * @returns Verification result with availability status and any warnings
 */
export function verifyBabelDependencies(projectRoot: string): BabelVerificationResult {
  const requiredPackages = ['@babel/parser', '@babel/traverse', '@babel/types'];
  const missing: string[] = [];
  const warnings: string[] = [];
  
  for (const pkg of requiredPackages) {
    let found = false;
    let lastError: string | null = null;
    
    // Strategy 1: Try standard require
    try {
      require.resolve(pkg);
      found = true;
    } catch (error: any) {
      lastError = error.message;
    }
    
    // Strategy 2: Try resolving from project root
    if (!found) {
      try {
        const pkgPath = require.resolve(pkg, {
          paths: [
            path.join(projectRoot, 'node_modules'),
            path.join(projectRoot, '../../node_modules'), // Workspace root for monorepos
          ],
        });
        // Verify the path actually exists
        if (fs.existsSync(pkgPath)) {
          found = true;
        }
      } catch (error: any) {
        if (!lastError) {
          lastError = error.message;
        }
      }
    }
    
    // Strategy 3: Check if node_modules exists and contains the package
    if (!found) {
      const nodeModulesPath = path.join(projectRoot, 'node_modules', pkg);
      if (fs.existsSync(nodeModulesPath)) {
        found = true;
        warnings.push(`${pkg} exists in node_modules but cannot be resolved via require.resolve`);
      }
    }
    
    if (!found) {
      missing.push(pkg);
      if (lastError) {
        warnings.push(`${pkg}: ${lastError}`);
      }
    }
  }
  
  return {
    available: missing.length === 0,
    missing,
    warnings,
  };
}

