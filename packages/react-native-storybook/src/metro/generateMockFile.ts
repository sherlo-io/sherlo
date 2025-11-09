/**
 * Generates a smart mock file that calls getCurrentStory() at runtime
 * This is a scrappy implementation for testing
 */

import * as path from 'path';
import * as fs from 'fs';
import { StoryMockMap } from './mockExtraction';

/**
 * Generates a mock file for a package that checks getCurrentStory() at runtime
 */
export function generateMockFile(
  packageName: string,
  storyMocks: StoryMockMap,
  projectRoot: string
): string {
  // Collect all mocks for this package across all stories
  const packageMocksByStory: Record<string, any> = {};
  
  for (const [storyId, packageMocks] of storyMocks.entries()) {
    const pkgMock = packageMocks.get(packageName);
    if (pkgMock) {
      packageMocksByStory[storyId] = pkgMock;
    }
  }
  
  if (Object.keys(packageMocksByStory).length === 0) {
    throw new Error(`No mocks found for package ${packageName}`);
  }
  
  // Generate mock file code
  const storyIds = Object.keys(packageMocksByStory);
  const firstStoryMock = packageMocksByStory[storyIds[0]];
  const exportNames = Object.keys(firstStoryMock);
  
  // Serialize functions to strings (scrappy approach)
  const storyMocksSerialized: Record<string, Record<string, string>> = {};
  for (const [storyId, mock] of Object.entries(packageMocksByStory)) {
    storyMocksSerialized[storyId] = {};
    for (const [exportName, exportValue] of Object.entries(mock)) {
      // Handle function objects with __isFunction marker from AST extraction
      if (exportValue && typeof exportValue === 'object' && (exportValue as any).__isFunction) {
        storyMocksSerialized[storyId][exportName] = (exportValue as any).__code || '() => {}';
      } else if (typeof exportValue === 'function') {
        storyMocksSerialized[storyId][exportName] = exportValue.toString();
      } else {
        storyMocksSerialized[storyId][exportName] = JSON.stringify(exportValue);
      }
    }
  }
  
  const mockCode = `/**
 * Auto-generated mock file for ${packageName}
 * This file checks __SHERLO_CURRENT_STORY_ID__ at runtime to return the correct mock
 */

// All mocks for this package across all stories
const storyMocks = ${JSON.stringify(storyMocksSerialized, null, 2)};

// Helper to get current story ID from global
const getCurrentStory = () => {
  const storyId = (typeof global !== 'undefined' && global.__SHERLO_CURRENT_STORY_ID__) || null;
  console.log('[SHERLO:mock] Current story ID:', storyId);
  return storyId;
};

// Smart mock that checks current story at runtime
const mock = {
${exportNames.map((exportName) => {
  return `  ${exportName}: function(...args) {
    const storyId = getCurrentStory();
    console.log('[SHERLO:mock] ${packageName}.${exportName} called for story:', storyId);
    const storyMock = storyMocks[storyId];
    
    if (storyMock && storyMock.${exportName}) {
      const mockFn = eval('(' + storyMock.${exportName} + ')');
      const result = mockFn(...args);
      console.log('[SHERLO:mock] Returning mock result:', result);
      return result;
    }
    
    // Fallback to real implementation
    try {
      const realModule = require('${packageName}:real');
      console.log('[SHERLO:mock] Using real implementation for story:', storyId);
      return realModule.${exportName}(...args);
    } catch (e) {
      // If real module not available, return undefined or throw
      console.warn('[SHERLO:mock] No mock found for story "' + storyId + '" and real module not available');
      return undefined;
    }
  }`;
}).join(',\n')}
};

module.exports = mock;
`;

  // Write to a temp location that Metro can resolve
  // Use node_modules/.sherlo-mocks/ to make it easy to resolve
  const mockDir = path.join(projectRoot, 'node_modules', '.sherlo-mocks');
  if (!fs.existsSync(mockDir)) {
    fs.mkdirSync(mockDir, { recursive: true });
  }
  
  const mockFilePath = path.join(mockDir, `${packageName}.js`);
  fs.writeFileSync(mockFilePath, mockCode, 'utf-8');
  
  console.log(`[SHERLO:mockGen] Generated mock file: ${mockFilePath}`);
  return mockFilePath;
}

/**
 * Generates mock files for all packages that have mocks
 */
export function generateAllMockFiles(
  storyMocks: StoryMockMap,
  projectRoot: string
): Map<string, string> {
  const mockFiles = new Map<string, string>();
  
  // Collect all unique packages that have mocks
  const packages = new Set<string>();
  for (const [, packageMocks] of storyMocks.entries()) {
    for (const pkgName of packageMocks.keys()) {
      packages.add(pkgName);
    }
  }
  
  // Generate mock file for each package
  for (const packageName of packages) {
    try {
      const mockFilePath = generateMockFile(packageName, storyMocks, projectRoot);
      mockFiles.set(packageName, mockFilePath);
    } catch (error: any) {
      console.warn(`[SHERLO:mockGen] Failed to generate mock for ${packageName}:`, error.message);
    }
  }
  
  return mockFiles;
}

