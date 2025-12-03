/**
 * Regenerates mock files for a single story file if its mock content has changed
 * Uses hash comparison to only write files when content actually changes
 * Returns array of mock file paths that were actually changed
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { extractMocksFromTransformedCode } from '../mockExtractionTransformer';
import { generateAllMockFiles } from '../generateMockFile';
import { generateMockRequires } from './generateMockRequires';
import { getMockFilePath } from '../resolver/pathNormalization';

/**
 * Computes SHA-256 hash of file content
 */
function computeFileHash(filePath: string): string | null {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    return crypto.createHash('sha256').update(content).digest('hex');
  } catch {
    return null;
  }
}

/**
 * Regenerates mock files for a single story file if its mock content has changed
 * Returns array of mock file paths that were actually changed (content hash changed)
 */
export function regenerateMocksForStory(
  storyFilePath: string,
  projectRoot: string,
  allStoryFiles: string[]
): string[] {
  console.log(`[SHERLO] REGEN: Starting regeneration check for ${path.basename(storyFilePath)}`);
  
  try {
    // Read story file source
    if (!fs.existsSync(storyFilePath)) {
      console.warn(`[SHERLO] REGEN: Story file not found: ${storyFilePath}`);
      return [];
    }
    
    const sourceCode = fs.readFileSync(storyFilePath, 'utf-8');
    console.log(`[SHERLO] REGEN: Read story file (${sourceCode.length} chars)`);
    
    // Extract mocks from this story file
    const extractedMocks = extractMocksFromTransformedCode(
      sourceCode,
      storyFilePath,
      projectRoot
    );
    
    console.log(`[SHERLO] REGEN: Extracted ${extractedMocks.size} mock variant(s)`);
    
    if (extractedMocks.size === 0) {
      // No mocks in this file, skip regeneration
      console.log(`[SHERLO] REGEN: No mocks found, skipping`);
      return [];
    }
    
    // Get list of affected packages before regeneration
    const affectedPackages = new Set<string>();
    for (const [storyId, packageMocks] of extractedMocks.entries()) {
      for (const pkgName of packageMocks.keys()) {
        affectedPackages.add(pkgName);
      }
    }
    
    console.log(`[SHERLO] REGEN: Affected packages: ${Array.from(affectedPackages).join(', ')}`);
    
    // Check which mock files exist and their current content hashes
    const mockFilesBefore = new Map<string, string | null>();
    for (const pkgName of affectedPackages) {
      const mockFilePath = getMockFilePath(pkgName, projectRoot);
      const hash = computeFileHash(mockFilePath);
      mockFilesBefore.set(mockFilePath, hash);
      if (hash) {
        console.log(`[SHERLO] REGEN: Current hash for ${path.basename(mockFilePath)}: ${hash.substring(0, 16)}...`);
      } else {
        console.log(`[SHERLO] REGEN: Mock file doesn't exist yet: ${path.basename(mockFilePath)}`);
      }
    }
    
    // Read all story files to get complete mock map
    // We need all mocks because one package might be mocked in multiple stories
    const allMocks: Map<string, Map<string, any>> = new Map();
    
    // First, load existing mocks from other story files
    for (const otherStoryFile of allStoryFiles) {
      if (otherStoryFile === storyFilePath) {
        // Skip the current file, we already extracted it
        continue;
      }
      
      try {
        if (fs.existsSync(otherStoryFile)) {
          const otherSourceCode = fs.readFileSync(otherStoryFile, 'utf-8');
          const otherMocks = extractMocksFromTransformedCode(
            otherSourceCode,
            otherStoryFile,
            projectRoot
          );
          
          // Merge into all mocks
          for (const [storyId, packageMocks] of otherMocks.entries()) {
            allMocks.set(storyId, packageMocks);
          }
        }
      } catch (error: any) {
        // Skip errors for other files, continue
        console.warn(`[SHERLO] REGEN: Failed to read story file ${path.basename(otherStoryFile)}: ${error.message}`);
      }
    }
    
    // Add mocks from the changed file
    for (const [storyId, packageMocks] of extractedMocks.entries()) {
      allMocks.set(storyId, packageMocks);
    }
    
    console.log(`[SHERLO] REGEN: Total mocks across all stories: ${allMocks.size} variant(s)`);
    
    // Generate content in memory first and compare hashes BEFORE writing
    // This prevents writing files when only timestamp changed (comment-only changes)
    const { generateMockFileContent } = require('../generateMockFile');
    const packagesToWrite = new Set<string>();
    
    for (const pkgName of affectedPackages) {
      const mockFilePath = getMockFilePath(pkgName, projectRoot);
      const oldHash = mockFilesBefore.get(mockFilePath);
      
      try {
        // Generate new content in memory
        const newContent = generateMockFileContent(pkgName, allMocks, projectRoot);
        
        // Compute hash of new content (no timestamp to exclude anymore)
        const newHash = crypto.createHash('sha256').update(newContent).digest('hex');
        
        if (newHash !== oldHash) {
          packagesToWrite.add(pkgName);
          console.log(`[SHERLO] REGEN: ✅ Mock content changed for ${pkgName} (hash: ${newHash.substring(0, 16)}...)`);
        } else {
          console.log(`[SHERLO] REGEN: ⏭️  Mock content unchanged for ${pkgName} (hash unchanged, skipping write)`);
        }
      } catch (error: any) {
        // If generation fails, write anyway to ensure file exists
        console.warn(`[SHERLO] REGEN: Failed to generate content for ${pkgName}, will write anyway: ${error.message}`);
        packagesToWrite.add(pkgName);
      }
    }
    
    // Only regenerate files that actually changed
    if (packagesToWrite.size > 0) {
      // Filter allMocks to only include packages that changed
      const filteredMocks: Map<string, Map<string, any>> = new Map();
      for (const [storyId, packageMocks] of allMocks.entries()) {
        const filteredPackageMocks = new Map<string, any>();
        for (const [pkgName, mock] of packageMocks.entries()) {
          if (packagesToWrite.has(pkgName)) {
            filteredPackageMocks.set(pkgName, mock);
          }
        }
        if (filteredPackageMocks.size > 0) {
          filteredMocks.set(storyId, filteredPackageMocks);
        }
      }
      
      // Regenerate only changed mock files
      const mockFiles = generateAllMockFiles(filteredMocks, projectRoot, false);
      
      // Regenerate mock-files.requires.ts (always regenerate this as it might reference new files)
      generateMockRequires(projectRoot, mockFiles);
      
      // Return list of changed files
      const changedMockFiles: string[] = [];
      for (const pkgName of packagesToWrite) {
        const mockFilePath = getMockFilePath(pkgName, projectRoot);
        if (fs.existsSync(mockFilePath)) {
          changedMockFiles.push(mockFilePath);
        }
      }
      
      console.log(`[SHERLO] REGEN: Regenerated ${changedMockFiles.length} mock file(s) that actually changed`);
      return changedMockFiles;
    } else {
      console.log(`[SHERLO] REGEN: No mock files changed, skipping write`);
      return [];
    }
  } catch (error: any) {
    console.error(`[SHERLO] REGEN: Failed to regenerate mocks for ${storyFilePath}: ${error.message}`);
    if (error.stack) {
      console.error(`[SHERLO] REGEN: Error stack: ${error.stack.split('\n').slice(0, 5).join('\n')}`);
    }
    return [];
  }
}

