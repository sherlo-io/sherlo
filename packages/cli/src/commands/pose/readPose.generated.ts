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
    if ('appBuild' in object1) {
      readPosedAppBuild(object1.appBuild, at(path, 'appBuild'), problems);
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
    if ('browser' in object1) {
      readPosedBrowser(object1.browser, at(path, 'browser'), problems);
    }
    if ('logins' in object1) {
      readPosedLogins(object1.logins, at(path, 'logins'), problems);
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
        'appBuild',
        'clock',
        'workstation',
        'letterbox',
        'capture',
        'browser',
        'logins',
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
    if ('storyTitles' in object1) {
      const where4 = at(path, 'storyTitles');
      const map5 = asObject(object1.storyTitles, where4, problems);
      if (map5) {
        for (const key6 of Object.keys(map5)) {
          const where7 = atKey(where4, key6);
          const object8 = asObject(map5[key6], where7, problems);
          if (object8) {
            expectString(object8.title, at(where7, 'title'), problems);
            expectNumber(object8.stories, at(where7, 'stories'), problems);
            reportUnknownFields(object8, ['title', 'stories'], where7, problems);
          }
        }
      }
    }
    reportUnknownFields(
      object1,
      [
        'bundlePath',
        'bundleSizeMb',
        'bundleFormat',
        'bundler',
        'assets',
        'storyClosureKeys',
        'storyTitles',
      ],
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
          if ('pushFacts' in object51) {
            readPushFacts(object51.pushFacts, at(where50, 'pushFacts'), problems);
          }
          reportUnknownFields(object51, ['platforms', 'pushFacts'], where50, problems);
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
              if ('hasCiToken' in object54) {
                expectBoolean(object54.hasCiToken, at(where53, 'hasCiToken'), problems);
              }
              reportUnknownFields(
                object54,
                ['buildIndex', 'url', 'captureDecision', 'hasCiToken'],
                where53,
                problems
              );
            }
          } else {
            reportWrongShape(
              oneOf52,
              '`ApiError` or `{ buildIndex: number; url: string; captureDecision?: PosedCaptureDecision; hasCiToken?: boolean }`',
              where53,
              problems
            );
          }
        } else {
          reportWrongShape(
            oneOf52,
            '`ApiError` or `{ buildIndex: number; url: string; captureDecision?: PosedCaptureDecision; hasCiToken?: boolean }`',
            where53,
            problems
          );
        }
        reportUnknownFields(object49, ['call', 'with', 'answer'], path, problems);
      }
    } else if (oneOf1.call === 'joinBuild') {
      const object55 = asObject(oneOf1, path, problems);
      if (object55) {
        expectLiteral(object55.call, 'joinBuild', at(path, 'call'), problems);
        const where56 = at(path, 'with');
        const object57 = asObject(object55.with, where56, problems);
        if (object57) {
          expectString(object57.joinKey, at(where56, 'joinKey'), problems);
          expectString(object57.platform, at(where56, 'platform'), problems);
          if ('pushFacts' in object57) {
            readPushFactsPlatform(object57.pushFacts, at(where56, 'pushFacts'), problems);
          }
          reportUnknownFields(object57, ['joinKey', 'platform', 'pushFacts'], where56, problems);
        }
        const oneOf58 = object55.answer;
        const where59 = at(path, 'answer');
        if (isPlainObject(oneOf58)) {
          if ('error' in oneOf58) {
            readApiError(oneOf58, where59, problems);
          } else if ('buildIndex' in oneOf58) {
            const object60 = asObject(oneOf58, where59, problems);
            if (object60) {
              expectNumber(object60.buildIndex, at(where59, 'buildIndex'), problems);
              expectStringArray(object60.waitingFor, at(where59, 'waitingFor'), problems);
              if ('startedRun' in object60) {
                readStartedRun(object60.startedRun, at(where59, 'startedRun'), problems);
              }
              reportUnknownFields(
                object60,
                ['buildIndex', 'waitingFor', 'startedRun'],
                where59,
                problems
              );
            }
          } else {
            reportWrongShape(
              oneOf58,
              '`ApiError` or `{ buildIndex: number; waitingFor: string[]; startedRun?: StartedRun }`',
              where59,
              problems
            );
          }
        } else {
          reportWrongShape(
            oneOf58,
            '`ApiError` or `{ buildIndex: number; waitingFor: string[]; startedRun?: StartedRun }`',
            where59,
            problems
          );
        }
        reportUnknownFields(object55, ['call', 'with', 'answer'], path, problems);
      }
    } else if (oneOf1.call === 'asyncUpload') {
      const object61 = asObject(oneOf1, path, problems);
      if (object61) {
        expectLiteral(object61.call, 'asyncUpload', at(path, 'call'), problems);
        const where62 = at(path, 'with');
        const object63 = asObject(object61.with, where62, problems);
        if (object63) {
          expectNumber(object63.buildIndex, at(where62, 'buildIndex'), problems);
          expectString(object63.platform, at(where62, 'platform'), problems);
          if ('pushFacts' in object63) {
            readPushFactsPlatform(object63.pushFacts, at(where62, 'pushFacts'), problems);
          }
          reportUnknownFields(object63, ['buildIndex', 'platform', 'pushFacts'], where62, problems);
        }
        const oneOf64 = object61.answer;
        const where65 = at(path, 'answer');
        if (isPlainObject(oneOf64)) {
          if ('error' in oneOf64) {
            readApiError(oneOf64, where65, problems);
          } else if ('couldRunThisBuildRightNow' in oneOf64) {
            const object66 = asObject(oneOf64, where65, problems);
            if (object66) {
              expectBoolean(
                object66.couldRunThisBuildRightNow,
                at(where65, 'couldRunThisBuildRightNow'),
                problems
              );
              if ('startedRun' in object66) {
                readStartedRun(object66.startedRun, at(where65, 'startedRun'), problems);
              }
              reportUnknownFields(
                object66,
                ['couldRunThisBuildRightNow', 'startedRun'],
                where65,
                problems
              );
            }
          } else {
            reportWrongShape(
              oneOf64,
              '`ApiError` or `{ couldRunThisBuildRightNow: boolean; startedRun?: StartedRun }`',
              where65,
              problems
            );
          }
        } else {
          reportWrongShape(
            oneOf64,
            '`ApiError` or `{ couldRunThisBuildRightNow: boolean; startedRun?: StartedRun }`',
            where65,
            problems
          );
        }
        reportUnknownFields(object61, ['call', 'with', 'answer'], path, problems);
      }
    } else if (oneOf1.call === 'closeBuild') {
      const object67 = asObject(oneOf1, path, problems);
      if (object67) {
        expectLiteral(object67.call, 'closeBuild', at(path, 'call'), problems);
        const where68 = at(path, 'with');
        const object69 = asObject(object67.with, where68, problems);
        if (object69) {
          expectNumber(object69.buildIndex, at(where68, 'buildIndex'), problems);
          expectString(object69.runError, at(where68, 'runError'), problems);
          reportUnknownFields(object69, ['buildIndex', 'runError'], where68, problems);
        }
        const oneOf70 = object67.answer;
        const where71 = at(path, 'answer');
        if (isPlainObject(oneOf70)) {
          if ('error' in oneOf70) {
            readApiError(oneOf70, where71, problems);
          } else {
            const map72 = asObject(oneOf70, where71, problems);
            if (map72) {
              reportUnknownFields(map72, [], where71, problems);
            }
          }
        } else {
          reportWrongShape(oneOf70, '`ApiError` or an object', where71, problems);
        }
        reportUnknownFields(object67, ['call', 'with', 'answer'], path, problems);
      }
    } else if (oneOf1.call === 'computeDiffScopeDryRun') {
      const object73 = asObject(oneOf1, path, problems);
      if (object73) {
        expectLiteral(object73.call, 'computeDiffScopeDryRun', at(path, 'call'), problems);
        const where74 = at(path, 'with');
        const object75 = asObject(object73.with, where74, problems);
        if (object75) {
          expectString(object75.branch, at(where74, 'branch'), problems);
          expectString(object75.commit, at(where74, 'commit'), problems);
          reportUnknownFields(object75, ['branch', 'commit'], where74, problems);
        }
        const oneOf76 = object73.answer;
        const where77 = at(path, 'answer');
        if (isPlainObject(oneOf76)) {
          if ('error' in oneOf76) {
            readApiError(oneOf76, where77, problems);
          } else if ('platforms' in oneOf76) {
            readDiffScopeDryRunAnswer(oneOf76, where77, problems);
          } else {
            reportWrongShape(oneOf76, '`ApiError` or `DiffScopeDryRunAnswer`', where77, problems);
          }
        } else {
          reportWrongShape(oneOf76, '`ApiError` or `DiffScopeDryRunAnswer`', where77, problems);
        }
        reportUnknownFields(object73, ['call', 'with', 'answer'], path, problems);
      }
    } else if (oneOf1.call === 'getNextBuildInfo') {
      const object78 = asObject(oneOf1, path, problems);
      if (object78) {
        expectLiteral(object78.call, 'getNextBuildInfo', at(path, 'call'), problems);
        const where79 = at(path, 'with');
        const object80 = asObject(object78.with, where79, problems);
        if (object80) {
          expectStringArray(object80.platforms, at(where79, 'platforms'), problems);
          reportUnknownFields(object80, ['platforms'], where79, problems);
        }
        const oneOf81 = object78.answer;
        const where82 = at(path, 'answer');
        if (isPlainObject(oneOf81)) {
          if ('error' in oneOf81) {
            readApiError(oneOf81, where82, problems);
          } else if ('nextBuildIndex' in oneOf81) {
            readNextBuildInfoAnswer(oneOf81, where82, problems);
          } else {
            reportWrongShape(oneOf81, '`ApiError` or `NextBuildInfoAnswer`', where82, problems);
          }
        } else {
          reportWrongShape(oneOf81, '`ApiError` or `NextBuildInfoAnswer`', where82, problems);
        }
        reportUnknownFields(object78, ['call', 'with', 'answer'], path, problems);
      }
    } else if (oneOf1.call === 'getStagedUploadUrls') {
      const object83 = asObject(oneOf1, path, problems);
      if (object83) {
        expectLiteral(object83.call, 'getStagedUploadUrls', at(path, 'call'), problems);
        const where84 = at(path, 'with');
        const object85 = asObject(object83.with, where84, problems);
        if (object85) {
          expectStringArray(object85.platforms, at(where84, 'platforms'), problems);
          reportUnknownFields(object85, ['platforms'], where84, problems);
        }
        const oneOf86 = object83.answer;
        const where87 = at(path, 'answer');
        if (isPlainObject(oneOf86)) {
          if ('error' in oneOf86) {
            readApiError(oneOf86, where87, problems);
          } else {
            const map88 = asObject(oneOf86, where87, problems);
            if (map88) {
              reportUnknownFields(map88, [], where87, problems);
            }
          }
        } else {
          reportWrongShape(oneOf86, '`ApiError` or an object', where87, problems);
        }
        reportUnknownFields(object83, ['call', 'with', 'answer'], path, problems);
      }
    } else if (oneOf1.call === 'checkStagedGate') {
      const object89 = asObject(oneOf1, path, problems);
      if (object89) {
        expectLiteral(object89.call, 'checkStagedGate', at(path, 'call'), problems);
        const where90 = at(path, 'with');
        const object91 = asObject(object89.with, where90, problems);
        if (object91) {
          expectString(object91.platform, at(where90, 'platform'), problems);
          expectString(object91.baseFingerprint, at(where90, 'baseFingerprint'), problems);
          reportUnknownFields(object91, ['platform', 'baseFingerprint'], where90, problems);
        }
        const oneOf92 = object89.answer;
        const where93 = at(path, 'answer');
        if (isPlainObject(oneOf92)) {
          if ('outcome' in oneOf92) {
            readStagedGateAnswer(oneOf92, where93, problems);
          } else if ('error' in oneOf92) {
            readApiError(oneOf92, where93, problems);
          } else {
            reportWrongShape(oneOf92, '`StagedGateAnswer` or `ApiError`', where93, problems);
          }
        } else {
          reportWrongShape(oneOf92, '`StagedGateAnswer` or `ApiError`', where93, problems);
        }
        reportUnknownFields(object89, ['call', 'with', 'answer'], path, problems);
      }
    } else if (oneOf1.call === 'trackCliInit') {
      const object94 = asObject(oneOf1, path, problems);
      if (object94) {
        expectLiteral(object94.call, 'trackCliInit', at(path, 'call'), problems);
        const where95 = at(path, 'with');
        const object96 = asObject(object94.with, where95, problems);
        if (object96) {
          expectString(object96.event, at(where95, 'event'), problems);
          reportUnknownFields(object96, ['event'], where95, problems);
        }
        const oneOf97 = object94.answer;
        const where98 = at(path, 'answer');
        if (isPlainObject(oneOf97)) {
          if ('error' in oneOf97) {
            readApiError(oneOf97, where98, problems);
          } else if ('sessionId' in oneOf97) {
            const object99 = asObject(oneOf97, where98, problems);
            if (object99) {
              expectString(object99.sessionId, at(where98, 'sessionId'), problems);
              reportUnknownFields(object99, ['sessionId'], where98, problems);
            }
          } else {
            reportWrongShape(oneOf97, '`ApiError` or `{ sessionId: string }`', where98, problems);
          }
        } else {
          reportWrongShape(oneOf97, '`ApiError` or `{ sessionId: string }`', where98, problems);
        }
        reportUnknownFields(object94, ['call', 'with', 'answer'], path, problems);
      }
    } else if (oneOf1.call === 'startCliLogin') {
      const object100 = asObject(oneOf1, path, problems);
      if (object100) {
        expectLiteral(object100.call, 'startCliLogin', at(path, 'call'), problems);
        const where101 = at(path, 'with');
        const map102 = asObject(object100.with, where101, problems);
        if (map102) {
          reportUnknownFields(map102, [], where101, problems);
        }
        const oneOf103 = object100.answer;
        const where104 = at(path, 'answer');
        if (isPlainObject(oneOf103)) {
          if ('error' in oneOf103) {
            readApiError(oneOf103, where104, problems);
          } else if ('loginId' in oneOf103) {
            const object105 = asObject(oneOf103, where104, problems);
            if (object105) {
              expectString(object105.loginId, at(where104, 'loginId'), problems);
              expectString(object105.authorizeUrl, at(where104, 'authorizeUrl'), problems);
              expectString(object105.expiresAt, at(where104, 'expiresAt'), problems);
              reportUnknownFields(
                object105,
                ['loginId', 'authorizeUrl', 'expiresAt'],
                where104,
                problems
              );
            }
          } else {
            reportWrongShape(
              oneOf103,
              '`ApiError` or `{ loginId: string; authorizeUrl: string; expiresAt: string }`',
              where104,
              problems
            );
          }
        } else {
          reportWrongShape(
            oneOf103,
            '`ApiError` or `{ loginId: string; authorizeUrl: string; expiresAt: string }`',
            where104,
            problems
          );
        }
        reportUnknownFields(object100, ['call', 'with', 'answer'], path, problems);
      }
    } else if (oneOf1.call === 'pollCliLogin') {
      const object106 = asObject(oneOf1, path, problems);
      if (object106) {
        expectLiteral(object106.call, 'pollCliLogin', at(path, 'call'), problems);
        const where107 = at(path, 'with');
        const object108 = asObject(object106.with, where107, problems);
        if (object108) {
          expectString(object108.loginId, at(where107, 'loginId'), problems);
          reportUnknownFields(object108, ['loginId'], where107, problems);
        }
        const oneOf109 = object106.answer;
        const where110 = at(path, 'answer');
        if (isPlainObject(oneOf109)) {
          if ('error' in oneOf109) {
            readApiError(oneOf109, where110, problems);
          } else if ('email' in oneOf109) {
            const object111 = asObject(oneOf109, where110, problems);
            if (object111) {
              expectLiteral(object111.status, 'approved', at(where110, 'status'), problems);
              expectString(object111.email, at(where110, 'email'), problems);
              expectString(object111.token, at(where110, 'token'), problems);
              reportUnknownFields(object111, ['status', 'email', 'token'], where110, problems);
            }
          } else {
            const object112 = asObject(oneOf109, where110, problems);
            if (object112) {
              expectOneOf(
                object112.status,
                ['pending', 'cancelled', 'expired', 'used'],
                at(where110, 'status'),
                problems
              );
              reportUnknownFields(object112, ['status'], where110, problems);
            }
          }
        } else {
          reportWrongShape(
            oneOf109,
            "`ApiError`, `{ status: 'pending' | 'cancelled' | 'expired' | 'used' }` or `{ status: 'approved'; email: string; token: string }`",
            where110,
            problems
          );
        }
        reportUnknownFields(object106, ['call', 'with', 'answer'], path, problems);
      }
    } else if (oneOf1.call === 'logOutCli') {
      const object113 = asObject(oneOf1, path, problems);
      if (object113) {
        expectLiteral(object113.call, 'logOutCli', at(path, 'call'), problems);
        const where114 = at(path, 'with');
        const map115 = asObject(object113.with, where114, problems);
        if (map115) {
          reportUnknownFields(map115, [], where114, problems);
        }
        const oneOf116 = object113.answer;
        const where117 = at(path, 'answer');
        if (isPlainObject(oneOf116)) {
          if ('error' in oneOf116) {
            readApiError(oneOf116, where117, problems);
          } else {
            const map118 = asObject(oneOf116, where117, problems);
            if (map118) {
              reportUnknownFields(map118, [], where117, problems);
            }
          }
        } else {
          reportWrongShape(oneOf116, '`ApiError` or an object', where117, problems);
        }
        reportUnknownFields(object113, ['call', 'with', 'answer'], path, problems);
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
          'joinBuild',
          'asyncUpload',
          'closeBuild',
          'computeDiffScopeDryRun',
          'getNextBuildInfo',
          'getStagedUploadUrls',
          'checkStagedGate',
          'trackCliInit',
          'startCliLogin',
          'pollCliLogin',
          'logOutCli',
        ],
        at(path, 'call'),
        problems
      );
    }
  } else {
    reportWrongShape(
      oneOf1,
      "`{ call: 'getBuildStatus'; with: { buildIndex: number }; answer: ApiError | BuildStatusAnswer | null }`, `{ call: 'createProject'; with: { teamId: string; name: string }; answer: ApiError | { name: string; index: number; projectToken: string } }`, `{ call: 'createTeam'; with: { name: string }; answer: ApiError | { id: string; name: string } }`, `{ call: 'listTeams'; with: Record<string, never>; answer: ApiError | { teams: Array<{ id: string; name: string; projectCount: number; role: string | null }> } }`, `{ call: 'listProjects'; with: { teamId: string }; answer: ApiError | { team: { name: string; id: string }; projects: Array<{ index: number; name: string; buildCount: number; mainBranch: string | null }> } }`, `{ call: 'openBuild'; with: { platforms: string[]; pushFacts?: PushFacts }; answer: ApiError | { buildIndex: number; url: string; captureDecision?: PosedCaptureDecision; hasCiToken?: boolean } }`, `{ call: 'joinBuild'; with: { joinKey: string; platform: string; pushFacts?: PushFactsPlatform }; answer: ApiError | { buildIndex: number; waitingFor: string[]; startedRun?: StartedRun } }`, `{ call: 'asyncUpload'; with: { buildIndex: number; platform: string; pushFacts?: PushFactsPlatform }; answer: ApiError | { couldRunThisBuildRightNow: boolean; startedRun?: StartedRun } }`, `{ call: 'closeBuild'; with: { buildIndex: number; runError: string }; answer: ApiError | Record<string, never> }`, `{ call: 'computeDiffScopeDryRun'; with: { branch: string; commit: string }; answer: ApiError | DiffScopeDryRunAnswer }`, `{ call: 'getNextBuildInfo'; with: { platforms: string[] }; answer: ApiError | NextBuildInfoAnswer }`, `{ call: 'getStagedUploadUrls'; with: { platforms: string[] }; answer: ApiError | Record<string, never> }`, `{ call: 'checkStagedGate'; with: { platform: string; baseFingerprint: string }; answer: StagedGateAnswer | ApiError }`, `{ call: 'trackCliInit'; with: { event: string }; answer: ApiError | { sessionId: string } }`, `{ call: 'startCliLogin'; with: Record<string, never>; answer: ApiError | { loginId: string; authorizeUrl: string; expiresAt: string } }`, `{ call: 'pollCliLogin'; with: { loginId: string }; answer: ApiError | { status: 'pending' | 'cancelled' | 'expired' | 'used' } | { status: 'approved'; email: string; token: string } }` or `{ call: 'logOutCli'; with: Record<string, never>; answer: ApiError | Record<string, never> }`",
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

/** The shape of a `PosedAppBuild`, as `contracts/pose.contract.ts` publishes it. */
function readPosedAppBuild(value: unknown, path: string, problems: string[]): void {
  const object1 = asObject(value, path, problems);
  if (object1) {
    expectOneOf(object1.host, ['macos', 'linux'], at(path, 'host'), problems);
    const where2 = at(path, 'tools');
    const list3 = asArray(object1.tools, where2, problems);
    if (list3) {
      list3.forEach((entry4, index5) => {
        readBuildTool(entry4, atIndex(where2, index5), problems);
      });
    }
    const oneOf6 = object1.java;
    const where7 = at(path, 'java');
    if (typeof oneOf6 === 'number' || oneOf6 === null) {
      // the value is one of these
    } else {
      reportWrongShape(oneOf6, 'a number or `null`', where7, problems);
    }
    if ('iosSchemes' in object1) {
      expectStringArray(object1.iosSchemes, at(path, 'iosSchemes'), problems);
    }
    const where8 = at(path, 'platforms');
    const map9 = asObject(object1.platforms, where8, problems);
    if (map9) {
      for (const key10 of Object.keys(map9)) {
        readPosedPlatformBuild(map9[key10], atKey(where8, key10), problems);
      }
    }
    if ('nativeFolderFiles' in object1) {
      const where11 = at(path, 'nativeFolderFiles');
      const map12 = asObject(object1.nativeFolderFiles, where11, problems);
      if (map12) {
        for (const key13 of Object.keys(map12)) {
          expectString(map12[key13], atKey(where11, key13), problems);
        }
      }
    }
    reportUnknownFields(
      object1,
      ['host', 'tools', 'java', 'iosSchemes', 'platforms', 'nativeFolderFiles'],
      path,
      problems
    );
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
    if ('pods' in object1) {
      expectLiteral(object1.pods, 'installed', at(path, 'pods'), problems);
    }
    expectOneOf(object1.enter, ['pressed', 'closed', 'nobody'], at(path, 'enter'), problems);
    reportUnknownFields(object1, ['install', 'pods', 'enter'], path, problems);
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

/** The shape of a `PosedBrowser`, as `contracts/pose.contract.ts` publishes it. */
function readPosedBrowser(value: unknown, path: string, problems: string[]): void {
  const object1 = asObject(value, path, problems);
  if (object1) {
    expectBoolean(object1.opened, at(path, 'opened'), problems);
    reportUnknownFields(object1, ['opened'], path, problems);
  }
}

/** The shape of a `PosedLogins`, as `contracts/pose.contract.ts` publishes it. */
function readPosedLogins(value: unknown, path: string, problems: string[]): void {
  const map1 = asObject(value, path, problems);
  if (map1) {
    for (const key2 of Object.keys(map1)) {
      const where3 = atKey(path, key2);
      const object4 = asObject(map1[key2], where3, problems);
      if (object4) {
        expectString(object4.email, at(where3, 'email'), problems);
        expectString(object4.token, at(where3, 'token'), problems);
        reportUnknownFields(object4, ['email', 'token'], where3, problems);
      }
    }
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
    if ('stories' in object1) {
      const oneOf12 = object1.stories;
      const where13 = at(path, 'stories');
      if (oneOf12 === null) {
        // the value is one of these
      } else if (Array.isArray(oneOf12)) {
        const list14 = asArray(oneOf12, where13, problems);
        if (list14) {
          list14.forEach((entry15, index16) => {
            const where17 = atIndex(where13, index16);
            const object18 = asObject(entry15, where17, problems);
            if (object18) {
              expectString(object18.name, at(where17, 'name'), problems);
              expectString(object18.status, at(where17, 'status'), problems);
              const oneOf19 = object18.baseline;
              const where20 = at(where17, 'baseline');
              if (oneOf19 === null) {
                // the value is one of these
              } else if (isPlainObject(oneOf19)) {
                const object21 = asObject(oneOf19, where20, problems);
                if (object21) {
                  expectNumber(object21.buildIndex, at(where20, 'buildIndex'), problems);
                  reportUnknownFields(object21, ['buildIndex'], where20, problems);
                }
              } else {
                reportWrongShape(oneOf19, '`{ buildIndex: number }` or `null`', where20, problems);
              }
              if ('reason' in object18) {
                const oneOf22 = object18.reason;
                const where23 = at(where17, 'reason');
                if (typeof oneOf22 === 'string' || oneOf22 === null) {
                  // the value is one of these
                } else {
                  reportWrongShape(oneOf22, 'a string or `null`', where23, problems);
                }
              }
              if ('candidates' in object18) {
                const oneOf24 = object18.candidates;
                const where25 = at(where17, 'candidates');
                if (oneOf24 === null) {
                  // the value is one of these
                } else if (Array.isArray(oneOf24)) {
                  const list26 = asArray(oneOf24, where25, problems);
                  if (list26) {
                    list26.forEach((entry27, index28) => {
                      const where29 = atIndex(where25, index28);
                      const object30 = asObject(entry27, where29, problems);
                      if (object30) {
                        expectNumber(object30.buildIndex, at(where29, 'buildIndex'), problems);
                        reportUnknownFields(object30, ['buildIndex'], where29, problems);
                      }
                    });
                  }
                } else {
                  reportWrongShape(
                    oneOf24,
                    '`Array<{ buildIndex: number }>` or `null`',
                    where25,
                    problems
                  );
                }
              }
              reportUnknownFields(
                object18,
                ['name', 'status', 'baseline', 'reason', 'candidates'],
                where17,
                problems
              );
            }
          });
        }
      } else {
        reportWrongShape(
          oneOf12,
          '`Array<{ name: string; status: string; baseline: { buildIndex: number } | null; reason?: string | null; candidates?: Array<{ buildIndex: number }> | null }>` or `null`',
          where13,
          problems
        );
      }
    }
    if ('diffScope' in object1) {
      const where31 = at(path, 'diffScope');
      const object32 = asObject(object1.diffScope, where31, problems);
      if (object32) {
        expectString(object32.reason, at(where31, 'reason'), problems);
        expectStringArray(object32.captured, at(where31, 'captured'), problems);
        expectStringArray(object32.inherited, at(where31, 'inherited'), problems);
        const oneOf33 = object32.ancestorBuildIndex;
        const where34 = at(where31, 'ancestorBuildIndex');
        if (typeof oneOf33 === 'number' || oneOf33 === null) {
          // the value is one of these
        } else {
          reportWrongShape(oneOf33, 'a number or `null`', where34, problems);
        }
        reportUnknownFields(
          object32,
          ['reason', 'captured', 'inherited', 'ancestorBuildIndex'],
          where31,
          problems
        );
      }
    }
    if ('runErrorPlatform' in object1) {
      const oneOf35 = object1.runErrorPlatform;
      const where36 = at(path, 'runErrorPlatform');
      if (oneOf35 === 'android' || oneOf35 === 'ios' || oneOf35 === null) {
        // the value is one of these
      } else {
        reportWrongShape(oneOf35, '`"android"`, `"ios"` or `null`', where36, problems);
      }
    }
    if ('gitInfo' in object1) {
      const where37 = at(path, 'gitInfo');
      const object38 = asObject(object1.gitInfo, where37, problems);
      if (object38) {
        expectString(object38.branchName, at(where37, 'branchName'), problems);
        expectString(object38.commitHash, at(where37, 'commitHash'), problems);
        if ('isDirty' in object38) {
          const oneOf39 = object38.isDirty;
          const where40 = at(where37, 'isDirty');
          if (typeof oneOf39 === 'boolean' || oneOf39 === null) {
            // the value is one of these
          } else {
            reportWrongShape(oneOf39, 'true/false or `null`', where40, problems);
          }
        }
        reportUnknownFields(object38, ['branchName', 'commitHash', 'isDirty'], where37, problems);
      }
    }
    if ('mainBranch' in object1) {
      const oneOf41 = object1.mainBranch;
      const where42 = at(path, 'mainBranch');
      if (typeof oneOf41 === 'string' || oneOf41 === null) {
        // the value is one of these
      } else {
        reportWrongShape(oneOf41, 'a string or `null`', where42, problems);
      }
    }
    if ('ciRun' in object1) {
      const oneOf43 = object1.ciRun;
      const where44 = at(path, 'ciRun');
      if (oneOf43 === null) {
        // the value is one of these
      } else if (isPlainObject(oneOf43)) {
        const object45 = asObject(oneOf43, where44, problems);
        if (object45) {
          expectString(object45.provider, at(where44, 'provider'), problems);
          expectString(object45.runId, at(where44, 'runId'), problems);
          reportUnknownFields(object45, ['provider', 'runId'], where44, problems);
        }
      } else {
        reportWrongShape(
          oneOf43,
          '`{ provider: string; runId: string }` or `null`',
          where44,
          problems
        );
      }
    }
    if ('devices' in object1) {
      const oneOf46 = object1.devices;
      const where47 = at(path, 'devices');
      if (oneOf46 === null) {
        // the value is one of these
      } else if (Array.isArray(oneOf46)) {
        const list48 = asArray(oneOf46, where47, problems);
        if (list48) {
          list48.forEach((entry49, index50) => {
            const where51 = atIndex(where47, index50);
            const object52 = asObject(entry49, where51, problems);
            if (object52) {
              expectString(object52.id, at(where51, 'id'), problems);
              expectString(object52.osVersion, at(where51, 'osVersion'), problems);
              expectOneOf(object52.platform, ['android', 'ios'], at(where51, 'platform'), problems);
              reportUnknownFields(object52, ['id', 'osVersion', 'platform'], where51, problems);
            }
          });
        }
      } else {
        reportWrongShape(
          oneOf46,
          "`Array<{ id: string; osVersion: string; platform: 'android' | 'ios' }>` or `null`",
          where47,
          problems
        );
      }
    }
    if ('platforms' in object1) {
      const oneOf53 = object1.platforms;
      const where54 = at(path, 'platforms');
      if (oneOf53 === null) {
        // the value is one of these
      } else if (isPlainObject(oneOf53)) {
        const object55 = asObject(oneOf53, where54, problems);
        if (object55) {
          if ('android' in object55) {
            readBuildStatusPlatform(object55.android, at(where54, 'android'), problems);
          }
          if ('ios' in object55) {
            readBuildStatusPlatform(object55.ios, at(where54, 'ios'), problems);
          }
          reportUnknownFields(object55, ['android', 'ios'], where54, problems);
        }
      } else {
        reportWrongShape(
          oneOf53,
          '`{ android?: BuildStatusPlatform; ios?: BuildStatusPlatform }` or `null`',
          where54,
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
        'stories',
        'diffScope',
        'runErrorPlatform',
        'gitInfo',
        'mainBranch',
        'ciRun',
        'devices',
        'platforms',
      ],
      path,
      problems
    );
  }
}

/** The shape of a `PushFacts`, as `contracts/pose.contract.ts` publishes it. */
function readPushFacts(value: unknown, path: string, problems: string[]): void {
  const object1 = asObject(value, path, problems);
  if (object1) {
    const where2 = at(path, 'platforms');
    const object3 = asObject(object1.platforms, where2, problems);
    if (object3) {
      if ('android' in object3) {
        readPushFactsPlatform(object3.android, at(where2, 'android'), problems);
      }
      if ('ios' in object3) {
        readPushFactsPlatform(object3.ios, at(where2, 'ios'), problems);
      }
      reportUnknownFields(object3, ['android', 'ios'], where2, problems);
    }
    if ('ciRun' in object1) {
      const where4 = at(path, 'ciRun');
      const object5 = asObject(object1.ciRun, where4, problems);
      if (object5) {
        expectString(object5.provider, at(where4, 'provider'), problems);
        expectString(object5.runId, at(where4, 'runId'), problems);
        reportUnknownFields(object5, ['provider', 'runId'], where4, problems);
      }
    }
    reportUnknownFields(object1, ['platforms', 'ciRun'], path, problems);
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
    if ('capturedSnapshotCount' in object1) {
      expectNumber(object1.capturedSnapshotCount, at(path, 'capturedSnapshotCount'), problems);
    }
    if ('inheritedSnapshotCount' in object1) {
      expectNumber(object1.inheritedSnapshotCount, at(path, 'inheritedSnapshotCount'), problems);
    }
    reportUnknownFields(
      object1,
      [
        'platforms',
        'fullCaptureTriggerReason',
        'ancestorBuildIndex',
        'capturedSnapshotCount',
        'inheritedSnapshotCount',
      ],
      path,
      problems
    );
  }
}

/** The shape of a `PushFactsPlatform`, as `contracts/pose.contract.ts` publishes it. */
function readPushFactsPlatform(value: unknown, path: string, problems: string[]): void {
  const object1 = asObject(value, path, problems);
  if (object1) {
    if ('madeBy' in object1) {
      expectOneOf(
        object1.madeBy,
        ['compiled', 'build-cache', 'command', 'eas'],
        at(path, 'madeBy'),
        problems
      );
    }
    if ('why' in object1) {
      expectOneOf(object1.why, ['nothing-stored', 'native-changed'], at(path, 'why'), problems);
    }
    if ('nativeChanges' in object1) {
      expectStringArray(object1.nativeChanges, at(path, 'nativeChanges'), problems);
    }
    if ('storiesInBundle' in object1) {
      expectNumber(object1.storiesInBundle, at(path, 'storiesInBundle'), problems);
    }
    reportUnknownFields(
      object1,
      ['madeBy', 'why', 'nativeChanges', 'storiesInBundle'],
      path,
      problems
    );
  }
}

/** The shape of a `StartedRun`, as `contracts/pose.contract.ts` publishes it. */
function readStartedRun(value: unknown, path: string, problems: string[]): void {
  const object1 = asObject(value, path, problems);
  if (object1) {
    const where2 = at(path, 'devices');
    const list3 = asArray(object1.devices, where2, problems);
    if (list3) {
      list3.forEach((entry4, index5) => {
        const where6 = atIndex(where2, index5);
        const object7 = asObject(entry4, where6, problems);
        if (object7) {
          expectOneOf(
            object7.id,
            [
              'iphone.13',
              'iphone.13.mini',
              'iphone.13.pro',
              'iphone.13.pro.max',
              'iphone.14',
              'iphone.14.plus',
              'iphone.14.pro',
              'iphone.14.pro.max',
              'iphone.15',
              'iphone.15.plus',
              'iphone.15.pro',
              'iphone.15.pro.max',
              'iphone.se.3.gen',
              'ipad.9.gen',
              'ipad.10.gen',
              'ipad.air.5.gen',
              'ipad.air.11.m2',
              'ipad.air.13.m2',
              'ipad.mini.6.gen',
              'ipad.pro.11.4.gen',
              'ipad.pro.11.m4',
              'ipad.pro.12.9.6.gen',
              'ipad.pro.13.m4',
              'pixel.4',
              'pixel.4.xl',
              'pixel.4a',
              'pixel.5',
              'pixel.6',
              'pixel.6.pro',
              'pixel.6a',
              'pixel.7',
              'pixel.7.pro',
              'pixel.7a',
              'pixel.8',
              'pixel.8.pro',
              'pixel.tablet',
            ],
            at(where6, 'id'),
            problems
          );
          expectString(object7.osVersion, at(where6, 'osVersion'), problems);
          expectOneOf(object7.theme, ['light', 'dark'], at(where6, 'theme'), problems);
          expectString(object7.locale, at(where6, 'locale'), problems);
          expectString(object7.fontScale, at(where6, 'fontScale'), problems);
          reportUnknownFields(
            object7,
            ['id', 'osVersion', 'theme', 'locale', 'fontScale'],
            where6,
            problems
          );
        }
      });
    }
    const where8 = at(path, 'capture');
    const list9 = asArray(object1.capture, where8, problems);
    if (list9) {
      list9.forEach((entry10, index11) => {
        const where12 = atIndex(where8, index11);
        const object13 = asObject(entry10, where12, problems);
        if (object13) {
          expectOneOf(object13.platform, ['android', 'ios'], at(where12, 'platform'), problems);
          expectBoolean(object13.full, at(where12, 'full'), problems);
          expectNumber(object13.capturedStories, at(where12, 'capturedStories'), problems);
          if ('storiesInBundle' in object13) {
            expectNumber(object13.storiesInBundle, at(where12, 'storiesInBundle'), problems);
          }
          if ('reason' in object13) {
            expectString(object13.reason, at(where12, 'reason'), problems);
          }
          if ('storyFiles' in object13) {
            expectStringArray(object13.storyFiles, at(where12, 'storyFiles'), problems);
          }
          if ('newStoryFiles' in object13) {
            expectStringArray(object13.newStoryFiles, at(where12, 'newStoryFiles'), problems);
          }
          if ('changedStoryFiles' in object13) {
            expectStringArray(
              object13.changedStoryFiles,
              at(where12, 'changedStoryFiles'),
              problems
            );
          }
          if ('storyTitles' in object13) {
            const where14 = at(where12, 'storyTitles');
            const map15 = asObject(object13.storyTitles, where14, problems);
            if (map15) {
              for (const key16 of Object.keys(map15)) {
                const where17 = atKey(where14, key16);
                const object18 = asObject(map15[key16], where17, problems);
                if (object18) {
                  expectString(object18.title, at(where17, 'title'), problems);
                  expectNumber(object18.stories, at(where17, 'stories'), problems);
                  reportUnknownFields(object18, ['title', 'stories'], where17, problems);
                }
              }
            }
          }
          reportUnknownFields(
            object13,
            [
              'platform',
              'full',
              'capturedStories',
              'storiesInBundle',
              'reason',
              'storyFiles',
              'newStoryFiles',
              'changedStoryFiles',
              'storyTitles',
            ],
            where12,
            problems
          );
        }
      });
    }
    reportUnknownFields(object1, ['devices', 'capture'], path, problems);
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
    if ('storedBase' in object1) {
      readStoredBaseSources(object1.storedBase, at(path, 'storedBase'), problems);
    }
    if ('storedBuildIndex' in object1) {
      expectNumber(object1.storedBuildIndex, at(path, 'storedBuildIndex'), problems);
    }
    reportUnknownFields(
      object1,
      ['outcome', 'diff', 'storedBase', 'storedBuildIndex'],
      path,
      problems
    );
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

/** The shape of a `BuildTool`, as `contracts/pose.contract.ts` publishes it. */
function readBuildTool(value: unknown, path: string, problems: string[]): void {
  expectOneOf(value, ['android-sdk', 'xcode'], path, problems);
}

/** The shape of a `PosedPlatformBuild`, as `contracts/pose.contract.ts` publishes it. */
function readPosedPlatformBuild(value: unknown, path: string, problems: string[]): void {
  const oneOf1 = value;
  if (isPlainObject(oneOf1)) {
    if ('cached' in oneOf1) {
      const object2 = asObject(oneOf1, path, problems);
      if (object2) {
        expectString(object2.cached, at(path, 'cached'), problems);
        reportUnknownFields(object2, ['cached'], path, problems);
      }
    } else if ('built' in oneOf1) {
      const object3 = asObject(oneOf1, path, problems);
      if (object3) {
        expectString(object3.built, at(path, 'built'), problems);
        expectString(object3.sizeMb, at(path, 'sizeMb'), problems);
        expectNumber(object3.seconds, at(path, 'seconds'), problems);
        reportUnknownFields(object3, ['built', 'sizeMb', 'seconds'], path, problems);
      }
    } else if ('failed' in oneOf1) {
      const object4 = asObject(oneOf1, path, problems);
      if (object4) {
        const where5 = at(path, 'failed');
        const object6 = asObject(object4.failed, where5, problems);
        if (object6) {
          expectNumber(object6.seconds, at(where5, 'seconds'), problems);
          expectStringArray(object6.lastLines, at(where5, 'lastLines'), problems);
          reportUnknownFields(object6, ['seconds', 'lastLines'], where5, problems);
        }
        reportUnknownFields(object4, ['failed'], path, problems);
      }
    } else if ('easBuild' in oneOf1) {
      const object7 = asObject(oneOf1, path, problems);
      if (object7) {
        expectString(object7.easBuild, at(path, 'easBuild'), problems);
        reportUnknownFields(object7, ['easBuild'], path, problems);
      }
    } else {
      reportWrongShape(
        oneOf1,
        '`{ cached: string }`, `{ built: string; sizeMb: string; seconds: number }`, `{ failed: { seconds: number; lastLines: string[] } }` or `{ easBuild: string }`',
        path,
        problems
      );
    }
  } else {
    reportWrongShape(
      oneOf1,
      '`{ cached: string }`, `{ built: string; sizeMb: string; seconds: number }`, `{ failed: { seconds: number; lastLines: string[] } }` or `{ easBuild: string }`',
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

/** The shape of a `BuildStatusPlatform`, as `contracts/pose.contract.ts` publishes it. */
function readBuildStatusPlatform(value: unknown, path: string, problems: string[]): void {
  const object1 = asObject(value, path, problems);
  if (object1) {
    expectBoolean(object1.arrived, at(path, 'arrived'), problems);
    if ('capture' in object1) {
      const oneOf2 = object1.capture;
      const where3 = at(path, 'capture');
      if (oneOf2 === null) {
        // the value is one of these
      } else if (isPlainObject(oneOf2)) {
        const object4 = asObject(oneOf2, where3, problems);
        if (object4) {
          expectBoolean(object4.full, at(where3, 'full'), problems);
          const oneOf5 = object4.reason;
          const where6 = at(where3, 'reason');
          if (typeof oneOf5 === 'string' || oneOf5 === null) {
            // the value is one of these
          } else {
            reportWrongShape(oneOf5, 'a string or `null`', where6, problems);
          }
          expectStringArray(object4.storyFiles, at(where3, 'storyFiles'), problems);
          reportUnknownFields(object4, ['full', 'reason', 'storyFiles'], where3, problems);
        }
      } else {
        reportWrongShape(
          oneOf2,
          '`{ full: boolean; reason: string | null; storyFiles: string[] }` or `null`',
          where3,
          problems
        );
      }
    }
    if ('appBuild' in object1) {
      const oneOf7 = object1.appBuild;
      const where8 = at(path, 'appBuild');
      if (oneOf7 === null) {
        // the value is one of these
      } else if (isPlainObject(oneOf7)) {
        const object9 = asObject(oneOf7, where8, problems);
        if (object9) {
          expectOneOf(object9.from, ['uploaded', 'stored'], at(where8, 'from'), problems);
          if ('storedFromTest' in object9) {
            const oneOf10 = object9.storedFromTest;
            const where11 = at(where8, 'storedFromTest');
            if (typeof oneOf10 === 'number' || oneOf10 === null) {
              // the value is one of these
            } else {
              reportWrongShape(oneOf10, 'a number or `null`', where11, problems);
            }
          }
          if ('madeBy' in object9) {
            const oneOf12 = object9.madeBy;
            const where13 = at(where8, 'madeBy');
            if (
              oneOf12 === 'compiled' ||
              oneOf12 === 'build-cache' ||
              oneOf12 === 'command' ||
              oneOf12 === 'eas' ||
              oneOf12 === null
            ) {
              // the value is one of these
            } else {
              reportWrongShape(
                oneOf12,
                '`"compiled"`, `"build-cache"`, `"command"`, `"eas"` or `null`',
                where13,
                problems
              );
            }
          }
          if ('why' in object9) {
            const oneOf14 = object9.why;
            const where15 = at(where8, 'why');
            if (oneOf14 === 'nothing-stored' || oneOf14 === 'native-changed' || oneOf14 === null) {
              // the value is one of these
            } else {
              reportWrongShape(
                oneOf14,
                '`"nothing-stored"`, `"native-changed"` or `null`',
                where15,
                problems
              );
            }
          }
          if ('nativeChanges' in object9) {
            const oneOf16 = object9.nativeChanges;
            const where17 = at(where8, 'nativeChanges');
            if (oneOf16 === null) {
              // the value is one of these
            } else if (Array.isArray(oneOf16)) {
              expectStringArray(oneOf16, where17, problems);
            } else {
              reportWrongShape(oneOf16, 'an array of strings or `null`', where17, problems);
            }
          }
          reportUnknownFields(
            object9,
            ['from', 'storedFromTest', 'madeBy', 'why', 'nativeChanges'],
            where8,
            problems
          );
        }
      } else {
        reportWrongShape(
          oneOf7,
          "`{ from: 'uploaded' | 'stored'; storedFromTest?: number | null; madeBy?: 'compiled' | 'build-cache' | 'command' | 'eas' | null; why?: 'nothing-stored' | 'native-changed' | null; nativeChanges?: string[] | null }` or `null`",
          where8,
          problems
        );
      }
    }
    if ('storiesInBundle' in object1) {
      const oneOf18 = object1.storiesInBundle;
      const where19 = at(path, 'storiesInBundle');
      if (typeof oneOf18 === 'number' || oneOf18 === null) {
        // the value is one of these
      } else {
        reportWrongShape(oneOf18, 'a number or `null`', where19, problems);
      }
    }
    reportUnknownFields(
      object1,
      ['arrived', 'capture', 'appBuild', 'storiesInBundle'],
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
    if ('newStoryFilePaths' in object1) {
      expectStringArray(object1.newStoryFilePaths, at(path, 'newStoryFilePaths'), problems);
    }
    if ('changedStoryFilePaths' in object1) {
      expectStringArray(object1.changedStoryFilePaths, at(path, 'changedStoryFilePaths'), problems);
    }
    reportUnknownFields(
      object1,
      ['full', 'storyFilePaths', 'reason', 'newStoryFilePaths', 'changedStoryFilePaths'],
      path,
      problems
    );
  }
}

/** The shape of a `StoredBaseSources`, as `contracts/pose.contract.ts` publishes it. */
function readStoredBaseSources(value: unknown, path: string, problems: string[]): void {
  const object1 = asObject(value, path, problems);
  if (object1) {
    expectNumber(object1.buildIndex, at(path, 'buildIndex'), problems);
    const where2 = at(path, 'sources');
    const list3 = asArray(object1.sources, where2, problems);
    if (list3) {
      list3.forEach((entry4, index5) => {
        readStoredBaseSource(entry4, atIndex(where2, index5), problems);
      });
    }
    const where6 = at(path, 'modules');
    const list7 = asArray(object1.modules, where6, problems);
    if (list7) {
      list7.forEach((entry8, index9) => {
        const where10 = atIndex(where6, index9);
        const object11 = asObject(entry8, where10, problems);
        if (object11) {
          expectString(object11.name, at(where10, 'name'), problems);
          expectString(object11.version, at(where10, 'version'), problems);
          reportUnknownFields(object11, ['name', 'version'], where10, problems);
        }
      });
    }
    reportUnknownFields(object1, ['buildIndex', 'sources', 'modules'], path, problems);
  }
}

/** The shape of a `StoredBaseSource`, as `contracts/pose.contract.ts` publishes it. */
function readStoredBaseSource(value: unknown, path: string, problems: string[]): void {
  const object1 = asObject(value, path, problems);
  if (object1) {
    expectString(object1.path, at(path, 'path'), problems);
    const oneOf2 = object1.hash;
    const where3 = at(path, 'hash');
    if (typeof oneOf2 === 'string' || oneOf2 === null) {
      // the value is one of these
    } else {
      reportWrongShape(oneOf2, 'a string or `null`', where3, problems);
    }
    expectOneOf(object1.kind, ['file', 'dir', 'contents'], at(path, 'kind'), problems);
    if ('files' in object1) {
      const where4 = at(path, 'files');
      const list5 = asArray(object1.files, where4, problems);
      if (list5) {
        list5.forEach((entry6, index7) => {
          readNativeFolderFile(entry6, atIndex(where4, index7), problems);
        });
      }
    }
    reportUnknownFields(object1, ['path', 'hash', 'kind', 'files'], path, problems);
  }
}

/** The shape of a `NativeFolderFile`, as `contracts/pose.contract.ts` publishes it. */
function readNativeFolderFile(value: unknown, path: string, problems: string[]): void {
  const object1 = asObject(value, path, problems);
  if (object1) {
    expectString(object1.path, at(path, 'path'), problems);
    expectString(object1.hash, at(path, 'hash'), problems);
    reportUnknownFields(object1, ['path', 'hash'], path, problems);
  }
}
