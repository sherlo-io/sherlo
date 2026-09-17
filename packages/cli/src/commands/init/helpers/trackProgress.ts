import sdkClient from '@sherlo/sdk-client';
import { getTokenParts, reporting, stripAnsi } from '../../../helpers';
import { serverCalls } from '../../../seams/serverCalls';

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

  if (params && params.error instanceof Error) {
    const errorObj = params.error as Error & { cause?: unknown };
    params = {
      ...params,
      error: errorObj.message,
      ...(errorObj.cause ? { cause: errorObj.cause } : {}),
    };
  }

  const stringifiedParams = JSON.stringify(params ?? {}, (_, value) =>
    typeof value === 'string' ? stripAnsi(value).trim() : value
  );

  // Through the server seam, like every other backend call, so a posed `init` answers its progress
  // reports from the pose's `api` instead of reaching the real backend.
  return serverCalls()
    .trackCliInit(sdkClient({ authToken: apiToken }), {
      event,
      stringifiedParams,
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
