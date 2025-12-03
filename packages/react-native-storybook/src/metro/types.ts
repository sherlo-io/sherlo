/**
 * Metro transformer and mock system types
 */

/**
 * Story mock map: storyId -> packageName -> mockObject
 * Maps story IDs to their package mocks, where each package mock contains export names and their mock values
 *
 * @example
 * ```typescript
 * {
 *   "components-button--primary": Map {
 *     "some-package" => { getValue: () => "mocked", processData: () => {...} }
 *   }
 * }
 * ```
 */
export type StoryMockMap = Map<string, Map<string, any>>;

/**
 * Metro transformer transform arguments
 * Passed to the transformer function by Metro
 */
export interface TransformArgs {
  /** The file path being transformed */
  filename: string;
  /** Metro transform options */
  options: any;
  /** The source code to transform */
  src: string;
}

/**
 * Metro transformer transform result
 * Returned by the transformer function
 */
export interface TransformResult {
  output: Array<{
    type: string;
    data: {
      code: string;
      map?: any;
    };
  }>;
}

/**
 * Options for configuring withSherlo
 */
export interface WithSherloOptions {
  /**
   * Enable debug logging for resolver and transformer
   * @default false
   */
  debug?: boolean;
  /**
   * Enable the mock system
   * Set to false to disable mock extraction and processing
   * @default true
   */
  enabled?: boolean;
}
