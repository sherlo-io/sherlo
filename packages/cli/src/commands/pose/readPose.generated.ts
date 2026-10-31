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
    if ('coverage' in object1) {
      readPosedCoverage(object1.coverage, at(path, 'coverage'), problems);
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
        'coverage',
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
      if ('historyFetchRefused' in object2) {
        expectString(object2.historyFetchRefused, at(path, 'historyFetchRefused'), problems);
      }
      if ('remote' in object2) {
        expectString(object2.remote, at(path, 'remote'), problems);
      }
      reportUnknownFields(
        object2,
        ['branch', 'commit', 'dirty', 'historyFetchRefused', 'remote'],
        path,
        problems
      );
    }
  } else {
    reportWrongShape(
      oneOf1,
      '`"none"`, `"unavailable"` or `{ branch: string; commit: string; dirty: boolean; historyFetchRefused?: string; remote?: string }`',
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
          expectString(map5[key6], atKey(where4, key6), problems);
        }
      }
    }
    if ('storyCounts' in object1) {
      const where7 = at(path, 'storyCounts');
      const map8 = asObject(object1.storyCounts, where7, problems);
      if (map8) {
        for (const key9 of Object.keys(map8)) {
          expectNumber(map8[key9], atKey(where7, key9), problems);
        }
      }
    }
    if ('sceneIds' in object1) {
      expectStringArray(object1.sceneIds, at(path, 'sceneIds'), problems);
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
        'storyCounts',
        'sceneIds',
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
    } else if (oneOf1.call === 'whoAmI') {
      const object33 = asObject(oneOf1, path, problems);
      if (object33) {
        expectLiteral(object33.call, 'whoAmI', at(path, 'call'), problems);
        const where34 = at(path, 'with');
        const map35 = asObject(object33.with, where34, problems);
        if (map35) {
          reportUnknownFields(map35, [], where34, problems);
        }
        const oneOf36 = object33.answer;
        const where37 = at(path, 'answer');
        if (isPlainObject(oneOf36)) {
          if ('error' in oneOf36) {
            readApiError(oneOf36, where37, problems);
          } else if ('name' in oneOf36) {
            const object38 = asObject(oneOf36, where37, problems);
            if (object38) {
              expectString(object38.name, at(where37, 'name'), problems);
              expectString(object38.email, at(where37, 'email'), problems);
              reportUnknownFields(object38, ['name', 'email'], where37, problems);
            }
          } else {
            reportWrongShape(
              oneOf36,
              '`ApiError` or `{ name: string; email: string }`',
              where37,
              problems
            );
          }
        } else {
          reportWrongShape(
            oneOf36,
            '`ApiError` or `{ name: string; email: string }`',
            where37,
            problems
          );
        }
        reportUnknownFields(object33, ['call', 'with', 'answer'], path, problems);
      }
    } else if (oneOf1.call === 'listProjects') {
      const object39 = asObject(oneOf1, path, problems);
      if (object39) {
        expectLiteral(object39.call, 'listProjects', at(path, 'call'), problems);
        const where40 = at(path, 'with');
        const object41 = asObject(object39.with, where40, problems);
        if (object41) {
          expectString(object41.teamId, at(where40, 'teamId'), problems);
          reportUnknownFields(object41, ['teamId'], where40, problems);
        }
        const oneOf42 = object39.answer;
        const where43 = at(path, 'answer');
        if (isPlainObject(oneOf42)) {
          if ('error' in oneOf42) {
            readApiError(oneOf42, where43, problems);
          } else if ('team' in oneOf42) {
            const object44 = asObject(oneOf42, where43, problems);
            if (object44) {
              const where45 = at(where43, 'team');
              const object46 = asObject(object44.team, where45, problems);
              if (object46) {
                expectString(object46.name, at(where45, 'name'), problems);
                expectString(object46.id, at(where45, 'id'), problems);
                reportUnknownFields(object46, ['name', 'id'], where45, problems);
              }
              const where47 = at(where43, 'projects');
              const list48 = asArray(object44.projects, where47, problems);
              if (list48) {
                list48.forEach((entry49, index50) => {
                  const where51 = atIndex(where47, index50);
                  const object52 = asObject(entry49, where51, problems);
                  if (object52) {
                    expectNumber(object52.index, at(where51, 'index'), problems);
                    expectString(object52.name, at(where51, 'name'), problems);
                    expectNumber(object52.buildCount, at(where51, 'buildCount'), problems);
                    const oneOf53 = object52.mainBranch;
                    const where54 = at(where51, 'mainBranch');
                    if (typeof oneOf53 === 'string' || oneOf53 === null) {
                      // the value is one of these
                    } else {
                      reportWrongShape(oneOf53, 'a string or `null`', where54, problems);
                    }
                    reportUnknownFields(
                      object52,
                      ['index', 'name', 'buildCount', 'mainBranch'],
                      where51,
                      problems
                    );
                  }
                });
              }
              reportUnknownFields(object44, ['team', 'projects'], where43, problems);
            }
          } else {
            reportWrongShape(
              oneOf42,
              '`ApiError` or `{ team: { name: string; id: string }; projects: Array<{ index: number; name: string; buildCount: number; mainBranch: string | null }> }`',
              where43,
              problems
            );
          }
        } else {
          reportWrongShape(
            oneOf42,
            '`ApiError` or `{ team: { name: string; id: string }; projects: Array<{ index: number; name: string; buildCount: number; mainBranch: string | null }> }`',
            where43,
            problems
          );
        }
        reportUnknownFields(object39, ['call', 'with', 'answer'], path, problems);
      }
    } else if (oneOf1.call === 'openBuild') {
      const object55 = asObject(oneOf1, path, problems);
      if (object55) {
        expectLiteral(object55.call, 'openBuild', at(path, 'call'), problems);
        const where56 = at(path, 'with');
        const object57 = asObject(object55.with, where56, problems);
        if (object57) {
          expectStringArray(object57.platforms, at(where56, 'platforms'), problems);
          if ('pushFacts' in object57) {
            readPushFacts(object57.pushFacts, at(where56, 'pushFacts'), problems);
          }
          reportUnknownFields(object57, ['platforms', 'pushFacts'], where56, problems);
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
              expectString(object60.url, at(where59, 'url'), problems);
              if ('captureDecision' in object60) {
                readPosedCaptureDecision(
                  object60.captureDecision,
                  at(where59, 'captureDecision'),
                  problems
                );
              }
              if ('hasCiToken' in object60) {
                expectBoolean(object60.hasCiToken, at(where59, 'hasCiToken'), problems);
              }
              if ('buildTicket' in object60) {
                expectString(object60.buildTicket, at(where59, 'buildTicket'), problems);
              }
              reportUnknownFields(
                object60,
                ['buildIndex', 'url', 'captureDecision', 'hasCiToken', 'buildTicket'],
                where59,
                problems
              );
            }
          } else {
            reportWrongShape(
              oneOf58,
              '`ApiError` or `{ buildIndex: number; url: string; captureDecision?: PosedCaptureDecision; hasCiToken?: boolean; buildTicket?: string }`',
              where59,
              problems
            );
          }
        } else {
          reportWrongShape(
            oneOf58,
            '`ApiError` or `{ buildIndex: number; url: string; captureDecision?: PosedCaptureDecision; hasCiToken?: boolean; buildTicket?: string }`',
            where59,
            problems
          );
        }
        reportUnknownFields(object55, ['call', 'with', 'answer'], path, problems);
      }
    } else if (oneOf1.call === 'joinBuild') {
      const object61 = asObject(oneOf1, path, problems);
      if (object61) {
        expectLiteral(object61.call, 'joinBuild', at(path, 'call'), problems);
        const where62 = at(path, 'with');
        const object63 = asObject(object61.with, where62, problems);
        if (object63) {
          expectString(object63.joinKey, at(where62, 'joinKey'), problems);
          expectString(object63.platform, at(where62, 'platform'), problems);
          if ('pushFacts' in object63) {
            readPushFactsPlatform(object63.pushFacts, at(where62, 'pushFacts'), problems);
          }
          reportUnknownFields(object63, ['joinKey', 'platform', 'pushFacts'], where62, problems);
        }
        const oneOf64 = object61.answer;
        const where65 = at(path, 'answer');
        if (isPlainObject(oneOf64)) {
          if ('error' in oneOf64) {
            readApiError(oneOf64, where65, problems);
          } else if ('buildIndex' in oneOf64) {
            const object66 = asObject(oneOf64, where65, problems);
            if (object66) {
              expectNumber(object66.buildIndex, at(where65, 'buildIndex'), problems);
              expectStringArray(object66.waitingFor, at(where65, 'waitingFor'), problems);
              if ('startedRun' in object66) {
                readStartedRun(object66.startedRun, at(where65, 'startedRun'), problems);
              }
              reportUnknownFields(
                object66,
                ['buildIndex', 'waitingFor', 'startedRun'],
                where65,
                problems
              );
            }
          } else {
            reportWrongShape(
              oneOf64,
              '`ApiError` or `{ buildIndex: number; waitingFor: string[]; startedRun?: StartedRun }`',
              where65,
              problems
            );
          }
        } else {
          reportWrongShape(
            oneOf64,
            '`ApiError` or `{ buildIndex: number; waitingFor: string[]; startedRun?: StartedRun }`',
            where65,
            problems
          );
        }
        reportUnknownFields(object61, ['call', 'with', 'answer'], path, problems);
      }
    } else if (oneOf1.call === 'asyncUpload') {
      const object67 = asObject(oneOf1, path, problems);
      if (object67) {
        expectLiteral(object67.call, 'asyncUpload', at(path, 'call'), problems);
        const where68 = at(path, 'with');
        const object69 = asObject(object67.with, where68, problems);
        if (object69) {
          expectNumber(object69.buildIndex, at(where68, 'buildIndex'), problems);
          expectString(object69.platform, at(where68, 'platform'), problems);
          if ('pushFacts' in object69) {
            readPushFactsPlatform(object69.pushFacts, at(where68, 'pushFacts'), problems);
          }
          reportUnknownFields(object69, ['buildIndex', 'platform', 'pushFacts'], where68, problems);
        }
        const oneOf70 = object67.answer;
        const where71 = at(path, 'answer');
        if (isPlainObject(oneOf70)) {
          if ('error' in oneOf70) {
            readApiError(oneOf70, where71, problems);
          } else if ('couldRunThisBuildRightNow' in oneOf70) {
            const object72 = asObject(oneOf70, where71, problems);
            if (object72) {
              expectBoolean(
                object72.couldRunThisBuildRightNow,
                at(where71, 'couldRunThisBuildRightNow'),
                problems
              );
              if ('startedRun' in object72) {
                readStartedRun(object72.startedRun, at(where71, 'startedRun'), problems);
              }
              reportUnknownFields(
                object72,
                ['couldRunThisBuildRightNow', 'startedRun'],
                where71,
                problems
              );
            }
          } else {
            reportWrongShape(
              oneOf70,
              '`ApiError` or `{ couldRunThisBuildRightNow: boolean; startedRun?: StartedRun }`',
              where71,
              problems
            );
          }
        } else {
          reportWrongShape(
            oneOf70,
            '`ApiError` or `{ couldRunThisBuildRightNow: boolean; startedRun?: StartedRun }`',
            where71,
            problems
          );
        }
        reportUnknownFields(object67, ['call', 'with', 'answer'], path, problems);
      }
    } else if (oneOf1.call === 'closeBuild') {
      const object73 = asObject(oneOf1, path, problems);
      if (object73) {
        expectLiteral(object73.call, 'closeBuild', at(path, 'call'), problems);
        const where74 = at(path, 'with');
        const object75 = asObject(object73.with, where74, problems);
        if (object75) {
          expectNumber(object75.buildIndex, at(where74, 'buildIndex'), problems);
          expectString(object75.runError, at(where74, 'runError'), problems);
          reportUnknownFields(object75, ['buildIndex', 'runError'], where74, problems);
        }
        const oneOf76 = object73.answer;
        const where77 = at(path, 'answer');
        if (isPlainObject(oneOf76)) {
          if ('error' in oneOf76) {
            readApiError(oneOf76, where77, problems);
          } else {
            const map78 = asObject(oneOf76, where77, problems);
            if (map78) {
              reportUnknownFields(map78, [], where77, problems);
            }
          }
        } else {
          reportWrongShape(oneOf76, '`ApiError` or an object', where77, problems);
        }
        reportUnknownFields(object73, ['call', 'with', 'answer'], path, problems);
      }
    } else if (oneOf1.call === 'getNextBuildInfo') {
      const object79 = asObject(oneOf1, path, problems);
      if (object79) {
        expectLiteral(object79.call, 'getNextBuildInfo', at(path, 'call'), problems);
        const where80 = at(path, 'with');
        const object81 = asObject(object79.with, where80, problems);
        if (object81) {
          expectStringArray(object81.platforms, at(where80, 'platforms'), problems);
          reportUnknownFields(object81, ['platforms'], where80, problems);
        }
        const oneOf82 = object79.answer;
        const where83 = at(path, 'answer');
        if (isPlainObject(oneOf82)) {
          if ('error' in oneOf82) {
            readApiError(oneOf82, where83, problems);
          } else if ('nextBuildIndex' in oneOf82) {
            readNextBuildInfoAnswer(oneOf82, where83, problems);
          } else {
            reportWrongShape(oneOf82, '`ApiError` or `NextBuildInfoAnswer`', where83, problems);
          }
        } else {
          reportWrongShape(oneOf82, '`ApiError` or `NextBuildInfoAnswer`', where83, problems);
        }
        reportUnknownFields(object79, ['call', 'with', 'answer'], path, problems);
      }
    } else if (oneOf1.call === 'getStagedUploadUrls') {
      const object84 = asObject(oneOf1, path, problems);
      if (object84) {
        expectLiteral(object84.call, 'getStagedUploadUrls', at(path, 'call'), problems);
        const where85 = at(path, 'with');
        const object86 = asObject(object84.with, where85, problems);
        if (object86) {
          expectStringArray(object86.platforms, at(where85, 'platforms'), problems);
          reportUnknownFields(object86, ['platforms'], where85, problems);
        }
        const oneOf87 = object84.answer;
        const where88 = at(path, 'answer');
        if (isPlainObject(oneOf87)) {
          if ('error' in oneOf87) {
            readApiError(oneOf87, where88, problems);
          } else {
            const map89 = asObject(oneOf87, where88, problems);
            if (map89) {
              reportUnknownFields(map89, [], where88, problems);
            }
          }
        } else {
          reportWrongShape(oneOf87, '`ApiError` or an object', where88, problems);
        }
        reportUnknownFields(object84, ['call', 'with', 'answer'], path, problems);
      }
    } else if (oneOf1.call === 'checkStagedGate') {
      const object90 = asObject(oneOf1, path, problems);
      if (object90) {
        expectLiteral(object90.call, 'checkStagedGate', at(path, 'call'), problems);
        const where91 = at(path, 'with');
        const object92 = asObject(object90.with, where91, problems);
        if (object92) {
          expectString(object92.platform, at(where91, 'platform'), problems);
          expectString(object92.baseFingerprint, at(where91, 'baseFingerprint'), problems);
          reportUnknownFields(object92, ['platform', 'baseFingerprint'], where91, problems);
        }
        const oneOf93 = object90.answer;
        const where94 = at(path, 'answer');
        if (isPlainObject(oneOf93)) {
          if ('error' in oneOf93) {
            readApiError(oneOf93, where94, problems);
          } else if ('outcome' in oneOf93) {
            readStagedGateAnswer(oneOf93, where94, problems);
          } else {
            reportWrongShape(oneOf93, '`ApiError` or `StagedGateAnswer`', where94, problems);
          }
        } else {
          reportWrongShape(oneOf93, '`ApiError` or `StagedGateAnswer`', where94, problems);
        }
        reportUnknownFields(object90, ['call', 'with', 'answer'], path, problems);
      }
    } else if (oneOf1.call === 'trackCliInit') {
      const object95 = asObject(oneOf1, path, problems);
      if (object95) {
        expectLiteral(object95.call, 'trackCliInit', at(path, 'call'), problems);
        const where96 = at(path, 'with');
        const object97 = asObject(object95.with, where96, problems);
        if (object97) {
          expectString(object97.event, at(where96, 'event'), problems);
          reportUnknownFields(object97, ['event'], where96, problems);
        }
        const oneOf98 = object95.answer;
        const where99 = at(path, 'answer');
        if (isPlainObject(oneOf98)) {
          if ('error' in oneOf98) {
            readApiError(oneOf98, where99, problems);
          } else if ('sessionId' in oneOf98) {
            const object100 = asObject(oneOf98, where99, problems);
            if (object100) {
              expectString(object100.sessionId, at(where99, 'sessionId'), problems);
              reportUnknownFields(object100, ['sessionId'], where99, problems);
            }
          } else {
            reportWrongShape(oneOf98, '`ApiError` or `{ sessionId: string }`', where99, problems);
          }
        } else {
          reportWrongShape(oneOf98, '`ApiError` or `{ sessionId: string }`', where99, problems);
        }
        reportUnknownFields(object95, ['call', 'with', 'answer'], path, problems);
      }
    } else if (oneOf1.call === 'startCliLogin') {
      const object101 = asObject(oneOf1, path, problems);
      if (object101) {
        expectLiteral(object101.call, 'startCliLogin', at(path, 'call'), problems);
        const where102 = at(path, 'with');
        const map103 = asObject(object101.with, where102, problems);
        if (map103) {
          reportUnknownFields(map103, [], where102, problems);
        }
        const oneOf104 = object101.answer;
        const where105 = at(path, 'answer');
        if (isPlainObject(oneOf104)) {
          if ('error' in oneOf104) {
            readApiError(oneOf104, where105, problems);
          } else if ('loginId' in oneOf104) {
            const object106 = asObject(oneOf104, where105, problems);
            if (object106) {
              expectString(object106.loginId, at(where105, 'loginId'), problems);
              expectString(object106.authorizeUrl, at(where105, 'authorizeUrl'), problems);
              expectString(object106.expiresAt, at(where105, 'expiresAt'), problems);
              reportUnknownFields(
                object106,
                ['loginId', 'authorizeUrl', 'expiresAt'],
                where105,
                problems
              );
            }
          } else {
            reportWrongShape(
              oneOf104,
              '`ApiError` or `{ loginId: string; authorizeUrl: string; expiresAt: string }`',
              where105,
              problems
            );
          }
        } else {
          reportWrongShape(
            oneOf104,
            '`ApiError` or `{ loginId: string; authorizeUrl: string; expiresAt: string }`',
            where105,
            problems
          );
        }
        reportUnknownFields(object101, ['call', 'with', 'answer'], path, problems);
      }
    } else if (oneOf1.call === 'pollCliLogin') {
      const object107 = asObject(oneOf1, path, problems);
      if (object107) {
        expectLiteral(object107.call, 'pollCliLogin', at(path, 'call'), problems);
        const where108 = at(path, 'with');
        const object109 = asObject(object107.with, where108, problems);
        if (object109) {
          expectString(object109.loginId, at(where108, 'loginId'), problems);
          reportUnknownFields(object109, ['loginId'], where108, problems);
        }
        const oneOf110 = object107.answer;
        const where111 = at(path, 'answer');
        if (isPlainObject(oneOf110)) {
          if ('error' in oneOf110) {
            readApiError(oneOf110, where111, problems);
          } else if ('email' in oneOf110) {
            const object112 = asObject(oneOf110, where111, problems);
            if (object112) {
              expectLiteral(object112.status, 'approved', at(where111, 'status'), problems);
              expectString(object112.email, at(where111, 'email'), problems);
              expectString(object112.token, at(where111, 'token'), problems);
              reportUnknownFields(object112, ['status', 'email', 'token'], where111, problems);
            }
          } else {
            const object113 = asObject(oneOf110, where111, problems);
            if (object113) {
              expectOneOf(
                object113.status,
                ['pending', 'cancelled', 'expired', 'used'],
                at(where111, 'status'),
                problems
              );
              reportUnknownFields(object113, ['status'], where111, problems);
            }
          }
        } else {
          reportWrongShape(
            oneOf110,
            "`ApiError`, `{ status: 'pending' | 'cancelled' | 'expired' | 'used' }` or `{ status: 'approved'; email: string; token: string }`",
            where111,
            problems
          );
        }
        reportUnknownFields(object107, ['call', 'with', 'answer'], path, problems);
      }
    } else if (oneOf1.call === 'logOutCli') {
      const object114 = asObject(oneOf1, path, problems);
      if (object114) {
        expectLiteral(object114.call, 'logOutCli', at(path, 'call'), problems);
        const where115 = at(path, 'with');
        const map116 = asObject(object114.with, where115, problems);
        if (map116) {
          reportUnknownFields(map116, [], where115, problems);
        }
        const oneOf117 = object114.answer;
        const where118 = at(path, 'answer');
        if (isPlainObject(oneOf117)) {
          if ('error' in oneOf117) {
            readApiError(oneOf117, where118, problems);
          } else {
            const map119 = asObject(oneOf117, where118, problems);
            if (map119) {
              reportUnknownFields(map119, [], where118, problems);
            }
          }
        } else {
          reportWrongShape(oneOf117, '`ApiError` or an object', where118, problems);
        }
        reportUnknownFields(object114, ['call', 'with', 'answer'], path, problems);
      }
    } else if (oneOf1.call === 'sendFeedback') {
      const object120 = asObject(oneOf1, path, problems);
      if (object120) {
        expectLiteral(object120.call, 'sendFeedback', at(path, 'call'), problems);
        const where121 = at(path, 'with');
        const object122 = asObject(object120.with, where121, problems);
        if (object122) {
          expectOneOf(
            object122.kind,
            ['bug', 'missing', 'unclear', 'other'],
            at(where121, 'kind'),
            problems
          );
          expectString(object122.report, at(where121, 'report'), problems);
          reportUnknownFields(object122, ['kind', 'report'], where121, problems);
        }
        const oneOf123 = object120.answer;
        const where124 = at(path, 'answer');
        if (isPlainObject(oneOf123)) {
          if ('error' in oneOf123) {
            readApiError(oneOf123, where124, problems);
          } else if ('reference' in oneOf123) {
            const object125 = asObject(oneOf123, where124, problems);
            if (object125) {
              expectString(object125.reference, at(where124, 'reference'), problems);
              reportUnknownFields(object125, ['reference'], where124, problems);
            }
          } else {
            reportWrongShape(oneOf123, '`ApiError` or `{ reference: string }`', where124, problems);
          }
        } else {
          reportWrongShape(oneOf123, '`ApiError` or `{ reference: string }`', where124, problems);
        }
        reportUnknownFields(object120, ['call', 'with', 'answer'], path, problems);
      }
    } else if (oneOf1.call === 'tradeGitHubIdToken') {
      const object126 = asObject(oneOf1, path, problems);
      if (object126) {
        expectLiteral(object126.call, 'tradeGitHubIdToken', at(path, 'call'), problems);
        const where127 = at(path, 'with');
        const object128 = asObject(object126.with, where127, problems);
        if (object128) {
          expectString(object128.repository, at(where127, 'repository'), problems);
          expectString(object128.teamId, at(where127, 'teamId'), problems);
          reportUnknownFields(object128, ['repository', 'teamId'], where127, problems);
        }
        const oneOf129 = object126.answer;
        const where130 = at(path, 'answer');
        if (isPlainObject(oneOf129)) {
          if ('error' in oneOf129) {
            readApiError(oneOf129, where130, problems);
          } else if ('token' in oneOf129) {
            const object131 = asObject(oneOf129, where130, problems);
            if (object131) {
              expectLiteral(object131.status, 'signed-in', at(where130, 'status'), problems);
              expectString(object131.token, at(where130, 'token'), problems);
              reportUnknownFields(object131, ['status', 'token'], where130, problems);
            }
          } else if ('teamName' in oneOf129) {
            const object132 = asObject(oneOf129, where130, problems);
            if (object132) {
              expectLiteral(object132.status, 'not-connected', at(where130, 'status'), problems);
              expectString(object132.teamName, at(where130, 'teamName'), problems);
              reportUnknownFields(object132, ['status', 'teamName'], where130, problems);
            }
          } else {
            reportWrongShape(
              oneOf129,
              "`ApiError`, `{ status: 'signed-in'; token: string }` or `{ status: 'not-connected'; teamName: string }`",
              where130,
              problems
            );
          }
        } else {
          reportWrongShape(
            oneOf129,
            "`ApiError`, `{ status: 'signed-in'; token: string }` or `{ status: 'not-connected'; teamName: string }`",
            where130,
            problems
          );
        }
        reportUnknownFields(object126, ['call', 'with', 'answer'], path, problems);
      }
    } else {
      reportUnknownName(
        oneOf1.call,
        [
          'getBuildStatus',
          'createProject',
          'createTeam',
          'listTeams',
          'whoAmI',
          'listProjects',
          'openBuild',
          'joinBuild',
          'asyncUpload',
          'closeBuild',
          'getNextBuildInfo',
          'getStagedUploadUrls',
          'checkStagedGate',
          'trackCliInit',
          'startCliLogin',
          'pollCliLogin',
          'logOutCli',
          'sendFeedback',
          'tradeGitHubIdToken',
        ],
        at(path, 'call'),
        problems
      );
    }
  } else {
    reportWrongShape(
      oneOf1,
      "`{ call: 'getBuildStatus'; with: { buildIndex: number }; answer: ApiError | BuildStatusAnswer | null }`, `{ call: 'createProject'; with: { teamId: string; name: string }; answer: ApiError | { name: string; index: number; projectToken: string } }`, `{ call: 'createTeam'; with: { name: string }; answer: ApiError | { id: string; name: string } }`, `{ call: 'listTeams'; with: Record<string, never>; answer: ApiError | { teams: Array<{ id: string; name: string; projectCount: number; role: string | null }> } }`, `{ call: 'whoAmI'; with: Record<string, never>; answer: ApiError | { name: string; email: string } }`, `{ call: 'listProjects'; with: { teamId: string }; answer: ApiError | { team: { name: string; id: string }; projects: Array<{ index: number; name: string; buildCount: number; mainBranch: string | null }> } }`, `{ call: 'openBuild'; with: { platforms: string[]; pushFacts?: PushFacts }; answer: ApiError | { buildIndex: number; url: string; captureDecision?: PosedCaptureDecision; hasCiToken?: boolean; buildTicket?: string } }`, `{ call: 'joinBuild'; with: { joinKey: string; platform: string; pushFacts?: PushFactsPlatform }; answer: ApiError | { buildIndex: number; waitingFor: string[]; startedRun?: StartedRun } }`, `{ call: 'asyncUpload'; with: { buildIndex: number; platform: string; pushFacts?: PushFactsPlatform }; answer: ApiError | { couldRunThisBuildRightNow: boolean; startedRun?: StartedRun } }`, `{ call: 'closeBuild'; with: { buildIndex: number; runError: string }; answer: ApiError | Record<string, never> }`, `{ call: 'getNextBuildInfo'; with: { platforms: string[] }; answer: ApiError | NextBuildInfoAnswer }`, `{ call: 'getStagedUploadUrls'; with: { platforms: string[] }; answer: ApiError | Record<string, never> }`, `{ call: 'checkStagedGate'; with: { platform: string; baseFingerprint: string }; answer: ApiError | StagedGateAnswer }`, `{ call: 'trackCliInit'; with: { event: string }; answer: ApiError | { sessionId: string } }`, `{ call: 'startCliLogin'; with: Record<string, never>; answer: ApiError | { loginId: string; authorizeUrl: string; expiresAt: string } }`, `{ call: 'pollCliLogin'; with: { loginId: string }; answer: ApiError | { status: 'pending' | 'cancelled' | 'expired' | 'used' } | { status: 'approved'; email: string; token: string } }`, `{ call: 'logOutCli'; with: Record<string, never>; answer: ApiError | Record<string, never> }`, `{ call: 'sendFeedback'; with: { kind: 'bug' | 'missing' | 'unclear' | 'other'; report: string }; answer: ApiError | { reference: string } }` or `{ call: 'tradeGitHubIdToken'; with: { repository: string; teamId: string }; answer: ApiError | { status: 'signed-in'; token: string } | { status: 'not-connected'; teamName: string } }`",
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
      if ('failed' in object3) {
        const where4 = at(where2, 'failed');
        const object5 = asObject(object3.failed, where4, problems);
        if (object5) {
          expectString(object5.stdout, at(where4, 'stdout'), problems);
          expectString(object5.stderr, at(where4, 'stderr'), problems);
          reportUnknownFields(object5, ['stdout', 'stderr'], where4, problems);
        }
      }
      reportUnknownFields(object3, ['package', 'failed'], where2, problems);
    }
    if ('storybook' in object1) {
      const where6 = at(path, 'storybook');
      const object7 = asObject(object1.storybook, where6, problems);
      if (object7) {
        readPosedFiles(object7.wrote, at(where6, 'wrote'), problems);
        if ('failed' in object7) {
          const where8 = at(where6, 'failed');
          const object9 = asObject(object7.failed, where8, problems);
          if (object9) {
            expectString(object9.stdout, at(where8, 'stdout'), problems);
            expectString(object9.stderr, at(where8, 'stderr'), problems);
            reportUnknownFields(object9, ['stdout', 'stderr'], where8, problems);
          }
        }
        reportUnknownFields(object7, ['wrote', 'failed'], where6, problems);
      }
    }
    if ('pods' in object1) {
      expectLiteral(object1.pods, 'installed', at(path, 'pods'), problems);
    }
    if ('enter' in object1) {
      expectOneOf(object1.enter, ['pressed', 'closed', 'nobody'], at(path, 'enter'), problems);
    }
    reportUnknownFields(object1, ['install', 'storybook', 'pods', 'enter'], path, problems);
  }
}

/** The shape of a `PosedLetterbox`, as `contracts/pose.contract.ts` publishes it. */
function readPosedLetterbox(value: unknown, path: string, problems: string[]): void {
  const oneOf1 = value;
  if (oneOf1 === 'no-bundler' || oneOf1 === 'no-app') {
    // the value is one of these
  } else if (isPlainObject(oneOf1)) {
    if ('stories' in oneOf1) {
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
    } else if ('scenes' in oneOf1) {
      const object5 = asObject(oneOf1, path, problems);
      if (object5) {
        expectStringArray(object5.scenes, at(path, 'scenes'), problems);
        expectStringArray(object5.route, at(path, 'route'), problems);
        reportUnknownFields(object5, ['scenes', 'route'], path, problems);
      }
    } else {
      reportWrongShape(
        oneOf1,
        "`{ stories: string[]; rendered?: 'yes' | 'timed-out'; threw?: { name: string; message: string } }` or `{ scenes: string[]; route: string[] }`",
        path,
        problems
      );
    }
  } else {
    reportWrongShape(
      oneOf1,
      '`"no-bundler"`, `"no-app"`, `{ stories: string[]; rendered?: \'yes\' | \'timed-out\'; threw?: { name: string; message: string } }` or `{ scenes: string[]; route: string[] }`',
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
    } else if ('brokenFiles' in oneOf1) {
      const object5 = asObject(oneOf1, path, problems);
      if (object5) {
        expectStringArray(object5.stories, at(path, 'stories'), problems);
        const where6 = at(path, 'brokenFiles');
        const list7 = asArray(object5.brokenFiles, where6, problems);
        if (list7) {
          list7.forEach((entry8, index9) => {
            readBrokenStoryFile(entry8, atIndex(where6, index9), problems);
          });
        }
        reportUnknownFields(object5, ['stories', 'brokenFiles'], path, problems);
      }
    } else if ('threwAtBoot' in oneOf1) {
      const object10 = asObject(oneOf1, path, problems);
      if (object10) {
        expectStringArray(object10.scenes, at(path, 'scenes'), problems);
        const where11 = at(path, 'threwAtBoot');
        const object12 = asObject(object10.threwAtBoot, where11, problems);
        if (object12) {
          expectString(object12.name, at(where11, 'name'), problems);
          expectString(object12.message, at(where11, 'message'), problems);
          expectString(object12.file, at(where11, 'file'), problems);
          expectNumber(object12.line, at(where11, 'line'), problems);
          reportUnknownFields(object12, ['name', 'message', 'file', 'line'], where11, problems);
        }
        reportUnknownFields(object10, ['scenes', 'threwAtBoot'], path, problems);
      }
    } else if ('ready' in oneOf1) {
      const object13 = asObject(oneOf1, path, problems);
      if (object13) {
        expectStringArray(object13.scenes, at(path, 'scenes'), problems);
        expectString(object13.ready, at(path, 'ready'), problems);
        expectStringArray(object13.stayedOn, at(path, 'stayedOn'), problems);
        if ('unanswered' in object13) {
          const where14 = at(path, 'unanswered');
          const list15 = asArray(object13.unanswered, where14, problems);
          if (list15) {
            list15.forEach((entry16, index17) => {
              readUnansweredRequest(entry16, atIndex(where14, index17), problems);
            });
          }
        }
        reportUnknownFields(
          object13,
          ['scenes', 'ready', 'stayedOn', 'unanswered'],
          path,
          problems
        );
      }
    } else if ('playDone' in oneOf1) {
      const object18 = asObject(oneOf1, path, problems);
      if (object18) {
        expectStringArray(object18.scenes, at(path, 'scenes'), problems);
        expectStringArray(object18.route, at(path, 'route'), problems);
        expectNumber(object18.bootMs, at(path, 'bootMs'), problems);
        expectNumber(object18.reachedMs, at(path, 'reachedMs'), problems);
        const where19 = at(path, 'playDone');
        const list20 = asArray(object18.playDone, where19, problems);
        if (list20) {
          list20.forEach((entry21, index22) => {
            readPosedPlayStep(entry21, atIndex(where19, index22), problems);
          });
        }
        const oneOf23 = object18.targetMissing;
        const where24 = at(path, 'targetMissing');
        if (isPlainObject(oneOf23)) {
          if ('tap' in oneOf23) {
            const object25 = asObject(oneOf23, where24, problems);
            if (object25) {
              expectString(object25.tap, at(where24, 'tap'), problems);
              expectNumber(object25.limitMs, at(where24, 'limitMs'), problems);
              reportUnknownFields(object25, ['tap', 'limitMs'], where24, problems);
            }
          } else if ('longPress' in oneOf23) {
            const object26 = asObject(oneOf23, where24, problems);
            if (object26) {
              expectString(object26.longPress, at(where24, 'longPress'), problems);
              expectNumber(object26.limitMs, at(where24, 'limitMs'), problems);
              reportUnknownFields(object26, ['longPress', 'limitMs'], where24, problems);
            }
          } else if ('type' in oneOf23) {
            const object27 = asObject(oneOf23, where24, problems);
            if (object27) {
              expectString(object27.type, at(where24, 'type'), problems);
              expectNumber(object27.limitMs, at(where24, 'limitMs'), problems);
              reportUnknownFields(object27, ['type', 'limitMs'], where24, problems);
            }
          } else if ('swipe' in oneOf23) {
            const object28 = asObject(oneOf23, where24, problems);
            if (object28) {
              expectString(object28.swipe, at(where24, 'swipe'), problems);
              expectOneOf(
                object28.direction,
                ['left', 'right', 'up', 'down'],
                at(where24, 'direction'),
                problems
              );
              expectNumber(object28.limitMs, at(where24, 'limitMs'), problems);
              reportUnknownFields(object28, ['swipe', 'direction', 'limitMs'], where24, problems);
            }
          } else {
            reportWrongShape(
              oneOf23,
              "`{ tap: string; limitMs: number }`, `{ longPress: string; limitMs: number }`, `{ type: string; limitMs: number }` or `{ swipe: string; direction: 'left' | 'right' | 'up' | 'down'; limitMs: number }`",
              where24,
              problems
            );
          }
        } else {
          reportWrongShape(
            oneOf23,
            "`{ tap: string; limitMs: number }`, `{ longPress: string; limitMs: number }`, `{ type: string; limitMs: number }` or `{ swipe: string; direction: 'left' | 'right' | 'up' | 'down'; limitMs: number }`",
            where24,
            problems
          );
        }
        reportUnknownFields(
          object18,
          ['scenes', 'route', 'bootMs', 'reachedMs', 'playDone', 'targetMissing'],
          path,
          problems
        );
      }
    } else if ('play' in oneOf1) {
      const object29 = asObject(oneOf1, path, problems);
      if (object29) {
        expectStringArray(object29.scenes, at(path, 'scenes'), problems);
        expectStringArray(object29.route, at(path, 'route'), problems);
        expectNumber(object29.bootMs, at(path, 'bootMs'), problems);
        expectNumber(object29.reachedMs, at(path, 'reachedMs'), problems);
        const where30 = at(path, 'play');
        const list31 = asArray(object29.play, where30, problems);
        if (list31) {
          list31.forEach((entry32, index33) => {
            readPosedPlayStep(entry32, atIndex(where30, index33), problems);
          });
        }
        const where34 = at(path, 'settled');
        const object35 = asObject(object29.settled, where34, problems);
        if (object35) {
          expectNumber(object35.ms, at(where34, 'ms'), problems);
          expectNumber(object35.frames, at(where34, 'frames'), problems);
          reportUnknownFields(object35, ['ms', 'frames'], where34, problems);
        }
        if ('unanswered' in object29) {
          const where36 = at(path, 'unanswered');
          const list37 = asArray(object29.unanswered, where36, problems);
          if (list37) {
            list37.forEach((entry38, index39) => {
              readUnansweredRequest(entry38, atIndex(where36, index39), problems);
            });
          }
        }
        readPosedView(object29.tree, at(path, 'tree'), problems);
        reportUnknownFields(
          object29,
          ['scenes', 'route', 'bootMs', 'reachedMs', 'play', 'settled', 'unanswered', 'tree'],
          path,
          problems
        );
      }
    } else {
      const object40 = asObject(oneOf1, path, problems);
      if (object40) {
        expectStringArray(object40.stories, at(path, 'stories'), problems);
        const oneOf41 = object40.settled;
        const where42 = at(path, 'settled');
        if (oneOf41 === 'timed-out') {
          // the value is one of these
        } else if (isPlainObject(oneOf41)) {
          const object43 = asObject(oneOf41, where42, problems);
          if (object43) {
            expectNumber(object43.ms, at(where42, 'ms'), problems);
            expectNumber(object43.frames, at(where42, 'frames'), problems);
            reportUnknownFields(object43, ['ms', 'frames'], where42, problems);
          }
        } else {
          reportWrongShape(
            oneOf41,
            '`"timed-out"` or `{ ms: number; frames: number }`',
            where42,
            problems
          );
        }
        if ('changing' in object40) {
          expectStringArray(object40.changing, at(path, 'changing'), problems);
        }
        if ('stillReal' in object40) {
          expectStringArray(object40.stillReal, at(path, 'stillReal'), problems);
        }
        if ('unanswered' in object40) {
          const where44 = at(path, 'unanswered');
          const list45 = asArray(object40.unanswered, where44, problems);
          if (list45) {
            list45.forEach((entry46, index47) => {
              readUnansweredRequest(entry46, atIndex(where44, index47), problems);
            });
          }
        }
        if ('threw' in object40) {
          const where48 = at(path, 'threw');
          const object49 = asObject(object40.threw, where48, problems);
          if (object49) {
            expectString(object49.name, at(where48, 'name'), problems);
            expectString(object49.message, at(where48, 'message'), problems);
            reportUnknownFields(object49, ['name', 'message'], where48, problems);
          }
        }
        if ('parts' in object40) {
          expectNumber(object40.parts, at(path, 'parts'), problems);
        }
        if ('hasNetworkImage' in object40) {
          expectBoolean(object40.hasNetworkImage, at(path, 'hasNetworkImage'), problems);
        }
        readPosedView(object40.tree, at(path, 'tree'), problems);
        reportUnknownFields(
          object40,
          [
            'stories',
            'settled',
            'changing',
            'stillReal',
            'unanswered',
            'threw',
            'parts',
            'hasNetworkImage',
            'tree',
          ],
          path,
          problems
        );
      }
    }
  } else {
    reportWrongShape(
      oneOf1,
      "`\"no-bundler\"`, `\"no-app\"`, `{ stories: string[]; crashed: { name?: string; message?: string } }`, `{ stories: string[]; brokenFiles: BrokenStoryFile[] }`, `{ stories: string[]; settled: 'timed-out' | { ms: number; frames: number }; changing?: string[]; stillReal?: string[]; unanswered?: UnansweredRequest[]; threw?: { name: string; message: string }; parts?: number; hasNetworkImage?: boolean; tree: PosedView }`, `{ scenes: string[]; threwAtBoot: { name: string; message: string; file: string; line: number } }`, `{ scenes: string[]; ready: string; stayedOn: string[]; unanswered?: UnansweredRequest[] }`, `{ scenes: string[]; route: string[]; bootMs: number; reachedMs: number; playDone: PosedPlayStep[]; targetMissing: { tap: string; limitMs: number } | { longPress: string; limitMs: number } | { type: string; limitMs: number } | { swipe: string; direction: 'left' | 'right' | 'up' | 'down'; limitMs: number } }` or `{ scenes: string[]; route: string[]; bootMs: number; reachedMs: number; play: PosedPlayStep[]; settled: { ms: number; frames: number }; unanswered?: UnansweredRequest[]; tree: PosedView }`",
      path,
      problems
    );
  }
}

/** The shape of a `PosedCoverage`, as `contracts/pose.contract.ts` publishes it. */
function readPosedCoverage(value: unknown, path: string, problems: string[]): void {
  const object1 = asObject(value, path, problems);
  if (object1) {
    expectNumber(object1.components, at(path, 'components'), problems);
    const where2 = at(path, 'gaps');
    const list3 = asArray(object1.gaps, where2, problems);
    if (list3) {
      list3.forEach((entry4, index5) => {
        const where6 = atIndex(where2, index5);
        const object7 = asObject(entry4, where6, problems);
        if (object7) {
          expectString(object7.name, at(where6, 'name'), problems);
          expectString(object7.file, at(where6, 'file'), problems);
          expectNumber(object7.importedBy, at(where6, 'importedBy'), problems);
          if ('excluded' in object7) {
            expectLiteral(object7.excluded, true, at(where6, 'excluded'), problems);
          }
          reportUnknownFields(
            object7,
            ['name', 'file', 'importedBy', 'excluded'],
            where6,
            problems
          );
        }
      });
    }
    if ('props' in object1) {
      const where8 = at(path, 'props');
      const object9 = asObject(object1.props, where8, problems);
      if (object9) {
        expectNumber(object9.storyFiles, at(where8, 'storyFiles'), problems);
        const where10 = at(where8, 'components');
        const list11 = asArray(object9.components, where10, problems);
        if (list11) {
          list11.forEach((entry12, index13) => {
            const where14 = atIndex(where10, index13);
            const object15 = asObject(entry12, where14, problems);
            if (object15) {
              expectString(object15.name, at(where14, 'name'), problems);
              expectString(object15.file, at(where14, 'file'), problems);
              const where16 = at(where14, 'props');
              const list17 = asArray(object15.props, where16, problems);
              if (list17) {
                list17.forEach((entry18, index19) => {
                  const where20 = atIndex(where16, index19);
                  const object21 = asObject(entry18, where20, problems);
                  if (object21) {
                    expectString(object21.prop, at(where20, 'prop'), problems);
                    expectNumber(object21.allowed, at(where20, 'allowed'), problems);
                    expectNumber(object21.set, at(where20, 'set'), problems);
                    if ('missing' in object21) {
                      expectStringArray(object21.missing, at(where20, 'missing'), problems);
                    }
                    reportUnknownFields(
                      object21,
                      ['prop', 'allowed', 'set', 'missing'],
                      where20,
                      problems
                    );
                  }
                });
              }
              reportUnknownFields(object15, ['name', 'file', 'props'], where14, problems);
            }
          });
        }
        reportUnknownFields(object9, ['storyFiles', 'components'], where8, problems);
      }
    }
    reportUnknownFields(object1, ['components', 'gaps', 'props'], path, problems);
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
    if ('errorName' in object1) {
      expectLiteral(object1.errorName, 'TeamNotFoundError', at(path, 'errorName'), problems);
    }
    if ('cause' in object1) {
      const where2 = at(path, 'cause');
      const object3 = asObject(object1.cause, where2, problems);
      if (object3) {
        expectString(object3.code, at(where2, 'code'), problems);
        if ('hostname' in object3) {
          expectString(object3.hostname, at(where2, 'hostname'), problems);
        }
        reportUnknownFields(object3, ['code', 'hostname'], where2, problems);
      }
    }
    reportUnknownFields(object1, ['error', 'errorName', 'cause'], path, problems);
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
    if ('runError' in object1) {
      const oneOf4 = object1.runError;
      const where5 = at(path, 'runError');
      if (typeof oneOf4 === 'string' || oneOf4 === null) {
        // the value is one of these
      } else {
        reportWrongShape(oneOf4, 'a string or `null`', where5, problems);
      }
    }
    if ('runErrorPlatform' in object1) {
      const oneOf6 = object1.runErrorPlatform;
      const where7 = at(path, 'runErrorPlatform');
      if (oneOf6 === 'android' || oneOf6 === 'ios' || oneOf6 === null) {
        // the value is one of these
      } else {
        reportWrongShape(oneOf6, '`"android"`, `"ios"` or `null`', where7, problems);
      }
    }
    if ('runErrorReason' in object1) {
      const oneOf8 = object1.runErrorReason;
      const where9 = at(path, 'runErrorReason');
      if (oneOf8 === 'appFailedToStart' || oneOf8 === null) {
        // the value is one of these
      } else {
        reportWrongShape(oneOf8, '`"appFailedToStart"` or `null`', where9, problems);
      }
    }
    if ('runErrorMessage' in object1) {
      const oneOf10 = object1.runErrorMessage;
      const where11 = at(path, 'runErrorMessage');
      if (typeof oneOf10 === 'string' || oneOf10 === null) {
        // the value is one of these
      } else {
        reportWrongShape(oneOf10, 'a string or `null`', where11, problems);
      }
    }
    if ('diffScopeInfo' in object1) {
      const where12 = at(path, 'diffScopeInfo');
      const object13 = asObject(object1.diffScopeInfo, where12, problems);
      if (object13) {
        if ('capturedSnapshotCount' in object13) {
          expectNumber(
            object13.capturedSnapshotCount,
            at(where12, 'capturedSnapshotCount'),
            problems
          );
        }
        if ('inheritedSnapshotCount' in object13) {
          expectNumber(
            object13.inheritedSnapshotCount,
            at(where12, 'inheritedSnapshotCount'),
            problems
          );
        }
        if ('platforms' in object13) {
          const where14 = at(where12, 'platforms');
          const object15 = asObject(object13.platforms, where14, problems);
          if (object15) {
            if ('android' in object15) {
              const where16 = at(where14, 'android');
              const object17 = asObject(object15.android, where16, problems);
              if (object17) {
                if ('reason' in object17) {
                  expectString(object17.reason, at(where16, 'reason'), problems);
                }
                reportUnknownFields(object17, ['reason'], where16, problems);
              }
            }
            if ('ios' in object15) {
              const where18 = at(where14, 'ios');
              const object19 = asObject(object15.ios, where18, problems);
              if (object19) {
                if ('reason' in object19) {
                  expectString(object19.reason, at(where18, 'reason'), problems);
                }
                reportUnknownFields(object19, ['reason'], where18, problems);
              }
            }
            reportUnknownFields(object15, ['android', 'ios'], where14, problems);
          }
        }
        reportUnknownFields(
          object13,
          ['capturedSnapshotCount', 'inheritedSnapshotCount', 'platforms'],
          where12,
          problems
        );
      }
    }
    if ('gitInfo' in object1) {
      const where20 = at(path, 'gitInfo');
      const object21 = asObject(object1.gitInfo, where20, problems);
      if (object21) {
        expectString(object21.branchName, at(where20, 'branchName'), problems);
        expectString(object21.commitHash, at(where20, 'commitHash'), problems);
        if ('isDirty' in object21) {
          const oneOf22 = object21.isDirty;
          const where23 = at(where20, 'isDirty');
          if (typeof oneOf22 === 'boolean' || oneOf22 === null) {
            // the value is one of these
          } else {
            reportWrongShape(oneOf22, 'true/false or `null`', where23, problems);
          }
        }
        reportUnknownFields(object21, ['branchName', 'commitHash', 'isDirty'], where20, problems);
      }
    }
    if ('mainBranch' in object1) {
      const oneOf24 = object1.mainBranch;
      const where25 = at(path, 'mainBranch');
      if (typeof oneOf24 === 'string' || oneOf24 === null) {
        // the value is one of these
      } else {
        reportWrongShape(oneOf24, 'a string or `null`', where25, problems);
      }
    }
    if ('ciRun' in object1) {
      const oneOf26 = object1.ciRun;
      const where27 = at(path, 'ciRun');
      if (oneOf26 === null) {
        // the value is one of these
      } else if (isPlainObject(oneOf26)) {
        const object28 = asObject(oneOf26, where27, problems);
        if (object28) {
          expectString(object28.provider, at(where27, 'provider'), problems);
          expectString(object28.runId, at(where27, 'runId'), problems);
          reportUnknownFields(object28, ['provider', 'runId'], where27, problems);
        }
      } else {
        reportWrongShape(
          oneOf26,
          '`{ provider: string; runId: string }` or `null`',
          where27,
          problems
        );
      }
    }
    if ('devices' in object1) {
      const oneOf29 = object1.devices;
      const where30 = at(path, 'devices');
      if (oneOf29 === null) {
        // the value is one of these
      } else if (Array.isArray(oneOf29)) {
        const list31 = asArray(oneOf29, where30, problems);
        if (list31) {
          list31.forEach((entry32, index33) => {
            const where34 = atIndex(where30, index33);
            const object35 = asObject(entry32, where34, problems);
            if (object35) {
              expectString(object35.id, at(where34, 'id'), problems);
              expectString(object35.osVersion, at(where34, 'osVersion'), problems);
              expectOneOf(object35.platform, ['android', 'ios'], at(where34, 'platform'), problems);
              reportUnknownFields(object35, ['id', 'osVersion', 'platform'], where34, problems);
            }
          });
        }
      } else {
        reportWrongShape(
          oneOf29,
          "`Array<{ id: string; osVersion: string; platform: 'android' | 'ios' }>` or `null`",
          where30,
          problems
        );
      }
    }
    if ('platforms' in object1) {
      const oneOf36 = object1.platforms;
      const where37 = at(path, 'platforms');
      if (oneOf36 === null) {
        // the value is one of these
      } else if (isPlainObject(oneOf36)) {
        const object38 = asObject(oneOf36, where37, problems);
        if (object38) {
          if ('android' in object38) {
            readBuildStatusPlatform(object38.android, at(where37, 'android'), problems);
          }
          if ('ios' in object38) {
            readBuildStatusPlatform(object38.ios, at(where37, 'ios'), problems);
          }
          reportUnknownFields(object38, ['android', 'ios'], where37, problems);
        }
      } else {
        reportWrongShape(
          oneOf36,
          '`{ android?: BuildStatusPlatform; ios?: BuildStatusPlatform }` or `null`',
          where37,
          problems
        );
      }
    }
    if ('stories' in object1) {
      const oneOf39 = object1.stories;
      const where40 = at(path, 'stories');
      if (oneOf39 === null) {
        // the value is one of these
      } else if (Array.isArray(oneOf39)) {
        const list41 = asArray(oneOf39, where40, problems);
        if (list41) {
          list41.forEach((entry42, index43) => {
            const where44 = atIndex(where40, index43);
            const object45 = asObject(entry42, where44, problems);
            if (object45) {
              expectString(object45.name, at(where44, 'name'), problems);
              expectString(object45.status, at(where44, 'status'), problems);
              const oneOf46 = object45.baseline;
              const where47 = at(where44, 'baseline');
              if (oneOf46 === null) {
                // the value is one of these
              } else if (isPlainObject(oneOf46)) {
                const object48 = asObject(oneOf46, where47, problems);
                if (object48) {
                  expectNumber(object48.buildIndex, at(where47, 'buildIndex'), problems);
                  reportUnknownFields(object48, ['buildIndex'], where47, problems);
                }
              } else {
                reportWrongShape(oneOf46, '`{ buildIndex: number }` or `null`', where47, problems);
              }
              if ('reason' in object45) {
                const oneOf49 = object45.reason;
                const where50 = at(where44, 'reason');
                if (typeof oneOf49 === 'string' || oneOf49 === null) {
                  // the value is one of these
                } else {
                  reportWrongShape(oneOf49, 'a string or `null`', where50, problems);
                }
              }
              if ('candidates' in object45) {
                const oneOf51 = object45.candidates;
                const where52 = at(where44, 'candidates');
                if (oneOf51 === null) {
                  // the value is one of these
                } else if (Array.isArray(oneOf51)) {
                  const list53 = asArray(oneOf51, where52, problems);
                  if (list53) {
                    list53.forEach((entry54, index55) => {
                      const where56 = atIndex(where52, index55);
                      const object57 = asObject(entry54, where56, problems);
                      if (object57) {
                        expectNumber(object57.buildIndex, at(where56, 'buildIndex'), problems);
                        reportUnknownFields(object57, ['buildIndex'], where56, problems);
                      }
                    });
                  }
                } else {
                  reportWrongShape(
                    oneOf51,
                    '`Array<{ buildIndex: number }>` or `null`',
                    where52,
                    problems
                  );
                }
              }
              reportUnknownFields(
                object45,
                ['name', 'status', 'baseline', 'reason', 'candidates'],
                where44,
                problems
              );
            }
          });
        }
      } else {
        reportWrongShape(
          oneOf39,
          '`Array<{ name: string; status: string; baseline: { buildIndex: number } | null; reason?: string | null; candidates?: Array<{ buildIndex: number }> | null }>` or `null`',
          where40,
          problems
        );
      }
    }
    if ('diffScope' in object1) {
      const where58 = at(path, 'diffScope');
      const object59 = asObject(object1.diffScope, where58, problems);
      if (object59) {
        expectString(object59.reason, at(where58, 'reason'), problems);
        expectStringArray(object59.captured, at(where58, 'captured'), problems);
        expectStringArray(object59.inherited, at(where58, 'inherited'), problems);
        const oneOf60 = object59.ancestorBuildIndex;
        const where61 = at(where58, 'ancestorBuildIndex');
        if (typeof oneOf60 === 'number' || oneOf60 === null) {
          // the value is one of these
        } else {
          reportWrongShape(oneOf60, 'a number or `null`', where61, problems);
        }
        reportUnknownFields(
          object59,
          ['reason', 'captured', 'inherited', 'ancestorBuildIndex'],
          where58,
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
        'runErrorPlatform',
        'runErrorReason',
        'runErrorMessage',
        'diffScopeInfo',
        'gitInfo',
        'mainBranch',
        'ciRun',
        'devices',
        'platforms',
        'stories',
        'diffScope',
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
    if ('scenesInBundle' in object1) {
      expectNumber(object1.scenesInBundle, at(path, 'scenesInBundle'), problems);
    }
    reportUnknownFields(
      object1,
      ['madeBy', 'why', 'nativeChanges', 'storiesInBundle', 'scenesInBundle'],
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
              'ipad.10.gen',
              'ipad.9.gen',
              'ipad.air.11.m2',
              'ipad.air.13.m2',
              'ipad.air.5.gen',
              'ipad.mini.6.gen',
              'ipad.pro.11.4.gen',
              'ipad.pro.11.m4',
              'ipad.pro.12.9.6.gen',
              'ipad.pro.13.m4',
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
          expectOneOf(object7.theme, ['dark', 'light'], at(where6, 'theme'), problems);
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
          if ('scenesInBundle' in object13) {
            expectNumber(object13.scenesInBundle, at(where12, 'scenesInBundle'), problems);
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
            const list15 = asArray(object13.storyTitles, where14, problems);
            if (list15) {
              list15.forEach((entry16, index17) => {
                const where18 = atIndex(where14, index17);
                const object19 = asObject(entry16, where18, problems);
                if (object19) {
                  expectString(object19.storyFile, at(where18, 'storyFile'), problems);
                  if ('title' in object19) {
                    expectString(object19.title, at(where18, 'title'), problems);
                  }
                  if ('stories' in object19) {
                    expectNumber(object19.stories, at(where18, 'stories'), problems);
                  }
                  reportUnknownFields(
                    object19,
                    ['storyFile', 'title', 'stories'],
                    where18,
                    problems
                  );
                }
              });
            }
          }
          reportUnknownFields(
            object13,
            [
              'platform',
              'full',
              'capturedStories',
              'storiesInBundle',
              'scenesInBundle',
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
        if ('podFilesChanged' in object3) {
          expectStringArray(object3.podFilesChanged, at(path, 'podFilesChanged'), problems);
        }
        reportUnknownFields(
          object3,
          ['built', 'sizeMb', 'seconds', 'podFilesChanged'],
          path,
          problems
        );
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
        '`{ cached: string }`, `{ built: string; sizeMb: string; seconds: number; podFilesChanged?: string[] }`, `{ failed: { seconds: number; lastLines: string[] } }` or `{ easBuild: string }`',
        path,
        problems
      );
    }
  } else {
    reportWrongShape(
      oneOf1,
      '`{ cached: string }`, `{ built: string; sizeMb: string; seconds: number; podFilesChanged?: string[] }`, `{ failed: { seconds: number; lastLines: string[] } }` or `{ easBuild: string }`',
      path,
      problems
    );
  }
}

/** The shape of a `BrokenStoryFile`, as `contracts/pose.contract.ts` publishes it. */
function readBrokenStoryFile(value: unknown, path: string, problems: string[]): void {
  const object1 = asObject(value, path, problems);
  if (object1) {
    expectString(object1.file, at(path, 'file'), problems);
    readAppError(object1.error, at(path, 'error'), problems);
    reportUnknownFields(object1, ['file', 'error'], path, problems);
  }
}

/** The shape of a `UnansweredRequest`, as `contracts/pose.contract.ts` publishes it. */
function readUnansweredRequest(value: unknown, path: string, problems: string[]): void {
  const object1 = asObject(value, path, problems);
  if (object1) {
    expectString(object1.method, at(path, 'method'), problems);
    expectString(object1.url, at(path, 'url'), problems);
    if ('contentType' in object1) {
      expectString(object1.contentType, at(path, 'contentType'), problems);
    }
    if ('operation' in object1) {
      expectString(object1.operation, at(path, 'operation'), problems);
    }
    if ('bodyExcerpt' in object1) {
      expectString(object1.bodyExcerpt, at(path, 'bodyExcerpt'), problems);
    }
    reportUnknownFields(
      object1,
      ['method', 'url', 'contentType', 'operation', 'bodyExcerpt'],
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

/** The shape of a `PosedPlayStep`, as `contracts/pose.contract.ts` publishes it. */
function readPosedPlayStep(value: unknown, path: string, problems: string[]): void {
  const oneOf1 = value;
  if (isPlainObject(oneOf1)) {
    if ('tap' in oneOf1) {
      const object2 = asObject(oneOf1, path, problems);
      if (object2) {
        expectString(object2.tap, at(path, 'tap'), problems);
        reportUnknownFields(object2, ['tap'], path, problems);
      }
    } else if ('longPress' in oneOf1) {
      const object3 = asObject(oneOf1, path, problems);
      if (object3) {
        expectString(object3.longPress, at(path, 'longPress'), problems);
        reportUnknownFields(object3, ['longPress'], path, problems);
      }
    } else if ('type' in oneOf1) {
      const object4 = asObject(oneOf1, path, problems);
      if (object4) {
        expectString(object4.type, at(path, 'type'), problems);
        reportUnknownFields(object4, ['type'], path, problems);
      }
    } else if ('swipe' in oneOf1) {
      const object5 = asObject(oneOf1, path, problems);
      if (object5) {
        expectString(object5.swipe, at(path, 'swipe'), problems);
        expectOneOf(
          object5.direction,
          ['left', 'right', 'up', 'down'],
          at(path, 'direction'),
          problems
        );
        reportUnknownFields(object5, ['swipe', 'direction'], path, problems);
      }
    } else if ('open' in oneOf1) {
      const object6 = asObject(oneOf1, path, problems);
      if (object6) {
        expectString(object6.open, at(path, 'open'), problems);
        reportUnknownFields(object6, ['open'], path, problems);
      }
    } else {
      reportWrongShape(
        oneOf1,
        "`{ tap: string }`, `{ longPress: string }`, `{ type: string }`, `{ swipe: string; direction: 'left' | 'right' | 'up' | 'down' }` or `{ open: string }`",
        path,
        problems
      );
    }
  } else {
    reportWrongShape(
      oneOf1,
      "`{ tap: string }`, `{ longPress: string }`, `{ type: string }`, `{ swipe: string; direction: 'left' | 'right' | 'up' | 'down' }` or `{ open: string }`",
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
    if ('scenesInBundle' in object1) {
      const oneOf20 = object1.scenesInBundle;
      const where21 = at(path, 'scenesInBundle');
      if (typeof oneOf20 === 'number' || oneOf20 === null) {
        // the value is one of these
      } else {
        reportWrongShape(oneOf20, 'a number or `null`', where21, problems);
      }
    }
    reportUnknownFields(
      object1,
      ['arrived', 'capture', 'appBuild', 'storiesInBundle', 'scenesInBundle'],
      path,
      problems
    );
  }
}

/** The shape of a `PosedPlatformCaptureDecision`, as `contracts/pose.contract.ts` publishes it. */
function readPosedPlatformCaptureDecision(value: unknown, path: string, problems: string[]): void {
  const object1 = asObject(value, path, problems);
  if (object1) {
    if ('changedStoryFilePaths' in object1) {
      expectStringArray(object1.changedStoryFilePaths, at(path, 'changedStoryFilePaths'), problems);
    }
    if ('newStoryFilePaths' in object1) {
      expectStringArray(object1.newStoryFilePaths, at(path, 'newStoryFilePaths'), problems);
    }
    expectBoolean(object1.full, at(path, 'full'), problems);
    if ('storyFilePaths' in object1) {
      expectStringArray(object1.storyFilePaths, at(path, 'storyFilePaths'), problems);
    }
    if ('reason' in object1) {
      expectString(object1.reason, at(path, 'reason'), problems);
    }
    reportUnknownFields(
      object1,
      ['changedStoryFilePaths', 'newStoryFilePaths', 'full', 'storyFilePaths', 'reason'],
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

/** The shape of a `AppError`, as `contracts/pose.contract.ts` publishes it. */
function readAppError(value: unknown, path: string, problems: string[]): void {
  const object1 = asObject(value, path, problems);
  if (object1) {
    expectString(object1.name, at(path, 'name'), problems);
    expectString(object1.message, at(path, 'message'), problems);
    if ('componentStack' in object1) {
      expectString(object1.componentStack, at(path, 'componentStack'), problems);
    }
    if ('topFrames' in object1) {
      expectStringArray(object1.topFrames, at(path, 'topFrames'), problems);
    }
    reportUnknownFields(
      object1,
      ['name', 'message', 'componentStack', 'topFrames'],
      path,
      problems
    );
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
    expectString(object1.kind, at(path, 'kind'), problems);
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
