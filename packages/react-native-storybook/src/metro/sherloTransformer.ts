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
      console.warn(`[SHERLO:transformer] Failed to load base transformer from ${baseTransformerPath}:`, error.message);
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

  // Debug: log transformer type
  // if (args.filename.includes('TestInfo.stories')) {
  //   console.log(`[SHERLO:transformer] Base transformer type:`, typeof baseTransformer);
  //   console.log(`[SHERLO:transformer] Base transformer keys:`, baseTransformer ? Object.keys(baseTransformer) : 'null');
  //   console.log(`[SHERLO:transformer] Has transform method:`, baseTransformer && typeof baseTransformer.transform === 'function');
  //   console.log(`[SHERLO:transformer] Is function:`, typeof baseTransformer === 'function');
  // }

  // Let Metro transform first (TS → JS)
  // Metro transformers export a transform function directly
  let result: TransformResult;
  if (typeof baseTransformer === 'function') {
    result = await baseTransformer(args);
  } else if (baseTransformer && typeof baseTransformer.transform === 'function') {
    result = await baseTransformer.transform(args);
  } else {
    console.error(`[SHERLO:transformer] Base transformer structure:`, JSON.stringify(Object.keys(baseTransformer || {})));
    throw new Error('[SHERLO:transformer] Base transformer does not export a transform function');
  }

  // Debug: log result structure
  // if (args.filename.includes('TestInfo.stories')) {
  //   console.log(`[SHERLO:transformer] Result type:`, typeof result);
  //   console.log(`[SHERLO:transformer] Result keys:`, result ? Object.keys(result) : 'null');
  //   console.log(`[SHERLO:transformer] Result.output type:`, result?.output ? typeof result.output : 'undefined');
  //   console.log(`[SHERLO:transformer] Result.output length:`, Array.isArray(result?.output) ? result.output.length : 'not array');
  // }

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

  // Debug logging
  // if (args.filename.includes('TestInfo.stories')) {
  //   console.log(`[SHERLO:transformer] Checking file: ${args.filename}`);
  //   console.log(`[SHERLO:transformer] Normalized path: ${normalizedPath}`);
  //   console.log(`[SHERLO:transformer] Story files count: ${storyFiles.length}`);
  //   console.log(`[SHERLO:transformer] Is story file: ${isStoryFile}`);
  //   if (storyFiles.length > 0) {
  //     const testInfoStory = storyFiles.find((f: string) => f.includes('TestInfo.stories'));
  //     console.log(`[SHERLO:transformer] TestInfo story file path: ${testInfoStory}`);
  //     console.log(`[SHERLO:transformer] Resolved testInfo path: ${testInfoStory ? path.resolve(testInfoStory) : 'not found'}`);
  //   }
  // }

  if (isStoryFile) {
    // console.log(`[SHERLO:transformer] Processing story file: ${path.relative(projectRoot, args.filename)}`);

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
          // if (transformedCode) {
          //   console.log(`[SHERLO:transformer] Converted AST to code for ${path.basename(args.filename)}, code length: ${transformedCode.length}`);
          // }
        }
      } catch (error: any) {
        console.warn(`[SHERLO:transformer] Failed to generate code from AST:`, error.message);
      }
    }

    if (!transformedCode) {
      // console.warn(`[SHERLO:transformer] Could not extract code from transformer result for ${args.filename}`);
      // console.warn(`[SHERLO:transformer] Result structure:`, Object.keys(result || {}));
      return result;
    }

    const code = transformedCode; // TypeScript guard
    // console.log(`[SHERLO:transformer] Extracting mocks from ${path.basename(args.filename)}, code length: ${code.length}`);

    // Import the extraction function dynamically to avoid circular dependencies
    const { extractMocksFromTransformedCode } = require('./mockExtractionTransformer');
    const extractedMocks = extractMocksFromTransformedCode(
      code,
      args.filename,
      projectRoot
    );

    // console.log(`[SHERLO:transformer] Extracted ${extractedMocks.size} story mock(s) from ${path.basename(args.filename)}`);

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
      console.warn(`[SHERLO:transformer] Failed to generate mock files:`, error.message);
    }
  }

  return result;
}
