const LIVE_WEB_APP = 'https://app.sherlo.io';
const DEV_WEB_APP = 'https://dev.app.sherlo.io';

/**
 * The web app that goes with the Sherlo API the CLI talks to, so a link it prints opens the same
 * environment the build went to.
 *
 * - SHERLO_APP_URL, when set, names the web app (an environment whose API address was chosen with
 *   SHERLO_API_URL has no other way to say where its web app is).
 * - Otherwise the API address built into the client says: a dev build gives the dev web app.
 * - Anything else, including an API address chosen with SHERLO_API_URL alone, gives the live one.
 */
function getAppDomain(
  appUrl: string | undefined = process.env.SHERLO_APP_URL,
  apiUrl: string | undefined = process.env.SHERLO_API_URL,
  bakedStage: string = require('@sherlo/sdk-client/dist/env.json').stage
): string {
  if (appUrl) return appUrl.replace(/\/+$/, '');
  if (apiUrl) return LIVE_WEB_APP;

  return bakedStage === 'dev' ? DEV_WEB_APP : LIVE_WEB_APP;
}

export default getAppDomain;
