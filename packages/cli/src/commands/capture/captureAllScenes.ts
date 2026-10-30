/**
 * `sherlo capture --all-scenes <folder>` - every scene of the project, one after another, on the
 * developer's own running phone, each saved as `<id>.png` and `<id>.json` in the folder.
 *
 * Each scene is captured the way `--scene` captures one (./capture `captureOnCleanDevice`): a clean
 * device, its phone set, a fresh launch, its picture, the put-back. Every scene gets its record,
 * whatever its ending, and one line on the screen as it finishes; a closing summary counts the
 * endings. The process ends with EXIT_BLOCK when any scene did not come up and hold still.
 */
import fs from 'fs';
import path from 'path';
import { EXIT_BLOCK } from '../../helpers/exitCodes';
import getCwd from '../../helpers/getCwd';
import { emit } from '../../helpers/transcriptSink';
import { captureSocket } from '../../seams/captureSocket';
import { outcomeOf } from '../../render/capturedAllScenes';
import type { AllScenesSummary, SceneOutcome, SceneRunLine } from '../../render/capturedAllScenes';
import { explainRefusals } from '../../render/refusalExplanation';
import type { RefusalCause } from '../../render/refusalExplanation';
import type { SceneCaptureResult } from '../../seams/liveScene';
import { captureOnCleanDevice, isPictured } from './capture';

export async function captureAllScenes(folder: string, port: number): Promise<void> {
  // The folder is read from the project folder, as the other commands read theirs (../../helpers/getCwd).
  const where = path.resolve(getCwd(), folder);
  fs.mkdirSync(where, { recursive: true });

  const counts: Record<SceneOutcome, number> = {
    captured: 0,
    'never-settled': 0,
    'never-reached': 0,
    failed: 0,
  };
  const sceneIds = await captureSocket().listScenes();
  // The cause the scene before failed for, and whether the run has already warned of it.
  let lastCause: RefusalCause | undefined;
  let warned = false;
  for (const [index, sceneId] of sceneIds.entries()) {
    const { answer, notApplied, picture } = await captureOnCleanDevice({
      sceneId,
      port,
      pngPath: path.join(where, `${sceneId}.png`),
    });
    const record = {
      ...answer,
      ...(picture && !picture.error && isPictured(answer) ? { png: picture.path } : {}),
      ...(notApplied.length > 0 ? { deviceNotApplied: notApplied } : {}),
    };
    fs.writeFileSync(path.join(where, `${sceneId}.json`), `${JSON.stringify(record, null, 2)}\n`);

    counts[outcomeOf(answer.kind)] += 1;
    const cause = causeOf(answer);
    const remaining = sceneIds.length - index - 1;
    const sameCause: SceneRunLine['sameCause'] =
      cause && cause.id === lastCause?.id && !warned && remaining > 0
        ? { remaining, cause: cause.short, ...(cause.fakes[0] && { fake: cause.fakes[0] }) }
        : undefined;
    warned ||= sameCause !== undefined;
    lastCause = cause;
    emit({ kind: 'scene-run-line', line: { ...lineOf(sceneId, answer), sameCause } });
  }

  const summary: AllScenesSummary = {
    folder,
    captured: counts.captured,
    neverSettled: counts['never-settled'],
    neverReached: counts['never-reached'],
    failed: counts.failed,
  };
  emit({ kind: 'all-scenes-summary', summary });
  if (counts.captured < Object.values(counts).reduce((all, one) => all + one, 0)) {
    process.exit(EXIT_BLOCK);
  }
}

/** The first cause the refused requests of a scene that never got ready point to, when they point to any. */
function causeOf(answer: SceneCaptureResult): RefusalCause | undefined {
  if (answer.kind !== 'never-reached') return undefined;
  return explainRefusals(answer.unanswered)?.causes[0];
}

/** What the progress line says of one scene, read from the app's answer. */
function lineOf(sceneId: string, answer: SceneCaptureResult) {
  const said = answer as {
    bootMs?: number;
    settled?: { ms?: number };
    reached?: { ms?: number };
    changing?: string[];
    ready?: string;
    unanswered?: unknown[];
  };
  return {
    sceneId,
    ending: answer.kind,
    ...(said.bootMs && { launchMs: said.bootMs }),
    ...(said.settled?.ms && { settledMs: said.settled.ms }),
    ...(said.reached?.ms !== undefined && { readyMs: said.reached.ms }),
    ...(said.changing && { changing: said.changing }),
    ...(said.ready !== undefined && { ready: said.ready }),
    refused: said.unanswered?.length ?? 0,
  };
}
