/**
 * Babel loader utilities for lazy loading Babel dependencies
 * Babel is loaded lazily to avoid requiring it if not available
 */

// Babel types - will be required at runtime
let babelParser: any;
let babelTraverse: any;
let babelTypes: any;

/**
 * Lazy loads the Babel parser
 * Falls back to Metro's Babel if available
 *
 * @returns The Babel parser, or null if not available
 */
export function getBabelParser(): any {
  if (!babelParser) {
    try {
      babelParser = require('@babel/parser');
    } catch {
      // Fallback to Metro's Babel if available
      try {
        const metroTransformer = require('metro-react-native-babel-transformer');
        babelParser = metroTransformer?.parser || require('@babel/parser');
      } catch {
        // Babel parser not available, mock extraction will be skipped
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
      babelTraverse = require('@babel/traverse').default;
    } catch {
      // Babel traverse not available, mock extraction will be skipped
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
      babelTypes = require('@babel/types');
    } catch {
      // Babel types not available, mock extraction will be skipped
    }
  }
  return babelTypes;
}

