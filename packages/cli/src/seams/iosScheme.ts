import fs from 'fs';
import path from 'path';

/**
 * The schemes an `xcodebuild -list -json` answer lists, for a workspace or a project. xcodebuild
 * may print warnings before the JSON, and a destination warning's line opens with a brace of its
 * own (`{ platform:macOS, ... }`), so the JSON starts at a brace that ends its line or opens a key.
 */
export function schemesInXcodeList(output: string): string[] {
  const jsonStart = output.search(/^\{\s*("|$)/m);
  if (jsonStart === -1) return [];
  const list: { workspace?: { schemes?: string[] }; project?: { schemes?: string[] } } = JSON.parse(
    output.slice(jsonStart, output.lastIndexOf('}') + 1)
  );
  return (list.workspace ?? list.project)?.schemes ?? [];
}

/** The scheme names an Xcode project holds as files, shared and per user, without running xcodebuild. */
export function schemeNamesInProject(projectFolder: string): string[] {
  const schemeFolders = [path.join(projectFolder, 'xcshareddata/xcschemes')];
  const userdata = path.join(projectFolder, 'xcuserdata');
  if (fs.existsSync(userdata)) {
    for (const user of fs.readdirSync(userdata)) {
      schemeFolders.push(path.join(userdata, user, 'xcschemes'));
    }
  }
  return schemeFolders
    .filter((folder) => fs.existsSync(folder))
    .flatMap((folder) => fs.readdirSync(folder))
    .filter((name) => name.endsWith('.xcscheme'))
    .map((name) => name.slice(0, -'.xcscheme'.length));
}

/**
 * The scheme an iOS build uses: the config's, else the workspace's only shared scheme, else the only
 * scheme that builds an application (a test bundle's or an extension's scheme is skipped, and said
 * so). Null when none of these picks one: two app schemes, or none, are the caller's refusal.
 */
export function pickIosScheme(params: {
  /** The scheme sherlo.config.json names. */
  named: string | undefined;
  /** The workspace's shared schemes. */
  schemes: string[];
  /** Those of them that build an application target. */
  appSchemes: string[];
}): { scheme: string; skippedSchemes: string[] } | null {
  const { named, schemes, appSchemes } = params;
  if (named) return { scheme: named, skippedSchemes: [] };
  if (schemes.length === 1) return { scheme: schemes[0], skippedSchemes: [] };
  if (appSchemes.length !== 1) return null;
  const [scheme] = appSchemes;
  return { scheme, skippedSchemes: schemes.filter((name) => name !== scheme) };
}
