/**
 * Babel loader utilities for lazy loading Babel dependencies
 * Babel is loaded lazily to avoid requiring it if not available
 */

import * as path from 'path';
import * as fs from 'fs';

// Babel types - will be required at runtime
let babelParser: any;
let babelTraverse: any;
let babelTypes: any;
let babelGenerator: any;

/**
 * Gets the project root from the same source as the transformer
 * This ensures consistency between transformer and Babel loader
 */
function getProjectRoot(): string {
  // Try to read from .sherlo/story-files.json (same as transformer)
  try {
    const storyFilesPath = path.join(process.cwd(), '.sherlo', 'story-files.json');
    if (fs.existsSync(storyFilesPath)) {
      const data = JSON.parse(fs.readFileSync(storyFilesPath, 'utf-8'));
      return data.projectRoot || process.cwd();
    }
  } catch {
    // Fallback to process.cwd() if file read fails
  }
  return process.cwd();
}

/**
 * Lazy loads the Babel parser
 * Falls back to Metro's Babel if available
 *
 * @returns The Babel parser, or null if not available
 */
export function getBabelParser(): any {
  if (!babelParser) {
    try {
      // Strategy 1: Try standard require (works if package is in project root node_modules)
      babelParser = require('@babel/parser');
    } catch {
      try {
        // Strategy 2: Try resolving from project root (use same projectRoot as transformer)
        const projectRoot = getProjectRoot();
        const parserPath = require.resolve('@babel/parser', {
          paths: [
            path.join(projectRoot, 'node_modules'),
            path.join(projectRoot, '../../node_modules'), // Workspace root for monorepos
          ],
        });
        babelParser = require(parserPath);
      } catch {
        try {
          // Strategy 3: Try Metro's Babel if available
          const metroTransformer = require('metro-react-native-babel-transformer');
          babelParser = metroTransformer?.parser || require('@babel/parser');
        } catch {
          try {
            // Strategy 4: Try Node's internal module resolution
            const Module = require('module');
            const projectRoot = getProjectRoot();
            const parserPath = Module._resolveFilename('@babel/parser', {
              id: __filename,
              filename: __filename,
              paths: Module._nodeModulePaths(projectRoot),
            });
            babelParser = require(parserPath);
          } catch {
            // All strategies failed - Babel parser not available
          }
        }
      }
    }
  }
  return babelParser;
}

/**
 * Lazy loads the Babel traverse module
 *
 * @returns The Babel traverse function, or null if not available
 */
export function getBabelTraverse(): any {
  if (!babelTraverse) {
    try {
      // Strategy 1: Try standard require
      babelTraverse = require('@babel/traverse').default;
    } catch {
      try {
        // Strategy 2: Try resolving from project root (use same projectRoot as transformer)
        const projectRoot = getProjectRoot();
        const traversePath = require.resolve('@babel/traverse', {
          paths: [
            path.join(projectRoot, 'node_modules'),
            path.join(projectRoot, '../../node_modules'), // Workspace root for monorepos
          ],
        });
        babelTraverse = require(traversePath).default;
      } catch {
        try {
          // Strategy 3: Try Node's internal module resolution
          const Module = require('module');
          const projectRoot = getProjectRoot();
          const traversePath = Module._resolveFilename('@babel/traverse', {
            id: __filename,
            filename: __filename,
            paths: Module._nodeModulePaths(projectRoot),
          });
          babelTraverse = require(traversePath).default;
        } catch {
          // All strategies failed - Babel traverse not available
        }
      }
    }
  }
  return babelTraverse;
}

/**
 * Lazy loads the Babel types module
 *
 * @returns The Babel types, or null if not available
 */
export function getBabelTypes(): any {
  if (!babelTypes) {
    try {
      // Strategy 1: Try standard require
      babelTypes = require('@babel/types');
    } catch {
      try {
        // Strategy 2: Try resolving from project root (use same projectRoot as transformer)
        const projectRoot = getProjectRoot();
        const typesPath = require.resolve('@babel/types', {
          paths: [
            path.join(projectRoot, 'node_modules'),
            path.join(projectRoot, '../../node_modules'), // Workspace root for monorepos
          ],
        });
        babelTypes = require(typesPath);
      } catch {
        try {
          // Strategy 3: Try Node's internal module resolution
          const Module = require('module');
          const projectRoot = getProjectRoot();
          const typesPath = Module._resolveFilename('@babel/types', {
            id: __filename,
            filename: __filename,
            paths: Module._nodeModulePaths(projectRoot),
          });
          babelTypes = require(typesPath);
        } catch {
          // All strategies failed - Babel types not available
        }
      }
    }
  }
  return babelTypes;
}

/**
 * Lazy loads the Babel generator module
 *
 * @returns The Babel generator, or null if not available
 */
export function getBabelGenerator(): any {
  if (!babelGenerator) {
    try {
      // Strategy 1: Try standard require
      babelGenerator = require('@babel/generator').default;
    } catch {
      try {
        // Strategy 2: Try resolving from project root (use same projectRoot as transformer)
        const projectRoot = getProjectRoot();
        const generatorPath = require.resolve('@babel/generator', {
          paths: [
            path.join(projectRoot, 'node_modules'),
            path.join(projectRoot, '../../node_modules'), // Workspace root for monorepos
          ],
        });
        babelGenerator = require(generatorPath).default;
      } catch {
        try {
          // Strategy 3: Try Node's internal module resolution
          const Module = require('module');
          const projectRoot = getProjectRoot();
          const generatorPath = Module._resolveFilename('@babel/generator', {
            id: __filename,
            filename: __filename,
            paths: Module._nodeModulePaths(projectRoot),
          });
          babelGenerator = require(generatorPath).default;
        } catch {
          // All strategies failed - Babel generator not available
        }
      }
    }
  }
  return babelGenerator;
}

