/**
 * `sherlo preview` - the review page over the captures kept in `.sherlo/captures/`.
 *
 * It opens the web app's own review page on this computer and keeps it updating while captures
 * come in, until Ctrl+C. With no terminal attached it ends once the page has opened, so an agent's
 * shell is never held. `--json` prints the same facts once, as plain data: no server, no browser,
 * and the pictures as absolute paths an agent can open.
 *
 * Nothing here logs in, talks to Sherlo's backend or needs a project or a team: the kept captures
 * are the whole input (see ../../seams/localCaptures).
 */
import path from 'path';
import { JSON_OPTION } from '../../constants';
import { throwError } from '../../helpers';
import getCwd from '../../helpers/getCwd';
import {
  renderPreview,
  renderReportBrowserNotOpened,
  renderReportPageMissing,
} from '../../render/capturedReport';
import { browser } from '../../seams/browser';
import {
  CAPTURES_FOLDER,
  readCapturingIds,
  readKeptCaptures,
  samePicture,
} from '../../seams/localCaptures';
import { localServer } from '../../seams/localServer';
import { buildReport } from './buildReport';

export type PreviewOptions = {
  [JSON_OPTION]?: boolean;
};

async function preview(passedOptions: PreviewOptions): Promise<void> {
  const root = getCwd();

  const reportNow = (
    isLive: boolean,
    pictureOf: (folder: string, file: string, kind: 'screen' | 'ended') => string
  ) =>
    buildReport({
      captures: readKeptCaptures(root),
      capturingIds: readCapturingIds(root),
      samePicture,
      isLive,
      // `TZ` is what a person sets to read the time in another zone; a posed run states it.
      timeZone: process.env.TZ,
      pictureOf: (capture, kind) =>
        pictureOf(
          capture.folder,
          (kind === 'ended' ? capture.endedPath : capture.screenPath) ?? '',
          kind
        ),
    });

  if (passedOptions[JSON_OPTION]) {
    const report = reportNow(false, (_folder, file) => file);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }

  const pageFolder = localServer().pageFolder();
  if (!pageFolder) throwError({ message: renderReportPageMissing() });

  // The page asks for a picture by its folder's name: `data/pictures/<folder>.png`.
  const pageReport = () =>
    reportNow(
      true,
      (folder, _file, kind) =>
        `data/pictures/${path.basename(folder)}${kind === 'ended' ? '.ended' : ''}.png`
    );
  const server = await localServer().serve({
    pageFolder,
    capturesFolder: path.join(root, CAPTURES_FOLDER),
    report: pageReport,
  });

  const { summary } = pageReport();
  const watched = localServer().watched();
  const counts = {
    captured: summary.capturedCount,
    notCaptured: summary.notCapturedCount,
    changed: summary.changedCount,
  };
  process.stdout.write(`${renderPreview(server.address, counts, watched).join('\n')}\n`);

  if (!(await browser().open(server.address))) {
    process.stdout.write(`${renderReportBrowserNotOpened().join('\n')}\n`);
  }

  // Nobody can press Ctrl+C in an agent's shell, and a run that never ends holds that shell.
  if (!watched) {
    await server.opened;
    server.stop();
  }
  await server.stopped;
}

export default preview;
