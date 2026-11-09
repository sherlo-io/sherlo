'use strict';

// The one reader of an app's Xcode project files. The native build reads it here (the package's
// react-native.config.js, run by CocoaPods while it links the app, from the published copy
// dist-metro/xcodeProject.js), and so does the CLI, which bundles it, to pick the configuration an
// iOS build uses. Keep it plain JavaScript with no dependencies, so plain Node can require it.
//
// A project.pbxproj is a list of objects, each `<id> /* comment */ = { isa = <kind>; ... };`. A
// native target names its configuration list by id, and the list names its configurations by id,
// so a target's configurations are found by following those ids.

const fs = require('fs');
const path = require('path');

const APPLICATION_PRODUCT_TYPE = 'com.apple.product-type.application';

// The text between the braces of the object with the given id, or null when there is none.
// Braces inside quoted values are skipped.
function objectBody(pbxproj, id) {
  if (!id) return null;
  const start = new RegExp('^\\s*' + id + '(?: /\\*[^\\n]*?\\*/)? = \\{', 'm').exec(pbxproj);
  if (!start) return null;
  const from = start.index + start[0].length;
  let depth = 1;
  let inString = false;
  let at = from;
  for (; at < pbxproj.length && depth > 0; at++) {
    const character = pbxproj[at];
    if (inString) {
      if (character === '\\') at++;
      else if (character === '"') inString = false;
    } else if (character === '"') inString = true;
    else if (character === '{') depth++;
    else if (character === '}') depth--;
  }
  return pbxproj.slice(from, at - 1);
}

// The object's own fields, with every nested object (such as buildSettings) taken out, so a key
// inside one is never read as the object's own.
function ownFields(body) {
  let fields = '';
  let depth = 0;
  let inString = false;
  for (let at = 0; at < body.length; at++) {
    const character = body[at];
    if (inString) {
      if (character === '\\') {
        if (depth === 0) fields += character + body[at + 1];
        at++;
        continue;
      }
      if (character === '"') inString = false;
    } else if (character === '"') inString = true;
    else if (character === '{') depth++;
    else if (character === '}') {
      depth--;
      continue;
    }
    if (depth === 0) fields += character;
  }
  return fields;
}

// A field's value, unquoted, or undefined when the object has no such field. An id may carry a
// comment after it: `buildConfigurationList = 13B07F931A68108700A75B9A /* ... */;`.
function fieldValue(fields, key) {
  const match = new RegExp(
    '(?:^|[;\\s])' + key + ' = ("(?:[^"\\\\]|\\\\.)*"|[^;\\s]+)(?: /\\*[^\\n]*?\\*/)?;'
  ).exec(fields);
  if (!match) return undefined;
  const value = match[1];
  return value.startsWith('"') ? value.slice(1, -1).replace(/\\(.)/g, '$1') : value;
}

// The ids a list field names, comments left out.
function listedIds(fields, key) {
  const match = new RegExp('(?:^|[;\\s])' + key + ' = \\(([^)]*)\\)').exec(fields);
  if (!match) return [];
  return match[1]
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
}

/**
 * Every native target of a project.pbxproj: its id, its name, its product type, and the names of
 * its own build configurations, spelled as the project spells them.
 */
function readNativeTargets(pbxproj) {
  const targets = [];
  const targetStart = /^\s*(\w+)(?: \/\*[^\n]*?\*\/)? = \{\s*isa = PBXNativeTarget;/gm;
  for (const match of pbxproj.matchAll(targetStart)) {
    const id = match[1];
    const fields = ownFields(objectBody(pbxproj, id) || '');
    const listBody = objectBody(pbxproj, fieldValue(fields, 'buildConfigurationList'));
    const configurations = listedIds(ownFields(listBody || ''), 'buildConfigurations')
      .map((configurationId) =>
        fieldValue(ownFields(objectBody(pbxproj, configurationId) || ''), 'name')
      )
      .filter(Boolean);
    targets.push({
      id,
      name: fieldValue(fields, 'name'),
      productType: fieldValue(fields, 'productType'),
      configurations,
    });
  }
  return targets;
}

/**
 * The Xcode projects in an iOS folder (CocoaPods keeps its own one folder down, in Pods/), each with its native
 * targets: `container` is the .xcodeproj folder's name. A project that cannot be read has none.
 */
function readXcodeProjects(iosFolder) {
  return fs
    .readdirSync(iosFolder)
    .filter((entry) => entry.endsWith('.xcodeproj'))
    .map((container) => {
      try {
        const pbxproj = fs.readFileSync(path.join(iosFolder, container, 'project.pbxproj'), 'utf8');
        return { container, targets: readNativeTargets(pbxproj) };
      } catch (projectUnreadable) {
        // A project without a readable project file declares no targets.
        return { container, targets: [] };
      }
    });
}

module.exports = { APPLICATION_PRODUCT_TYPE, readNativeTargets, readXcodeProjects };
