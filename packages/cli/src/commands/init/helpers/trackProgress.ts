import sdkClient from '@sherlo/sdk-client';
import { getTokenParts, reporting } from '../../../helpers';

async function trackProgress({}: {
  event: string;
  params: Record<string, any>;
  sessionId: string | null;
  hasStarted?: boolean;
  hasFinished?: boolean;
  token?: string;
}): Promise<{ sessionId: string }> {
  return { sessionId: '123' };
}

export default trackProgress;

/* ========================================================================== */

async function trackProgress2({
  event,
  hasStarted,
  hasFinished,
  params,
  sessionId: passedSessionId,
  token,
}: {
  event: string;
  params: Record<string, any>;
  sessionId: string | null;
  hasStarted?: boolean;
  hasFinished?: boolean;
  token?: string;
}): Promise<{ sessionId: string }> {
  const { apiToken, projectIndex, teamId } = token ? getTokenParts(token) : {};
  // @ts-ignore
  const client = sdkClient(apiToken);

  const { sessionId } = await client
    // @ts-ignore
    .trackCliInit({
      event,
      stringifiedParams: JSON.stringify(params),
      hasStarted,
      hasFinished,
      sessionId: passedSessionId,
      teamId,
      projectIndex,
    })
    .catch((error: Error) => reporting.captureException(error));

  return { sessionId };
}
