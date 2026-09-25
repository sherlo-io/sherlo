// GENERATED from the seam types in packages/cli/src/seams by `yarn generate:pose-contract` - do not edit.
/**
 * THE SHAPE HALF OF THE POSE READER - required fields, unknown keys, wrong types, every problem
 * named in one message.
 *
 * ./readPose calls this first and then adds the checks a type cannot state: which commands bundle,
 * which act on the machine, which platform names a map may use, and what counts as an instant. The
 * wording of every refusal is by hand in ./poseProblems; only the walk below is written by a
 * program - `packages/cli/scripts/generate-pose-contract.ts`, from `src/seams/commandPose.ts`.
 *
 * Nothing here throws: a check appends its sentence and the walk carries on, so a hand-written
 * pose with four mistakes in it is refused once, naming all four.
 */
import {
  asArray,
  asObject,
  at,
  atIndex,
  atKey,
  expectBoolean,
  expectLiteral,
  expectNumber,
  expectOneOf,
  expectString,
  expectStringArray,
  isPlainObject,
  reportUnknownFields,
  reportUnknownName,
  reportWrongShape,
} from './poseProblems';

/** Read the shape of a whole pose, appending one sentence per problem found. */
export function readPoseShape(document: unknown, problems: string[]): void {
  readCommandPose(document, '', problems);
}

/** The shape of a `CommandPose`, as `contracts/pose.contract.ts` publishes it. */
function readCommandPose(value: unknown, path: string, problems: string[]): void {
  const object1 = asObject(value, path, problems);
  if (object1) {
    expectLiteral(object1.pose, 1, at(path, 'pose'), problems);
    expectStringArray(object1.argv, at(path, 'argv'), problems);
    readPosedFiles(object1.files, at(path, 'files'), problems);
    const where2 = at(path, 'env');
    const map3 = asObject(object1.env, where2, problems);
    if (map3) {
      for (const key4 of Object.keys(map3)) {
        expectString(map3[key4], atKey(where2, key4), problems);
      }
    }
    readPosedGit(object1.git, at(path, 'git'), problems);
    const where5 = at(path, 'bundles');
    const map6 = asObject(object1.bundles, where5, problems);
    if (map6) {
      for (const key7 of Object.keys(map6)) {
        readPosedBundle(map6[key7], atKey(where5, key7), problems);
      }
    }
    const where8 = at(path, 'api');
    const list9 = asArray(object1.api, where8, problems);
    if (list9) {
      list9.forEach((entry10, index11) => {
        readScriptedCall(entry10, atIndex(where8, index11), problems);
      });
    }
    const where12 = at(path, 'masks');
    const map13 = asObject(object1.masks, where12, problems);
    if (map13) {
      for (const key14 of Object.keys(map13)) {
        expectString(map13[key14], atKey(where12, key14), problems);
      }
    }
    if ('push' in object1) {
      readPosedPush(object1.push, at(path, 'push'), problems);
    }
    if ('clock' in object1) {
      expectStringArray(object1.clock, at(path, 'clock'), problems);
    }
    if ('workstation' in object1) {
      readPosedWorkstation(object1.workstation, at(path, 'workstation'), problems);
    }
    if ('letterbox' in object1) {
      readPosedLetterbox(object1.letterbox, at(path, 'letterbox'), problems);
    }
    if ('capture' in object1) {
      readPosedCapture(object1.capture, at(path, 'capture'), problems);
    }
    reportUnknownFields(
      object1,
      [
        'pose',
        'argv',
        'files',
        'env',
        'git',
        'bundles',
        'api',
        'masks',
        'push',
        'clock',
        'workstation',
        'letterbox',
        'capture',
      ],
      path,
      problems
    );
  }
}

/** The shape of a `PosedFiles`, as `contracts/pose.contract.ts` publishes it. */
function readPosedFiles(value: unknown, path: string, problems: string[]): void {
  const map1 = asObject(value, path, problems);
  if (map1) {
    for (const key2 of Object.keys(map1)) {
      const oneOf3 = map1[key2];
      const where4 = atKey(path, key2);
      if (typeof oneOf3 === 'string') {
        // the value is one of these
      } else if (isPlainObject(oneOf3)) {
        asObject(oneOf3, where4, problems);
      } else {
        reportWrongShape(oneOf3, 'a string or an object', where4, problems);
      }
    }
  }
}

/** The shape of a `PosedGit`, as `contracts/pose.contract.ts` publishes it. */
function readPosedGit(value: unknown, path: string, problems: string[]): void {
  const oneOf1 = value;
  if (oneOf1 === 'none' || oneOf1 === 'unavailable') {
    // the value is one of these
  } else if (isPlainObject(oneOf1)) {
    const object2 = asObject(oneOf1, path, problems);
    if (object2) {
      expectString(object2.branch, at(path, 'branch'), problems);
      expectString(object2.commit, at(path, 'commit'), problems);
      expectBoolean(object2.dirty, at(path, 'dirty'), problems);
      reportUnknownFields(object2, ['branch', 'commit', 'dirty'], path, problems);
    }
  } else {
    reportWrongShape(
      oneOf1,
      '`"none"`, `"unavailable"` or `{ branch: string; commit: string; dirty: boolean }`',
      path,
      problems
    );
  }
}

/** The shape of a `PosedBundle`, as `contracts/pose.contract.ts` publishes it. */
function readPosedBundle(value: unknown, path: string, problems: string[]): void {
  const object1 = asObject(value, path, problems);
  if (object1) {
    expectString(object1.bundlePath, at(path, 'bundlePath'), problems);
    expectNumber(object1.bundleSizeMb, at(path, 'bundleSizeMb'), problems);
    expectOneOf(
      object1.bundleFormat,
      ['plain-js', 'hermes-bytecode'],
      at(path, 'bundleFormat'),
      problems
    );
    expectOneOf(object1.bundler, ['expo', 'metro'], at(path, 'bundler'), problems);
    expectStringArray(object1.assets, at(path, 'assets'), problems);
    const oneOf2 = object1.storyClosureKeys;
    const where3 = at(path, 'storyClosureKeys');
    if (oneOf2 === null) {
      // the value is one of these
    } else if (Array.isArray(oneOf2)) {
      expectStringArray(oneOf2, where3, problems);
    } else {
      reportWrongShape(oneOf2, 'an array of strings or `null`', where3, problems);
    }
    reportUnknownFields(
      object1,
      ['bundlePath', 'bundleSizeMb', 'bundleFormat', 'bundler', 'assets', 'storyClosureKeys'],
      path,
      problems
    );
  }
}

/** The shape of a `ScriptedCall`, as `contracts/pose.contract.ts` publishes it. */
function readScriptedCall(value: unknown, path: string, problems: string[]): void {
  const oneOf1 = value;
  if (isPlainObject(oneOf1)) {
    if (oneOf1.call === 'getBuildStatus') {
      const object2 = asObject(oneOf1, path, problems);
      if (object2) {
        expectLiteral(object2.call, 'getBuildStatus', at(path, 'call'), problems);
        const where3 = at(path, 'with');
        const object4 = asObject(object2.with, where3, problems);
        if (object4) {
          expectNumber(object4.buildIndex, at(where3, 'buildIndex'), problems);
          reportUnknownFields(object4, ['buildIndex'], where3, problems);
        }
        const oneOf5 = object2.answer;
        const where6 = at(path, 'answer');
        if (oneOf5 === null) {
          // the value is one of these
        } else if (isPlainObject(oneOf5)) {
          if ('error' in oneOf5) {
            readApiError(oneOf5, where6, problems);
          } else if ('runStatus' in oneOf5) {
            readBuildStatusAnswer(oneOf5, where6, problems);
          } else {
            reportWrongShape(oneOf5, '`ApiError` or `BuildStatusAnswer`', where6, problems);
          }
        } else {
          reportWrongShape(oneOf5, '`ApiError`, `BuildStatusAnswer` or `null`', where6, problems);
        }
        reportUnknownFields(object2, ['call', 'with', 'answer'], path, problems);
      }
    } else if (oneOf1.call === 'createProject') {
      const object7 = asObject(oneOf1, path, problems);
      if (object7) {
        expectLiteral(object7.call, 'createProject', at(path, 'call'), problems);
        const where8 = at(path, 'with');
        const object9 = asObject(object7.with, where8, problems);
        if (object9) {
          expectString(object9.teamId, at(where8, 'teamId'), problems);
          expectString(object9.name, at(where8, 'name'), problems);
          reportUnknownFields(object9, ['teamId', 'name'], where8, problems);
        }
        const oneOf10 = object7.answer;
        const where11 = at(path, 'answer');
        if (isPlainObject(oneOf10)) {
          if ('error' in oneOf10) {
            readApiError(oneOf10, where11, problems);
          } else if ('name' in oneOf10) {
            const object12 = asObject(oneOf10, where11, problems);
            if (object12) {
              expectString(object12.name, at(where11, 'name'), problems);
              expectNumber(object12.index, at(where11, 'index'), problems);
              expectString(object12.projectToken, at(where11, 'projectToken'), problems);
              reportUnknownFields(object12, ['name', 'index', 'projectToken'], where11, problems);
            }
          } else {
            reportWrongShape(
              oneOf10,
              '`ApiError` or `{ name: string; index: number; projectToken: string }`',
              where11,
              problems
            );
          }
        } else {
          reportWrongShape(
            oneOf10,
            '`ApiError` or `{ name: string; index: number; projectToken: string }`',
            where11,
            problems
          );
        }
        reportUnknownFields(object7, ['call', 'with', 'answer'], path, problems);
      }
    } else if (oneOf1.call === 'createTeam') {
      const object13 = asObject(oneOf1, path, problems);
      if (object13) {
        expectLiteral(object13.call, 'createTeam', at(path, 'call'), problems);
        const where14 = at(path, 'with');
        const object15 = asObject(object13.with, where14, problems);
        if (object15) {
          expectString(object15.name, at(where14, 'name'), problems);
          reportUnknownFields(object15, ['name'], where14, problems);
        }
        const oneOf16 = object13.answer;
        const where17 = at(path, 'answer');
        if (isPlainObject(oneOf16)) {
          if ('error' in oneOf16) {
            readApiError(oneOf16, where17, problems);
          } else if ('id' in oneOf16) {
            const object18 = asObject(oneOf16, where17, problems);
            if (object18) {
              expectString(object18.id, at(where17, 'id'), problems);
              expectString(object18.name, at(where17, 'name'), problems);
              reportUnknownFields(object18, ['id', 'name'], where17, problems);
            }
          } else {
            reportWrongShape(
              oneOf16,
              '`ApiError` or `{ id: string; name: string }`',
              where17,
              problems
            );
          }
        } else {
          reportWrongShape(
            oneOf16,
            '`ApiError` or `{ id: string; name: string }`',
            where17,
            problems
          );
        }
        reportUnknownFields(object13, ['call', 'with', 'answer'], path, problems);
      }
    } else if (oneOf1.call === 'listTeams') {
      const object19 = asObject(oneOf1, path, problems);
      if (object19) {
        expectLiteral(object19.call, 'listTeams', at(path, 'call'), problems);
        const where20 = at(path, 'with');
        const map21 = asObject(object19.with, where20, problems);
        if (map21) {
          reportUnknownFields(map21, [], where20, problems);
        }
        const oneOf22 = object19.answer;
        const where23 = at(path, 'answer');
        if (isPlainObject(oneOf22)) {
          if ('error' in oneOf22) {
            readApiError(oneOf22, where23, problems);
          } else if ('teams' in oneOf22) {
            const object24 = asObject(oneOf22, where23, problems);
            if (object24) {
              const where25 = at(where23, 'teams');
              const list26 = asArray(object24.teams, where25, problems);
              if (list26) {
                list26.forEach((entry27, index28) => {
                  const where29 = atIndex(where25, index28);
                  const object30 = asObject(entry27, where29, problems);
                  if (object30) {
                    expectString(object30.id, at(where29, 'id'), problems);
                    expectString(object30.name, at(where29, 'name'), problems);
                    expectNumber(object30.projectCount, at(where29, 'projectCount'), problems);
                    const oneOf31 = object30.role;
                    const where32 = at(where29, 'role');
                    if (typeof oneOf31 === 'string' || oneOf31 === null) {
                      // the value is one of these
                    } else {
                      reportWrongShape(oneOf31, 'a string or `null`', where32, problems);
                    }
                    reportUnknownFields(
                      object30,
                      ['id', 'name', 'projectCount', 'role'],
                      where29,
                      problems
                    );
                  }
                });
              }
              reportUnknownFields(object24, ['teams'], where23, problems);
            }
          } else {
            reportWrongShape(
              oneOf22,
              '`ApiError` or `{ teams: Array<{ id: string; name: string; projectCount: number; role: string | null }> }`',
              where23,
              problems
            );
          }
        } else {
          reportWrongShape(
            oneOf22,
            '`ApiError` or `{ teams: Array<{ id: string; name: string; projectCount: number; role: string | null }> }`',
            where23,
            problems
          );
        }
        reportUnknownFields(object19, ['call', 'with', 'answer'], path, problems);
      }
    } else if (oneOf1.call === 'listProjects') {
      const object33 = asObject(oneOf1, path, problems);
      if (object33) {
        expectLiteral(object33.call, 'listProjects', at(path, 'call'), problems);
        const where34 = at(path, 'with');
        const object35 = asObject(object33.with, where34, problems);
        if (object35) {
          expectString(object35.teamId, at(where34, 'teamId'), problems);
          reportUnknownFields(object35, ['teamId'], where34, problems);
        }
        const oneOf36 = object33.answer;
        const where37 = at(path, 'answer');
        if (isPlainObject(oneOf36)) {
          if ('error' in oneOf36) {
            readApiError(oneOf36, where37, problems);
          } else if ('team' in oneOf36) {
            const object38 = asObject(oneOf36, where37, problems);
            if (object38) {
              const where39 = at(where37, 'team');
              const object40 = asObject(object38.team, where39, problems);
              if (object40) {
                expectString(object40.name, at(where39, 'name'), problems);
                expectString(object40.id, at(where39, 'id'), problems);
                reportUnknownFields(object40, ['name', 'id'], where39, problems);
              }
              const where41 = at(where37, 'projects');
              const list42 = asArray(object38.projects, where41, problems);
              if (list42) {
                list42.forEach((entry43, index44) => {
                  const where45 = atIndex(where41, index44);
                  const object46 = asObject(entry43, where45, problems);
                  if (object46) {
                    expectNumber(object46.index, at(where45, 'index'), problems);
                    expectString(object46.name, at(where45, 'name'), problems);
                    expectNumber(object46.buildCount, at(where45, 'buildCount'), problems);
                    const oneOf47 = object46.mainBranch;
                    const where48 = at(where45, 'mainBranch');
                    if (typeof oneOf47 === 'string' || oneOf47 === null) {
                      // the value is one of these
                    } else {
                      reportWrongShape(oneOf47, 'a string or `null`', where48, problems);
                    }
                    reportUnknownFields(
                      object46,
                      ['index', 'name', 'buildCount', 'mainBranch'],
                      where45,
                      problems
                    );
                  }
                });
              }
              reportUnknownFields(object38, ['team', 'projects'], where37, problems);
            }
          } else {
            reportWrongShape(
              oneOf36,
              '`ApiError` or `{ team: { name: string; id: string }; projects: Array<{ index: number; name: string; buildCount: number; mainBranch: string | null }> }`',
              where37,
              problems
            );
          }
        } else {
          reportWrongShape(
            oneOf36,
            '`ApiError` or `{ team: { name: string; id: string }; projects: Array<{ index: number; name: string; buildCount: number; mainBranch: string | null }> }`',
            where37,
            problems
          );
        }
        reportUnknownFields(object33, ['call', 'with', 'answer'], path, problems);
      }
    } else if (oneOf1.call === 'openBuild') {
      const object49 = asObject(oneOf1, path, problems);
      if (object49) {
        expectLiteral(object49.call, 'openBuild', at(path, 'call'), problems);
        const where50 = at(path, 'with');
        const object51 = asObject(object49.with, where50, problems);
        if (object51) {
          expectStringArray(object51.platforms, at(where50, 'platforms'), problems);
          reportUnknownFields(object51, ['platforms'], where50, problems);
        }
        const oneOf52 = object49.answer;
        const where53 = at(path, 'answer');
        if (isPlainObject(oneOf52)) {
          if ('error' in oneOf52) {
            readApiError(oneOf52, where53, problems);
          } else if ('buildIndex' in oneOf52) {
            const object54 = asObject(oneOf52, where53, problems);
            if (object54) {
              expectNumber(object54.buildIndex, at(where53, 'buildIndex'), problems);
              expectString(object54.url, at(where53, 'url'), problems);
              if ('captureDecision' in object54) {
                readPosedCaptureDecision(
                  object54.captureDecision,
                  at(where53, 'captureDecision'),
                  problems
                );
              }
              reportUnknownFields(
                object54,
                ['buildIndex', 'url', 'captureDecision'],
                where53,
                problems
              );
            }
          } else {
            reportWrongShape(
              oneOf52,
              '`ApiError` or `{ buildIndex: number; url: string; captureDecision?: PosedCaptureDecision }`',
              where53,
              problems
            );
          }
        } else {
          reportWrongShape(
            oneOf52,
            '`ApiError` or `{ buildIndex: number; url: string; captureDecision?: PosedCaptureDecision }`',
            where53,
            problems
          );
        }
        reportUnknownFields(object49, ['call', 'with', 'answer'], path, problems);
      }
    } else if (oneOf1.call === 'computeDiffScopeDryRun') {
      const object55 = asObject(oneOf1, path, problems);
      if (object55) {
        expectLiteral(object55.call, 'computeDiffScopeDryRun', at(path, 'call'), problems);
        const where56 = at(path, 'with');
        const object57 = asObject(object55.with, where56, problems);
        if (object57) {
          expectString(object57.branch, at(where56, 'branch'), problems);
          expectString(object57.commit, at(where56, 'commit'), problems);
          reportUnknownFields(object57, ['branch', 'commit'], where56, problems);
        }
        const oneOf58 = object55.answer;
        const where59 = at(path, 'answer');
        if (isPlainObject(oneOf58)) {
          if ('error' in oneOf58) {
            readApiError(oneOf58, where59, problems);
          } else if ('platforms' in oneOf58) {
            readDiffScopeDryRunAnswer(oneOf58, where59, problems);
          } else {
            reportWrongShape(oneOf58, '`ApiError` or `DiffScopeDryRunAnswer`', where59, problems);
          }
        } else {
          reportWrongShape(oneOf58, '`ApiError` or `DiffScopeDryRunAnswer`', where59, problems);
        }
        reportUnknownFields(object55, ['call', 'with', 'answer'], path, problems);
      }
    } else if (oneOf1.call === 'getNextBuildInfo') {
      const object60 = asObject(oneOf1, path, problems);
      if (object60) {
        expectLiteral(object60.call, 'getNextBuildInfo', at(path, 'call'), problems);
        const where61 = at(path, 'with');
        const object62 = asObject(object60.with, where61, problems);
        if (object62) {
          expectStringArray(object62.platforms, at(where61, 'platforms'), problems);
          reportUnknownFields(object62, ['platforms'], where61, problems);
        }
        const oneOf63 = object60.answer;
        const where64 = at(path, 'answer');
        if (isPlainObject(oneOf63)) {
          if ('error' in oneOf63) {
            readApiError(oneOf63, where64, problems);
          } else if ('nextBuildIndex' in oneOf63) {
            readNextBuildInfoAnswer(oneOf63, where64, problems);
          } else {
            reportWrongShape(oneOf63, '`ApiError` or `NextBuildInfoAnswer`', where64, problems);
          }
        } else {
          reportWrongShape(oneOf63, '`ApiError` or `NextBuildInfoAnswer`', where64, problems);
        }
        reportUnknownFields(object60, ['call', 'with', 'answer'], path, problems);
      }
    } else if (oneOf1.call === 'getStagedUploadUrls') {
      const object65 = asObject(oneOf1, path, problems);
      if (object65) {
        expectLiteral(object65.call, 'getStagedUploadUrls', at(path, 'call'), problems);
        const where66 = at(path, 'with');
        const object67 = asObject(object65.with, where66, problems);
        if (object67) {
          expectStringArray(object67.platforms, at(where66, 'platforms'), problems);
          reportUnknownFields(object67, ['platforms'], where66, problems);
        }
        const oneOf68 = object65.answer;
        const where69 = at(path, 'answer');
        if (isPlainObject(oneOf68)) {
          if ('error' in oneOf68) {
            readApiError(oneOf68, where69, problems);
          } else {
            const map70 = asObject(oneOf68, where69, problems);
            if (map70) {
              reportUnknownFields(map70, [], where69, problems);
            }
          }
        } else {
          reportWrongShape(oneOf68, '`ApiError` or an object', where69, problems);
        }
        reportUnknownFields(object65, ['call', 'with', 'answer'], path, problems);
      }
    } else if (oneOf1.call === 'checkStagedGate') {
      const object71 = asObject(oneOf1, path, problems);
      if (object71) {
        expectLiteral(object71.call, 'checkStagedGate', at(path, 'call'), problems);
        const where72 = at(path, 'with');
        const object73 = asObject(object71.with, where72, problems);
        if (object73) {
          expectString(object73.platform, at(where72, 'platform'), problems);
          expectString(object73.baseFingerprint, at(where72, 'baseFingerprint'), problems);
          reportUnknownFields(object73, ['platform', 'baseFingerprint'], where72, problems);
        }
        const oneOf74 = object71.answer;
        const where75 = at(path, 'answer');
        if (isPlainObject(oneOf74)) {
          if ('error' in oneOf74) {
            readApiError(oneOf74, where75, problems);
          } else if ('outcome' in oneOf74) {
            readStagedGateAnswer(oneOf74, where75, problems);
          } else {
            reportWrongShape(oneOf74, '`ApiError` or `StagedGateAnswer`', where75, problems);
          }
        } else {
          reportWrongShape(oneOf74, '`ApiError` or `StagedGateAnswer`', where75, problems);
        }
        reportUnknownFields(object71, ['call', 'with', 'answer'], path, problems);
      }
    } else if (oneOf1.call === 'trackCliInit') {
      const object76 = asObject(oneOf1, path, problems);
      if (object76) {
        expectLiteral(object76.call, 'trackCliInit', at(path, 'call'), problems);
        const where77 = at(path, 'with');
        const object78 = asObject(object76.with, where77, problems);
        if (object78) {
          expectString(object78.event, at(where77, 'event'), problems);
          reportUnknownFields(object78, ['event'], where77, problems);
        }
        const oneOf79 = object76.answer;
        const where80 = at(path, 'answer');
        if (isPlainObject(oneOf79)) {
          if ('error' in oneOf79) {
            readApiError(oneOf79, where80, problems);
          } else if ('sessionId' in oneOf79) {
            const object81 = asObject(oneOf79, where80, problems);
            if (object81) {
              expectString(object81.sessionId, at(where80, 'sessionId'), problems);
              reportUnknownFields(object81, ['sessionId'], where80, problems);
            }
          } else {
            reportWrongShape(oneOf79, '`ApiError` or `{ sessionId: string }`', where80, problems);
          }
        } else {
          reportWrongShape(oneOf79, '`ApiError` or `{ sessionId: string }`', where80, problems);
        }
        reportUnknownFields(object76, ['call', 'with', 'answer'], path, problems);
      }
    } else {
      reportUnknownName(
        oneOf1.call,
        [
          'getBuildStatus',
          'createProject',
          'createTeam',
          'listTeams',
          'listProjects',
          'openBuild',
          'computeDiffScopeDryRun',
          'getNextBuildInfo',
          'getStagedUploadUrls',
          'checkStagedGate',
          'trackCliInit',
        ],
        at(path, 'call'),
        problems
      );
    }
  } else {
    reportWrongShape(
      oneOf1,
      "`{ call: 'getBuildStatus'; with: { buildIndex: number }; answer: ApiError | BuildStatusAnswer | null }`, `{ call: 'createProject'; with: { teamId: string; name: string }; answer: ApiError | { name: string; index: number; projectToken: string } }`, `{ call: 'createTeam'; with: { name: string }; answer: ApiError | { id: string; name: string } }`, `{ call: 'listTeams'; with: Record<string, never>; answer: ApiError | { teams: Array<{ id: string; name: string; projectCount: number; role: string | null }> } }`, `{ call: 'listProjects'; with: { teamId: string }; answer: ApiError | { team: { name: string; id: string }; projects: Array<{ index: number; name: string; buildCount: number; mainBranch: string | null }> } }`, `{ call: 'openBuild'; with: { platforms: string[] }; answer: ApiError | { buildIndex: number; url: string; captureDecision?: PosedCaptureDecision } }`, `{ call: 'computeDiffScopeDryRun'; with: { branch: string; commit: string }; answer: ApiError | DiffScopeDryRunAnswer }`, `{ call: 'getNextBuildInfo'; with: { platforms: string[] }; answer: ApiError | NextBuildInfoAnswer }`, `{ call: 'getStagedUploadUrls'; with: { platforms: string[] }; answer: ApiError | Record<string, never> }`, `{ call: 'checkStagedGate'; with: { platform: string; baseFingerprint: string }; answer: ApiError | StagedGateAnswer }` or `{ call: 'trackCliInit'; with: { event: string }; answer: ApiError | { sessionId: string } }`",
      path,
      problems
    );
  }
}

/** The shape of a `PosedPush`, as `contracts/pose.contract.ts` publishes it. */
function readPosedPush(value: unknown, path: string, problems: string[]): void {
  const object1 = asObject(value, path, problems);
  if (object1) {
    expectString(object1.now, at(path, 'now'), problems);
    const where2 = at(path, 'binaries');
    const map3 = asObject(object1.binaries, where2, problems);
    if (map3) {
      for (const key4 of Object.keys(map3)) {
        readPosedBinary(map3[key4], atKey(where2, key4), problems);
      }
    }
    const oneOf5 = object1.fingerprint;
    const where6 = at(path, 'fingerprint');
    if (isPlainObject(oneOf5)) {
      if ('hash' in oneOf5) {
        const object7 = asObject(oneOf5, where6, problems);
        if (object7) {
          expectString(object7.hash, at(where6, 'hash'), problems);
          reportUnknownFields(object7, ['hash'], where6, problems);
        }
      } else if ('unavailable' in oneOf5) {
        const object8 = asObject(oneOf5, where6, problems);
        if (object8) {
          expectString(object8.unavailable, at(where6, 'unavailable'), problems);
          reportUnknownFields(object8, ['unavailable'], where6, problems);
        }
      } else {
        reportWrongShape(
          oneOf5,
          '`{ hash: string }` or `{ unavailable: string }`',
          where6,
          problems
        );
      }
    } else {
      reportWrongShape(oneOf5, '`{ hash: string }` or `{ unavailable: string }`', where6, problems);
    }
    reportUnknownFields(object1, ['now', 'binaries', 'fingerprint'], path, problems);
  }
}

/** The shape of a `PosedWorkstation`, as `contracts/pose.contract.ts` publishes it. */
function readPosedWorkstation(value: unknown, path: string, problems: string[]): void {
  const object1 = asObject(value, path, problems);
  if (object1) {
    const where2 = at(path, 'install');
    const object3 = asObject(object1.install, where2, problems);
    if (object3) {
      expectString(object3.package, at(where2, 'package'), problems);
      reportUnknownFields(object3, ['package'], where2, problems);
    }
    expectOneOf(object1.enter, ['pressed', 'closed'], at(path, 'enter'), problems);
    reportUnknownFields(object1, ['install', 'enter'], path, problems);
  }
}

/** The shape of a `PosedLetterbox`, as `contracts/pose.contract.ts` publishes it. */
function readPosedLetterbox(value: unknown, path: string, problems: string[]): void {
  const oneOf1 = value;
  if (oneOf1 === 'no-bundler' || oneOf1 === 'no-app') {
    // the value is one of these
  } else if (isPlainObject(oneOf1)) {
    const object2 = asObject(oneOf1, path, problems);
    if (object2) {
      expectStringArray(object2.stories, at(path, 'stories'), problems);
      if ('rendered' in object2) {
        expectOneOf(object2.rendered, ['yes', 'timed-out'], at(path, 'rendered'), problems);
      }
      if ('threw' in object2) {
        const where3 = at(path, 'threw');
        const object4 = asObject(object2.threw, where3, problems);
        if (object4) {
          expectString(object4.name, at(where3, 'name'), problems);
          expectString(object4.message, at(where3, 'message'), problems);
          reportUnknownFields(object4, ['name', 'message'], where3, problems);
        }
      }
      reportUnknownFields(object2, ['stories', 'rendered', 'threw'], path, problems);
    }
  } else {
    reportWrongShape(
      oneOf1,
      '`"no-bundler"`, `"no-app"` or `{ stories: string[]; rendered?: \'yes\' | \'timed-out\'; threw?: { name: string; message: string } }`',
      path,
      problems
    );
  }
}

/** The shape of a `PosedCapture`, as `contracts/pose.contract.ts` publishes it. */
function readPosedCapture(value: unknown, path: string, problems: string[]): void {
  const oneOf1 = value;
  if (oneOf1 === 'no-bundler' || oneOf1 === 'no-app') {
    // the value is one of these
  } else if (isPlainObject(oneOf1)) {
    if ('crashed' in oneOf1) {
      const object2 = asObject(oneOf1, path, problems);
      if (object2) {
        expectStringArray(object2.stories, at(path, 'stories'), problems);
        const where3 = at(path, 'crashed');
        const object4 = asObject(object2.crashed, where3, problems);
        if (object4) {
          if ('name' in object4) {
            expectString(object4.name, at(where3, 'name'), problems);
          }
          if ('message' in object4) {
            expectString(object4.message, at(where3, 'message'), problems);
          }
          reportUnknownFields(object4, ['name', 'message'], where3, problems);
        }
        reportUnknownFields(object2, ['stories', 'crashed'], path, problems);
      }
    } else if ('settled' in oneOf1) {
      const object5 = asObject(oneOf1, path, problems);
      if (object5) {
        expectStringArray(object5.stories, at(path, 'stories'), problems);
        const oneOf6 = object5.settled;
        const where7 = at(path, 'settled');
        if (oneOf6 === 'timed-out') {
          // the value is one of these
        } else if (isPlainObject(oneOf6)) {
          const object8 = asObject(oneOf6, where7, problems);
          if (object8) {
            expectNumber(object8.ms, at(where7, 'ms'), problems);
            expectNumber(object8.frames, at(where7, 'frames'), problems);
            reportUnknownFields(object8, ['ms', 'frames'], where7, problems);
          }
        } else {
          reportWrongShape(
            oneOf6,
            '`"timed-out"` or `{ ms: number; frames: number }`',
            where7,
            problems
          );
        }
        if ('threw' in object5) {
          const where9 = at(path, 'threw');
          const object10 = asObject(object5.threw, where9, problems);
          if (object10) {
            expectString(object10.name, at(where9, 'name'), problems);
            expectString(object10.message, at(where9, 'message'), problems);
            reportUnknownFields(object10, ['name', 'message'], where9, problems);
          }
        }
        if ('parts' in object5) {
          expectNumber(object5.parts, at(path, 'parts'), problems);
        }
        if ('hasNetworkImage' in object5) {
          expectBoolean(object5.hasNetworkImage, at(path, 'hasNetworkImage'), problems);
        }
        readPosedView(object5.tree, at(path, 'tree'), problems);
        reportUnknownFields(
          object5,
          ['stories', 'settled', 'threw', 'parts', 'hasNetworkImage', 'tree'],
          path,
          problems
        );
      }
    } else {
      reportWrongShape(
        oneOf1,
        "`{ stories: string[]; crashed: { name?: string; message?: string } }` or `{ stories: string[]; settled: 'timed-out' | { ms: number; frames: number }; threw?: { name: string; message: string }; parts?: number; hasNetworkImage?: boolean; tree: PosedView }`",
        path,
        problems
      );
    }
  } else {
    reportWrongShape(
      oneOf1,
      '`"no-bundler"`, `"no-app"`, `{ stories: string[]; crashed: { name?: string; message?: string } }` or `{ stories: string[]; settled: \'timed-out\' | { ms: number; frames: number }; threw?: { name: string; message: string }; parts?: number; hasNetworkImage?: boolean; tree: PosedView }`',
      path,
      problems
    );
  }
}

/** The shape of a `ApiError`, as `contracts/pose.contract.ts` publishes it. */
function readApiError(value: unknown, path: string, problems: string[]): void {
  const object1 = asObject(value, path, problems);
  if (object1) {
    expectString(object1.error, at(path, 'error'), problems);
    reportUnknownFields(object1, ['error'], path, problems);
  }
}

/** The shape of a `BuildStatusAnswer`, as `contracts/pose.contract.ts` publishes it. */
function readBuildStatusAnswer(value: unknown, path: string, problems: string[]): void {
  const object1 = asObject(value, path, problems);
  if (object1) {
    expectOneOf(
      object1.runStatus,
      ['canceled', 'error', 'finished', 'inProgress', 'queued', 'waiting'],
      at(path, 'runStatus'),
      problems
    );
    if ('showsOnlyBranchChanges' in object1) {
      expectBoolean(object1.showsOnlyBranchChanges, at(path, 'showsOnlyBranchChanges'), problems);
    }
    if ('status' in object1) {
      expectOneOf(
        object1.status,
        ['approved', 'noChanges', 'reported', 'unreviewed'],
        at(path, 'status'),
        problems
      );
    }
    if ('viewStatusesCount' in object1) {
      const where2 = at(path, 'viewStatusesCount');
      const object3 = asObject(object1.viewStatusesCount, where2, problems);
      if (object3) {
        expectNumber(object3.approved, at(where2, 'approved'), problems);
        expectNumber(object3.noChanges, at(where2, 'noChanges'), problems);
        expectNumber(object3.reported, at(where2, 'reported'), problems);
        expectNumber(object3.unreviewed, at(where2, 'unreviewed'), problems);
        reportUnknownFields(
          object3,
          ['approved', 'noChanges', 'reported', 'unreviewed'],
          where2,
          problems
        );
      }
    }
    if ('diffScopeInfo' in object1) {
      const where4 = at(path, 'diffScopeInfo');
      const object5 = asObject(object1.diffScopeInfo, where4, problems);
      if (object5) {
        if ('capturedSnapshotCount' in object5) {
          expectNumber(
            object5.capturedSnapshotCount,
            at(where4, 'capturedSnapshotCount'),
            problems
          );
        }
        if ('inheritedSnapshotCount' in object5) {
          expectNumber(
            object5.inheritedSnapshotCount,
            at(where4, 'inheritedSnapshotCount'),
            problems
          );
        }
        if ('platforms' in object5) {
          const where6 = at(where4, 'platforms');
          const object7 = asObject(object5.platforms, where6, problems);
          if (object7) {
            if ('android' in object7) {
              const where8 = at(where6, 'android');
              const object9 = asObject(object7.android, where8, problems);
              if (object9) {
                if ('reason' in object9) {
                  expectString(object9.reason, at(where8, 'reason'), problems);
                }
                reportUnknownFields(object9, ['reason'], where8, problems);
              }
            }
            if ('ios' in object7) {
              const where10 = at(where6, 'ios');
              const object11 = asObject(object7.ios, where10, problems);
              if (object11) {
                if ('reason' in object11) {
                  expectString(object11.reason, at(where10, 'reason'), problems);
                }
                reportUnknownFields(object11, ['reason'], where10, problems);
              }
            }
            reportUnknownFields(object7, ['android', 'ios'], where6, problems);
          }
        }
        reportUnknownFields(
          object5,
          ['capturedSnapshotCount', 'inheritedSnapshotCount', 'platforms'],
          where4,
          problems
        );
      }
    }
    if ('gitInfo' in object1) {
      const where12 = at(path, 'gitInfo');
      const object13 = asObject(object1.gitInfo, where12, problems);
      if (object13) {
        expectString(object13.branchName, at(where12, 'branchName'), problems);
        expectString(object13.commitHash, at(where12, 'commitHash'), problems);
        reportUnknownFields(object13, ['branchName', 'commitHash'], where12, problems);
      }
    }
    if ('stories' in object1) {
      const oneOf14 = object1.stories;
      const where15 = at(path, 'stories');
      if (oneOf14 === null) {
        // the value is one of these
      } else if (Array.isArray(oneOf14)) {
        const list16 = asArray(oneOf14, where15, problems);
        if (list16) {
          list16.forEach((entry17, index18) => {
            const where19 = atIndex(where15, index18);
            const object20 = asObject(entry17, where19, problems);
            if (object20) {
              expectString(object20.name, at(where19, 'name'), problems);
              expectString(object20.status, at(where19, 'status'), problems);
              const oneOf21 = object20.baseline;
              const where22 = at(where19, 'baseline');
              if (oneOf21 === null) {
                // the value is one of these
              } else if (isPlainObject(oneOf21)) {
                const object23 = asObject(oneOf21, where22, problems);
                if (object23) {
                  expectNumber(object23.buildIndex, at(where22, 'buildIndex'), problems);
                  reportUnknownFields(object23, ['buildIndex'], where22, problems);
                }
              } else {
                reportWrongShape(oneOf21, '`{ buildIndex: number }` or `null`', where22, problems);
              }
              if ('reason' in object20) {
                const oneOf24 = object20.reason;
                const where25 = at(where19, 'reason');
                if (typeof oneOf24 === 'string' || oneOf24 === null) {
                  // the value is one of these
                } else {
                  reportWrongShape(oneOf24, 'a string or `null`', where25, problems);
                }
              }
              if ('candidates' in object20) {
                const oneOf26 = object20.candidates;
                const where27 = at(where19, 'candidates');
                if (oneOf26 === null) {
                  // the value is one of these
                } else if (Array.isArray(oneOf26)) {
                  const list28 = asArray(oneOf26, where27, problems);
                  if (list28) {
                    list28.forEach((entry29, index30) => {
                      const where31 = atIndex(where27, index30);
                      const object32 = asObject(entry29, where31, problems);
                      if (object32) {
                        expectNumber(object32.buildIndex, at(where31, 'buildIndex'), problems);
                        reportUnknownFields(object32, ['buildIndex'], where31, problems);
                      }
                    });
                  }
                } else {
                  reportWrongShape(
                    oneOf26,
                    '`Array<{ buildIndex: number }>` or `null`',
                    where27,
                    problems
                  );
                }
              }
              reportUnknownFields(
                object20,
                ['name', 'status', 'baseline', 'reason', 'candidates'],
                where19,
                problems
              );
            }
          });
        }
      } else {
        reportWrongShape(
          oneOf14,
          '`Array<{ name: string; status: string; baseline: { buildIndex: number } | null; reason?: string | null; candidates?: Array<{ buildIndex: number }> | null }>` or `null`',
          where15,
          problems
        );
      }
    }
    if ('diffScope' in object1) {
      const where33 = at(path, 'diffScope');
      const object34 = asObject(object1.diffScope, where33, problems);
      if (object34) {
        expectString(object34.reason, at(where33, 'reason'), problems);
        expectStringArray(object34.captured, at(where33, 'captured'), problems);
        expectStringArray(object34.inherited, at(where33, 'inherited'), problems);
        const oneOf35 = object34.ancestorBuildIndex;
        const where36 = at(where33, 'ancestorBuildIndex');
        if (typeof oneOf35 === 'number' || oneOf35 === null) {
          // the value is one of these
        } else {
          reportWrongShape(oneOf35, 'a number or `null`', where36, problems);
        }
        reportUnknownFields(
          object34,
          ['reason', 'captured', 'inherited', 'ancestorBuildIndex'],
          where33,
          problems
        );
      }
    }
    reportUnknownFields(
      object1,
      [
        'runStatus',
        'showsOnlyBranchChanges',
        'status',
        'viewStatusesCount',
        'runError',
        'diffScopeInfo',
        'gitInfo',
        'stories',
        'diffScope',
      ],
      path,
      problems
    );
  }
}

/** The shape of a `PosedCaptureDecision`, as `contracts/pose.contract.ts` publishes it. */
function readPosedCaptureDecision(value: unknown, path: string, problems: string[]): void {
  const object1 = asObject(value, path, problems);
  if (object1) {
    const where2 = at(path, 'platforms');
    const map3 = asObject(object1.platforms, where2, problems);
    if (map3) {
      for (const key4 of Object.keys(map3)) {
        readPosedPlatformCaptureDecision(map3[key4], atKey(where2, key4), problems);
      }
    }
    if ('fullCaptureTriggerReason' in object1) {
      expectString(
        object1.fullCaptureTriggerReason,
        at(path, 'fullCaptureTriggerReason'),
        problems
      );
    }
    if ('ancestorBuildIndex' in object1) {
      expectNumber(object1.ancestorBuildIndex, at(path, 'ancestorBuildIndex'), problems);
    }
    reportUnknownFields(
      object1,
      ['platforms', 'fullCaptureTriggerReason', 'ancestorBuildIndex'],
      path,
      problems
    );
  }
}

/** The shape of a `DiffScopeDryRunAnswer`, as `contracts/pose.contract.ts` publishes it. */
function readDiffScopeDryRunAnswer(value: unknown, path: string, problems: string[]): void {
  const object1 = asObject(value, path, problems);
  if (object1) {
    const where2 = at(path, 'platforms');
    const list3 = asArray(object1.platforms, where2, problems);
    if (list3) {
      list3.forEach((entry4, index5) => {
        const where6 = atIndex(where2, index5);
        const object7 = asObject(entry4, where6, problems);
        if (object7) {
          expectOneOf(object7.platform, ['android', 'ios'], at(where6, 'platform'), problems);
          expectBoolean(object7.isFullCapture, at(where6, 'isFullCapture'), problems);
          expectString(object7.reason, at(where6, 'reason'), problems);
          expectStringArray(
            object7.capturedStoryFilePaths,
            at(where6, 'capturedStoryFilePaths'),
            problems
          );
          reportUnknownFields(
            object7,
            ['platform', 'isFullCapture', 'reason', 'capturedStoryFilePaths'],
            where6,
            problems
          );
        }
      });
    }
    reportUnknownFields(object1, ['platforms'], path, problems);
  }
}

/** The shape of a `NextBuildInfoAnswer`, as `contracts/pose.contract.ts` publishes it. */
function readNextBuildInfoAnswer(value: unknown, path: string, problems: string[]): void {
  const object1 = asObject(value, path, problems);
  if (object1) {
    expectNumber(object1.nextBuildIndex, at(path, 'nextBuildIndex'), problems);
    const where2 = at(path, 'binaries');
    const map3 = asObject(object1.binaries, where2, problems);
    if (map3) {
      for (const key4 of Object.keys(map3)) {
        const oneOf5 = map3[key4];
        const where6 = atKey(where2, key4);
        if (isPlainObject(oneOf5)) {
          if ('upload' in oneOf5) {
            const object7 = asObject(oneOf5, where6, problems);
            if (object7) {
              expectLiteral(object7.upload, true, at(where6, 'upload'), problems);
              reportUnknownFields(object7, ['upload'], where6, problems);
            }
          } else if ('reuse' in oneOf5) {
            const object8 = asObject(oneOf5, where6, problems);
            if (object8) {
              const where9 = at(where6, 'reuse');
              const object10 = asObject(object8.reuse, where9, problems);
              if (object10) {
                expectNumber(object10.buildIndex, at(where9, 'buildIndex'), problems);
                expectString(object10.createdAt, at(where9, 'createdAt'), problems);
                reportUnknownFields(object10, ['buildIndex', 'createdAt'], where9, problems);
              }
              reportUnknownFields(object8, ['reuse'], where6, problems);
            }
          } else {
            reportWrongShape(
              oneOf5,
              '`{ upload: true }` or `{ reuse: { buildIndex: number; createdAt: string } }`',
              where6,
              problems
            );
          }
        } else {
          reportWrongShape(
            oneOf5,
            '`{ upload: true }` or `{ reuse: { buildIndex: number; createdAt: string } }`',
            where6,
            problems
          );
        }
      }
    }
    reportUnknownFields(object1, ['nextBuildIndex', 'binaries'], path, problems);
  }
}

/** The shape of a `StagedGateAnswer`, as `contracts/pose.contract.ts` publishes it. */
function readStagedGateAnswer(value: unknown, path: string, problems: string[]): void {
  const object1 = asObject(value, path, problems);
  if (object1) {
    expectOneOf(
      object1.outcome,
      ['fast', 'full-build-needed', 'not-stageable'],
      at(path, 'outcome'),
      problems
    );
    const where2 = at(path, 'diff');
    const list3 = asArray(object1.diff, where2, problems);
    if (list3) {
      list3.forEach((entry4, index5) => {
        expectOneOf(
          entry4,
          [
            'engineClass',
            'assetInventory',
            'expoUpdatesEnabled',
            'sdkProtocolVersion',
            'buildMetadata',
            'bundleFormat',
          ],
          atIndex(where2, index5),
          problems
        );
      });
    }
    reportUnknownFields(object1, ['outcome', 'diff'], path, problems);
  }
}

/** The shape of a `PosedBinary`, as `contracts/pose.contract.ts` publishes it. */
function readPosedBinary(value: unknown, path: string, problems: string[]): void {
  const object1 = asObject(value, path, problems);
  if (object1) {
    expectString(object1.hash, at(path, 'hash'), problems);
    expectString(object1.sizeMb, at(path, 'sizeMb'), problems);
    const oneOf2 = object1.sdkVersion;
    const where3 = at(path, 'sdkVersion');
    if (typeof oneOf2 === 'string' || oneOf2 === null) {
      // the value is one of these
    } else {
      reportWrongShape(oneOf2, 'a string or `null`', where3, problems);
    }
    expectBoolean(object1.hasEmbeddedBundle, at(path, 'hasEmbeddedBundle'), problems);
    expectOneOf(
      object1.bundleFormat,
      ['plain-js', 'hermes-bytecode', 'ram'],
      at(path, 'bundleFormat'),
      problems
    );
    expectBoolean(object1.expoUpdatesEnabled, at(path, 'expoUpdatesEnabled'), problems);
    expectBoolean(object1.hasExpoDevClient, at(path, 'hasExpoDevClient'), problems);
    if ('expoSdkVersion' in object1) {
      expectString(object1.expoSdkVersion, at(path, 'expoSdkVersion'), problems);
    }
    if ('androidAbis' in object1) {
      expectStringArray(object1.androidAbis, at(path, 'androidAbis'), problems);
    }
    reportUnknownFields(
      object1,
      [
        'hash',
        'sizeMb',
        'sdkVersion',
        'hasEmbeddedBundle',
        'bundleFormat',
        'expoUpdatesEnabled',
        'hasExpoDevClient',
        'expoSdkVersion',
        'androidAbis',
      ],
      path,
      problems
    );
  }
}

/** The shape of a `PosedView`, as `contracts/pose.contract.ts` publishes it. */
function readPosedView(value: unknown, path: string, problems: string[]): void {
  const object1 = asObject(value, path, problems);
  if (object1) {
    expectString(object1.primitive, at(path, 'primitive'), problems);
    if ('components' in object1) {
      expectStringArray(object1.components, at(path, 'components'), problems);
    }
    if ('text' in object1) {
      expectString(object1.text, at(path, 'text'), problems);
    }
    if ('size' in object1) {
      const where2 = at(path, 'size');
      const object3 = asObject(object1.size, where2, problems);
      if (object3) {
        expectNumber(object3.width, at(where2, 'width'), problems);
        expectNumber(object3.height, at(where2, 'height'), problems);
        reportUnknownFields(object3, ['width', 'height'], where2, problems);
      }
    }
    if ('style' in object1) {
      asObject(object1.style, at(path, 'style'), problems);
    }
    if ('props' in object1) {
      const where4 = at(path, 'props');
      const map5 = asObject(object1.props, where4, problems);
      if (map5) {
        for (const key6 of Object.keys(map5)) {
          const oneOf7 = map5[key6];
          const where8 = atKey(where4, key6);
          if (
            typeof oneOf7 === 'string' ||
            typeof oneOf7 === 'number' ||
            typeof oneOf7 === 'boolean'
          ) {
            // the value is one of these
          } else {
            reportWrongShape(oneOf7, 'a string, a number or true/false', where8, problems);
          }
        }
      }
    }
    if ('children' in object1) {
      const where9 = at(path, 'children');
      const list10 = asArray(object1.children, where9, problems);
      if (list10) {
        list10.forEach((entry11, index12) => {
          readPosedView(entry11, atIndex(where9, index12), problems);
        });
      }
    }
    reportUnknownFields(
      object1,
      ['primitive', 'components', 'text', 'size', 'style', 'props', 'children'],
      path,
      problems
    );
  }
}

/** The shape of a `PosedPlatformCaptureDecision`, as `contracts/pose.contract.ts` publishes it. */
function readPosedPlatformCaptureDecision(value: unknown, path: string, problems: string[]): void {
  const object1 = asObject(value, path, problems);
  if (object1) {
    expectBoolean(object1.full, at(path, 'full'), problems);
    if ('storyFilePaths' in object1) {
      expectStringArray(object1.storyFilePaths, at(path, 'storyFilePaths'), problems);
    }
    if ('reason' in object1) {
      expectString(object1.reason, at(path, 'reason'), problems);
    }
    reportUnknownFields(object1, ['full', 'storyFilePaths', 'reason'], path, problems);
  }
}
