/**
 * Pre-generates mock files during withSherlo setup (before Metro initializes)
 * This ensures mock files exist before Metro tries to resolve modules
 * Similar to how Storybook generates storybook.requires.ts during setup
 */

import * as fs from 'fs';
import * as path from 'path';
import type { StoryMockMap } from '../types';
import { extractMocksFromTransformedCode } from '../mockExtractionTransformer';
import { generateAllMockFiles } from '../generateMockFile';
import { getBabelParser } from '../mockExtraction/babelLoader';
import { generateMockRequires } from './generateMockRequires';
import { SHERLO_DIR_NAME, MOCK_DIR_NAME } from '../constants';

/**
 * Pre-generates mock files by parsing story files synchronously during setup
 * This runs before Metro initializes, ensuring mock files exist when Metro resolves modules
 * 
 * @param storyFiles - Array of story file paths to parse
 * @param projectRoot - The project root directory
 * @returns Map of generated mock file paths
 */
export function preGenerateMockFiles(
  storyFiles: string[],
  projectRoot: string
): Map<string, string> {
  const allMocks: StoryMockMap = new Map();
  
  console.log(`[SHERLO] Pre-generating mock files from ${storyFiles.length} story file(s)...`);
  
  // Try to resolve Babel parser with explicit project root
  // In EAS builds, module resolution might need explicit paths
  let parser: any = null;
  try {
    // Strategy 1: Try standard require
    parser = require('@babel/parser');
  } catch {
    try {
      // Strategy 2: Try resolving from project root explicitly
      const parserPath = require.resolve('@babel/parser', {
        paths: [
          path.join(projectRoot, 'node_modules'),
          path.join(projectRoot, '../../node_modules'), // Workspace root for monorepos
        ],
      });
      parser = require(parserPath);
    } catch (error: any) {
      console.warn(`[SHERLO] Failed to resolve @babel/parser from project root ${projectRoot}: ${error.message}`);
      try {
        // Strategy 3: Try from current working directory
        parser = require('@babel/parser');
      } catch {
        console.warn(`[SHERLO] Babel parser not available for pre-generation. Mocks will be generated during bundling.`);
        console.warn(`[SHERLO] This may cause mocks to not work in preview builds. Ensure @babel/parser is installed in ${projectRoot}/node_modules`);
        return new Map();
      }
    }
  }
  
  if (!parser) {
    console.warn(`[SHERLO] Babel parser not available for pre-generation. Mocks will be generated during bundling.`);
    return new Map();
  }
  
  // Parse each story file and extract mocks
  for (const storyFile of storyFiles) {
    try {
      if (!fs.existsSync(storyFile)) {
        console.warn(`[SHERLO] Story file not found: ${storyFile}`);
        continue;
      }
      
      // Read the story file (TypeScript/JavaScript source)
      const sourceCode = fs.readFileSync(storyFile, 'utf-8');
      
      // Extract mocks directly from TypeScript source
      // We'll copy code strings as-is to TypeScript generated files
      // Metro will handle TypeScript compilation
      const extractedMocks = extractMocksFromTransformedCode(
        sourceCode,
        storyFile,
        projectRoot
      );
      
      // Merge into all mocks
      for (const [storyId, packageMocks] of extractedMocks.entries()) {
        allMocks.set(storyId, packageMocks);
      }
      
      if (extractedMocks.size > 0) {
        console.log(`[SHERLO] Pre-extracted mocks from ${path.basename(storyFile)}: ${extractedMocks.size} story variant(s)`);
      }
    } catch (error: any) {
      console.warn(`[SHERLO] Failed to pre-parse story file ${path.basename(storyFile)}: ${error.message}`);
      if (error.stack) {
        console.warn(`[SHERLO] Error stack: ${error.stack.split('\n').slice(0, 3).join('\n')}`);
      }
      // Continue with other files
    }
  }
  
  // Generate mock files from all extracted mocks
  if (allMocks.size > 0) {
    console.log(`[SHERLO] Pre-generating mock files from ${allMocks.size} story variant(s)...`);
    
    // CRITICAL: Always clear mock directories before generation to ensure fresh files
    // This prevents Metro from using stale cached mock files
    const { getMockDirectory } = require('../constants');
    const mockDir = getMockDirectory(projectRoot);
    
    if (fs.existsSync(mockDir)) {
      // Remove all existing mock files to force fresh generation
      const existingFiles = fs.readdirSync(mockDir);
      for (const file of existingFiles) {
        if (file.endsWith('.js') || file.endsWith('.ts')) {
          try {
            fs.unlinkSync(path.join(mockDir, file));
          } catch (error: any) {
            // Ignore errors (file might be locked or already deleted)
          }
        }
      }
      if (existingFiles.length > 0) {
        console.log(`[SHERLO] Cleared ${existingFiles.filter(f => f.endsWith('.js') || f.endsWith('.ts')).length} existing mock file(s) before regeneration`);
      }
    }
    
    // Clear cache during pre-generation to ensure fresh generation with latest extraction logic
    // Cache is useful during Metro bundling to merge across workers, but pre-generation should be authoritative
    const mockFiles = generateAllMockFiles(allMocks, projectRoot, true);
    console.log(`[SHERLO] Pre-generated ${mockFiles.size} mock file(s)`);
    
    // Generate mock-files.requires.ts that imports all mock files via require.context()
    // This ensures Metro preserves all exports (same pattern as Storybook)
    generateMockRequires(projectRoot, mockFiles);
    
    return mockFiles;
  } else {
    console.log(`[SHERLO] No mocks found in story files, skipping pre-generation`);
    return new Map();
  }
}

