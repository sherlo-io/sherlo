import { describe, expect, it } from 'vitest';
import { serviceRefusedTheDayLimit } from '../dayLimitRefusal';

describe('Telling the service refusing the day limit from a service never reached', () => {
  it('Reads the day limit error type inside a GraphQL error as that refusal', () => {
    const error = { graphQLErrors: [{ errorType: 'FeedbackDayLimitReached' }] };

    expect(serviceRefusedTheDayLimit(error)).toBe(true);
  });

  it('Reads a client error carrying the day limit error type as that refusal', () => {
    expect(serviceRefusedTheDayLimit({ errorType: 'FeedbackDayLimitReached' })).toBe(true);
  });

  it('Reads the day limit wording with no error type as not the day limit', () => {
    expect(serviceRefusedTheDayLimit(new Error('At most 20 feedback reports a day'))).toBe(false);
    expect(
      serviceRefusedTheDayLimit({
        graphQLErrors: [{ message: 'At most 20 feedback reports a day' }],
      })
    ).toBe(false);
  });

  it('Reads a failure to reach the service, or another refusal, as not the day limit', () => {
    expect(serviceRefusedTheDayLimit(new Error('fetch failed'))).toBe(false);
    expect(serviceRefusedTheDayLimit({ graphQLErrors: [{ errorType: 'BadFeedbackKind' }] })).toBe(
      false
    );
    expect(serviceRefusedTheDayLimit(undefined)).toBe(false);
  });
});
