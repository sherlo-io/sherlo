/**
 * File watcher for story files to trigger mock regeneration on changes
 * Uses Node.js fs.watch (built-in, no external dependencies)
 * Only watches files Metro is already watching (via watchFolders)
 */

import * as fs from 'fs';
import * as path from 'path';
import { regenerateMocksForStory } from './regenerateMocksForStory';

interface Watcher {
  close: () => void;
}

const activeWatchers = new Map<string, fs.FSWatcher>();

/**
 * Watches a story file for changes and regenerates mocks when it changes
 */
export function watchStoryFile(
  storyFilePath: string,
  projectRoot: string,
  allStoryFiles: string[]
): void {
  // Normalize path
  const normalizedPath = path.resolve(storyFilePath);
  
  // Skip if already watching
  if (activeWatchers.has(normalizedPath)) {
    return;
  }
  
  try {
    if (!fs.existsSync(normalizedPath)) {
      console.warn(`[SHERLO] WATCHER: Story file not found: ${normalizedPath}`);
      return;
    }
    
    console.log(`[SHERLO] WATCHER: Starting to watch ${path.basename(normalizedPath)}`);
    
    // Use debouncing to prevent multiple rapid regenerations
    let debounceTimeout: NodeJS.Timeout | null = null;
    const DEBOUNCE_MS = 300;
    
    const watcher = fs.watch(normalizedPath, { persistent: false }, (eventType) => {
      if (eventType === 'change') {
        console.log(`[SHERLO] WATCHER: File changed: ${path.basename(normalizedPath)}`);
        
        // Clear existing timeout
        if (debounceTimeout) {
          clearTimeout(debounceTimeout);
        }
        
        // Set new timeout
        debounceTimeout = setTimeout(() => {
          console.log(`[SHERLO] WATCHER: Debounce complete, regenerating mocks...`);
          try {
            const changedMockFiles = regenerateMocksForStory(normalizedPath, projectRoot, allStoryFiles);
            if (changedMockFiles.length > 0) {
              console.log(`[SHERLO] WATCHER: ✅ Successfully regenerated mocks for ${path.basename(normalizedPath)}`);
              console.log(`[SHERLO] WATCHER: ${changedMockFiles.length} mock file(s) actually changed`);
              
              // Only touch mock files that actually changed (to avoid unnecessary Metro reloads)
              for (const mockFilePath of changedMockFiles) {
                try {
                  // Touch the file by updating its mtime
                  const now = new Date();
                  fs.utimesSync(mockFilePath, now, now);
                  console.log(`[SHERLO] WATCHER: Touched ${path.basename(mockFilePath)} to trigger Metro reload`);
                } catch (error: any) {
                  // Ignore errors (file might be locked)
                  console.warn(`[SHERLO] WATCHER: Failed to touch ${mockFilePath}: ${error.message}`);
                }
              }
              
              if (changedMockFiles.length > 0) {
                console.log(`[SHERLO] WATCHER: ✅ Touched ${changedMockFiles.length} changed mock file(s) to trigger Metro reload`);
              }
            } else {
              console.log(`[SHERLO] WATCHER: ⏭️  Regeneration skipped (no mock content changes detected)`);
            }
          } catch (error: any) {
            console.error(`[SHERLO] WATCHER: ❌ Failed to regenerate mocks: ${error.message}`);
            if (error.stack) {
              console.error(`[SHERLO] WATCHER: Stack: ${error.stack.split('\n').slice(0, 5).join('\n')}`);
            }
          }
        }, DEBOUNCE_MS);
      }
    });
    
    watcher.on('error', (error: Error) => {
      console.error(`[SHERLO] WATCHER: Error watching ${normalizedPath}: ${error.message}`);
      activeWatchers.delete(normalizedPath);
    });
    
    activeWatchers.set(normalizedPath, watcher);
  } catch (error: any) {
    console.error(`[SHERLO] WATCHER: Failed to watch ${normalizedPath}: ${error.message}`);
  }
}

/**
 * Watches all story files
 */
export function watchAllStoryFiles(
  storyFiles: string[],
  projectRoot: string
): void {
  console.log(`[SHERLO] WATCHER: Setting up watchers for ${storyFiles.length} story file(s)`);
  
  for (const storyFile of storyFiles) {
    watchStoryFile(storyFile, projectRoot, storyFiles);
  }
  
  console.log(`[SHERLO] WATCHER: Watching ${activeWatchers.size} story file(s) for changes`);
}

/**
 * Stops watching all story files
 */
export function stopWatchingAllStoryFiles(): void {
  console.log(`[SHERLO] WATCHER: Stopping ${activeWatchers.size} watcher(s)`);
  
  for (const [path, watcher] of activeWatchers.entries()) {
    try {
      watcher.close();
    } catch (error: any) {
      console.warn(`[SHERLO] WATCHER: Error closing watcher for ${path}: ${error.message}`);
    }
  }
  
  activeWatchers.clear();
}

