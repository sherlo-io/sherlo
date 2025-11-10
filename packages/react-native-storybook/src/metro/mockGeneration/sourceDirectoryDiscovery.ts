/**
 * Shared source directory discovery logic
 * Dynamically discovers source directories from story files without hardcoding paths
 */

import * as path from 'path';
import * as fs from 'fs';

/**
 * Discovers source directories by analyzing story file locations
 * This dynamically finds where source files are located without hardcoding paths
 *
 * @param projectRoot - The project root directory
 * @returns Array of discovered source directories
 */
export function discoverSourceDirectories(projectRoot: string): string[] {
  const sourceDirs = new Set<string>();
  
  // Try to read story files list (set by withSherlo)
  try {
    const storyFilesPath = path.join(projectRoot, '.sherlo', 'story-files.json');
    if (fs.existsSync(storyFilesPath)) {
      const data = JSON.parse(fs.readFileSync(storyFilesPath, 'utf-8'));
      const storyFiles: string[] = data.storyFiles || [];
      
      // Extract unique source directories from story file paths
      for (const storyFile of storyFiles) {
        const storyDir = path.dirname(storyFile);
        const storyFileAbs = path.resolve(storyFile);
        const projectRootAbs = path.resolve(projectRoot);
        
        // Walk up from story file directory looking for source directories
        let currentDir = storyDir;
        let depth = 0;
        const maxDepth = 10; // Allow deeper traversal for monorepos
        
        while (depth < maxDepth) {
          const dirName = path.basename(currentDir);
          const currentDirAbs = path.resolve(currentDir);
          
          // Stop if we've gone too far up
          if (currentDirAbs === path.dirname(currentDirAbs)) {
            break; // Reached filesystem root
          }
          
          // Common source directory names
          if (['src', 'lib', 'app', 'components'].includes(dirName)) {
            sourceDirs.add(currentDirAbs);
            // Also add parent directory (might contain utils, helpers, etc.)
            const parentDir = path.dirname(currentDirAbs);
            if (fs.existsSync(parentDir)) {
              sourceDirs.add(parentDir);
              // Check for common subdirectories
              const utilsDir = path.join(parentDir, 'utils');
              const helpersDir = path.join(parentDir, 'helpers');
              if (fs.existsSync(utilsDir)) sourceDirs.add(utilsDir);
              if (fs.existsSync(helpersDir)) sourceDirs.add(helpersDir);
            }
          }
          
          currentDir = path.dirname(currentDir);
          depth++;
        }
        
        // Also check if story file is in a sibling directory (monorepo setup)
        // If story file is outside projectRoot, we need to discover its source structure
        if (!storyFileAbs.startsWith(projectRootAbs + path.sep)) {
          // Story file is outside projectRoot, likely in a sibling directory
          // Walk up from story file to find all src/lib/app directories
          let storyParent = path.dirname(storyFileAbs);
          let depth = 0;
          const maxSiblingDepth = 5;
          
          while (depth < maxSiblingDepth) {
            const dirName = path.basename(storyParent);
            const storyParentAbs = path.resolve(storyParent);
            
            if (storyParentAbs === path.dirname(storyParentAbs)) {
              break; // Reached filesystem root
            }
            
            // If we find a source directory, add it and its parent
            if (['src', 'lib', 'app'].includes(dirName)) {
              sourceDirs.add(storyParentAbs);
              // Also add parent directory (might be the package root)
              const parent = path.dirname(storyParentAbs);
              if (fs.existsSync(parent)) {
                sourceDirs.add(parent);
                // Check for utils, helpers subdirectories in parent
                const utilsDir = path.join(parent, 'utils');
                const helpersDir = path.join(parent, 'helpers');
                if (fs.existsSync(utilsDir)) sourceDirs.add(utilsDir);
                if (fs.existsSync(helpersDir)) sourceDirs.add(helpersDir);
              }
            }
            
            storyParent = path.dirname(storyParent);
            depth++;
          }
        }
        
        // Check for sibling directories: If story file is in a subdirectory like "src/package-name/...",
        // check for sibling directories with the same package name
        // Example: storyFile is "project/src/testing-components/..." 
        //          -> check "project/../testing-components/src" and "project/../testing-components"
        const relativePath = path.relative(projectRootAbs, storyFileAbs);
        const pathParts = relativePath.split(path.sep);
        
        // Look for patterns like "src/package-name/..." or "src/components/package-name/..."
        for (let i = 0; i < pathParts.length - 1; i++) {
          if (['src', 'lib', 'app'].includes(pathParts[i])) {
            // Found a source directory, check if next part might be a package name
            if (i + 1 < pathParts.length) {
              const possiblePackageName = pathParts[i + 1];
              // Check for sibling directories with this name
              const checkDir = path.dirname(projectRootAbs);
              const possibleSiblingDirs = [
                path.join(checkDir, possiblePackageName, 'src'),
                path.join(checkDir, possiblePackageName),
                path.join(path.dirname(checkDir), possiblePackageName, 'src'),
                path.join(path.dirname(checkDir), possiblePackageName),
              ];
              
              for (const siblingDir of possibleSiblingDirs) {
                if (fs.existsSync(siblingDir)) {
                  sourceDirs.add(siblingDir);
                  const parent = path.dirname(siblingDir);
                  if (fs.existsSync(parent)) {
                    sourceDirs.add(parent);
                    const utilsDir = path.join(parent, 'utils');
                    const helpersDir = path.join(parent, 'helpers');
                    if (fs.existsSync(utilsDir)) sourceDirs.add(utilsDir);
                    if (fs.existsSync(helpersDir)) sourceDirs.add(helpersDir);
                  }
                }
              }
            }
            break; // Only check first source directory match
          }
        }
      }
    }
  } catch {
    // If we can't read story files, fall back to standard locations
  }
  
  return Array.from(sourceDirs);
}

