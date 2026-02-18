import sdkClient from '@sherlo/sdk-client';
import { getTokenParts, reporting } from '../../../helpers';

async function trackProgress({
  event,
  hasStarted,
  hasFinished,
  params,
  sessionId,
  token,
}: {
  event: string;
  params?: Record<string, any>;
  sessionId: string | null;
  hasStarted?: boolean;
  hasFinished?: boolean;
  token?: string;
}): Promise<{ sessionId: string | null }> {
  const { apiToken, projectIndex, teamId } = token ? getTokenParts(token) : {};

  return sdkClient({ authToken: apiToken })
    .trackCliInit({
      event,
      stringifiedParams: JSON.stringify(params ?? {}),
      hasStarted,
      hasFinished,
      sessionId,
      teamId,
      projectIndex,
    })
    .catch((error: Error) => {
      reporting.captureException(error);

      return { sessionId: sessionId ?? null };
    });
}

export default trackProgress;
