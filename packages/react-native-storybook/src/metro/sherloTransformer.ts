/**
 * Custom Metro transformer that wraps the default transformer and extracts mocks from story files.
 * This file is loaded by Metro via babelTransformerPath.
 */

import * as path from 'path';
import type { TransformArgs, TransformResult } from './mockExtractionTransformer';

/**
 * Gets the base transformer (Expo's or Metro's default)
 */
function getBaseTransformer() {
  // Try to get from global first (set by withSherlo)
  const baseTransformerPath = (global as any).__SHERLO_BASE_TRANSFORMER_PATH__;

  if (baseTransformerPath) {
    try {
      // Clear require cache to ensure fresh load
      delete require.cache[require.resolve(baseTransformerPath)];
      return require(baseTransformerPath);
    } catch (error: any) {
      // Silently fallback to default transformer
    }
  }

  // Fallback: try Expo's transformer
  try {
    return require('@expo/metro-config/babel-transformer');
  } catch {
    // Fallback: try Metro's default transformer
    try {
      return require('metro-react-native-babel-transformer');
    } catch (error: any) {
      throw new Error(
        `Could not find Metro transformer. Please ensure @expo/metro-config or metro-react-native-babel-transformer is installed. Error: ${error.message}`
      );
    }
  }
}

/**
 * Metro transformer entry point
 * Metro calls this function with transform arguments
 */
export async function transform(args: TransformArgs): Promise<TransformResult> {
  // Get the base transformer
  const baseTransformer = getBaseTransformer();

  // Let Metro transform first (TS → JS)
  // Metro transformers export a transform function directly
  let result: TransformResult;
  if (typeof baseTransformer === 'function') {
    result = await baseTransformer(args);
  } else if (baseTransformer && typeof baseTransformer.transform === 'function') {
    result = await baseTransformer.transform(args);
  } else {
    console.error('[SHERLO] Metro transformer error: Base transformer does not export a transform function');
    throw new Error('[SHERLO] Base transformer does not export a transform function');
  }

  // Get story files from JSON file (set by withSherlo)
  // Metro workers run in separate processes, so we can't use globals/config
  // Read from a file that withSherlo wrote
  let storyFiles: string[] = [];
  let projectRoot = process.cwd();

  try {
    const fs = require('fs');
    const storyFilesPath = path.join(process.cwd(), '.sherlo', 'story-files.json');
    if (fs.existsSync(storyFilesPath)) {
      const data = JSON.parse(fs.readFileSync(storyFilesPath, 'utf-8'));
      storyFiles = data.storyFiles || [];
      projectRoot = data.projectRoot || process.cwd();
    }
  } catch (error: any) {
    // Fallback to globals if file read fails
    storyFiles = (global as any).__SHERLO_STORY_FILES__ || [];
    projectRoot = (global as any).__SHERLO_PROJECT_ROOT__ || process.cwd();
  }

  // Check if this is a story file
  const normalizedPath = path.resolve(args.filename);
  const isStoryFile = storyFiles.some((storyFile: string) => path.resolve(storyFile) === normalizedPath);

  if (isStoryFile) {

    // Metro transformers can return either:
    // 1. AST format: { ast, metadata }
    // 2. Code format: { output: [{ data: { code: '...' } }] }
    // We need to extract code from either format
    let transformedCode: string | null = null;

    if (result.output && Array.isArray(result.output) && result.output.length > 0) {
      // Code format
      transformedCode = result.output[0]?.data?.code || null;
    } else if ((result as any).ast) {
      // AST format - convert to code using @babel/generator
      try {
        const generate = require('@babel/generator').default;
        if (generate) {
          const generated = generate((result as any).ast, {}, args.src);
          transformedCode = generated.code;
        }
      } catch (error: any) {
        console.error('[SHERLO] Failed to generate code from AST:', error.message);
      }
    }

    if (!transformedCode) {
      return result;
    }

    const code = transformedCode; // TypeScript guard

    // Import the extraction function dynamically to avoid circular dependencies
    const { extractMocksFromTransformedCode } = require('./mockExtractionTransformer');
    const extractedMocks = extractMocksFromTransformedCode(
      code,
      args.filename,
      projectRoot
    );

    // Merge into global cache
    if (!(global as any).__SHERLO_STORY_MOCKS__) {
      (global as any).__SHERLO_STORY_MOCKS__ = new Map();
    }

    const globalMocks = (global as any).__SHERLO_STORY_MOCKS__;
    for (const [storyId, packageMocks] of extractedMocks.entries()) {
      globalMocks.set(storyId, packageMocks);
    }

    // After extracting mocks, generate mock files
    // This is scrappy - we regenerate on every story file transform
    // In production, we'd do this once after all stories are processed
    try {
      const { generateAllMockFiles } = require('./generateMockFile');
      generateAllMockFiles(globalMocks, projectRoot);
    } catch (error: any) {
      console.error('[SHERLO] Failed to generate mock files:', error.message);
    }
  }

  return result;
}
