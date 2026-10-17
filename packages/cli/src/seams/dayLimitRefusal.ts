/** The error type the service gives the refusal of a report past a login's day limit. */
const DAY_LIMIT_ERROR_TYPE = 'FeedbackDayLimitReached';

/** Whether an sdk client error is the service refusing a report for the day's limit. */
export function serviceRefusedTheDayLimit(error: unknown): boolean {
  const clientError = error as {
    errorType?: string;
    graphQLErrors?: Array<{ errorType?: string }>;
  };

  const errorTypes = [
    clientError?.errorType,
    ...(clientError?.graphQLErrors ?? []).map((graphQLError) => graphQLError.errorType),
  ];
  return errorTypes.includes(DAY_LIMIT_ERROR_TYPE);
}
