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
import type { AllScenesSummary, SceneOutcome } from '../../render/capturedAllScenes';
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
  for (const sceneId of await captureSocket().listScenes()) {
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
    emit({ kind: 'scene-run-line', line: lineOf(sceneId, answer) });
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

/** What the progress line says of one scene, read from the app's answer. */
function lineOf(sceneId: string, answer: SceneCaptureResult) {
  const said = answer as {
    reached?: { ms?: number };
    changing?: string[];
    ready?: string;
    unanswered?: unknown[];
  };
  return {
    sceneId,
    ending: answer.kind,
    ...(said.reached?.ms !== undefined && { readyMs: said.reached.ms }),
    ...(said.changing && { changing: said.changing }),
    ...(said.ready !== undefined && { ready: said.ready }),
    refused: said.unanswered?.length ?? 0,
  };
}
