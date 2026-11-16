/**
 * Fixture projects for the launch-time entry's tests (launchTimeEntry.test.ts,
 * launchTimeEntryAlias.test.ts): projects laid out on disk, Sherlo's withStorybook on their config,
 * and a stand-in for Metro's own resolver to ask the wrapped resolveRequest through.
 */
import * as fs from 'fs';
import * as path from 'path';

import { createFixtureRoot, fixtureFileWriter } from './bundle/fixtureMetroConfig';
import { enterBundlingProcess } from './bundlingProcess';

export type Resolution = { type: string; filePath?: string };
export type ResolveRequest = (
  context: { originModulePath: string; resolveRequest: unknown },
  moduleName: string,
  platform: string | null
) => Resolution;

const withStorybook: (
  config: object,
  opts: object
) => { resolver: { resolveRequest: ResolveRequest } } = require('../../metro/withStorybook');

/** The projects made since they were last removed (removeCreatedProjects). */
export const createdProjectRoots: string[] = [];

/** A project on disk with `files` in it, by their path in the project. */
export function createProject(files: Record<string, string>): string {
  const root = createFixtureRoot('sherlo-launch-entry-');
  createdProjectRoots.push(root);
  const write = fixtureFileWriter(root);
  for (const [relativePath, content] of Object.entries(files)) write(relativePath, content);
  return root;
}

/** Removes every project made since the last call, for an afterEach. */
export function removeCreatedProjects(): void {
  for (const root of createdProjectRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

/**
 * Sherlo's withStorybook on `root`'s config, with `env` set and `commandLine` after the CLI's
 * script (a debug bundle when it says nothing), `resolver` as the config's own, and `options` as
 * the options the app gives withStorybook.
 */
export function wrapConfig(
  root: string,
  env: Record<string, string> = {},
  {
    resolver = {},
    commandLine = [],
    options = {},
  }: { resolver?: object; commandLine?: string[]; options?: object } = {}
) {
  const leaveBundlingProcess = enterBundlingProcess(env, commandLine);
  try {
    return withStorybook({ projectRoot: root, resolver, serializer: {}, server: {} }, options);
  } finally {
    leaveBundlingProcess();
  }
}

/**
 * Metro's own resolver, as much of it as a relative request in the fixtures needs. Like Metro, it
 * answers with the file a symlink points to, and its error names the importer.
 */
export function resolveRelativeFile(
  context: { originModulePath: string },
  moduleName: string
): Resolution {
  const basePath = path.resolve(path.dirname(context.originModulePath), moduleName);
  const candidates = ['', '.js', '.ts', '/index.js'].map((ending) => basePath + ending);
  const filePath = candidates.find(
    (candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile()
  );
  if (!filePath) {
    throw new Error(`Unable to resolve "${moduleName}" from "${context.originModulePath}"`);
  }
  return { type: 'sourceFile', filePath: fs.realpathSync(filePath) };
}

/** Asks `resolveRequest` for `moduleName` from `importer`, as Metro does. */
export function resolveFrom(
  resolveRequest: ResolveRequest,
  importer: string,
  moduleName: string,
  platform: string | null = 'ios'
): Resolution {
  return resolveRequest(
    { originModulePath: importer, resolveRequest: resolveRelativeFile },
    moduleName,
    platform
  );
}
