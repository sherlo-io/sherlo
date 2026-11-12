/**
 * The queries line of `sherlo suggest --facts`: the server operations a screen runs, read through
 * its own hooks too, from tagged templates, generated documents and generated hooks.
 */
import { describe, expect, it } from 'vitest';
import { factsLines, screenFacts } from '../screenFacts';

const factsOf = (files: { path: string; text: string }[]) =>
  screenFacts({ files, file: 'src/screens/Feed.tsx' })!;

describe('the queries line of a screen fact', () => {
  it('a query a screen runs through its own hook is named by its operation name', () => {
    const facts = factsOf([
      {
        path: 'src/screens/Feed.tsx',
        text: `
import React from 'react';
import { useFeed } from '../hooks/useFeed';
export default function Feed() {
  const { items } = useFeed();
  return <div>{items.length}</div>;
}
`,
      },
      {
        path: 'src/hooks/useFeed.ts',
        text: `
import { gql, useQuery } from '@apollo/client';
import { useLikeProfile } from './useLikeProfile';
const FEED = gql\`
  query FeedProfiles($first: Int) { profiles(first: $first) { id } }
\`;
export function useFeed() {
  const like = useLikeProfile();
  const { data } = useQuery(FEED);
  return { items: data?.profiles ?? [], like };
}
`,
      },
      {
        path: 'src/hooks/useLikeProfile.ts',
        text: `
import { gql, useMutation } from '@apollo/client';
import { BLOCK_PROFILE } from '../graphql/operations';
export const useLikeProfile = () => useMutation(gql\`mutation LikeProfile { like { id } }\`);
export const useBlock = () => useMutation(BLOCK_PROFILE);
`,
      },
      {
        path: 'src/graphql/operations.ts',
        text: `
import { gql } from '@apollo/client';
export const BLOCK_PROFILE = gql\`mutation BlockProfile { block { id } }\`;
export const UNUSED = gql\`query NotRunHere { unused }\`;
`,
      },
    ]);

    expect(facts.queries).toEqual(['FeedProfiles', 'LikeProfile', 'BlockProfile']);
    expect(factsLines(facts)).toContain('queries     FeedProfiles, LikeProfile, BlockProfile');
  });

  it('a generated query hook and a generated document both name their operation', () => {
    const facts = factsOf([
      {
        path: 'src/screens/Feed.tsx',
        text: `
import React from 'react';
import { useQuery, useLazyQuery } from '@apollo/client';
import { useFeedProfilesQuery, useLikeProfileMutation, ViewerDocument } from '../generated/graphql';
export default function Feed() {
  const { data } = useFeedProfilesQuery();
  const [like] = useLikeProfileMutation();
  const viewer = useQuery(ViewerDocument);
  return <div>{data?.profiles.length}</div>;
}
`,
      },
      {
        path: 'src/generated/graphql.ts',
        text: `
import { gql } from '@apollo/client';
export const FeedProfilesDocument = gql\`query FeedProfiles { profiles { id } }\`;
export const ViewerDocument = gql\`query Viewer { viewer { id } }\`;
export const OtherScreenDocument = gql\`query OtherScreen { other }\`;
export function useFeedProfilesQuery() {}
export function useLikeProfileMutation() {}
`,
      },
    ]);

    expect(facts.queries).toEqual(['FeedProfiles', 'LikeProfile', 'Viewer']);
  });

  it('a screen that runs no query gets no queries line', () => {
    const facts = factsOf([
      {
        path: 'src/screens/Feed.tsx',
        text: `
import React from 'react';
import { useCounter } from '../hooks/useCounter';
export default function Feed() {
  const count = useCounter();
  return <div>{count}</div>;
}
`,
      },
      {
        path: 'src/hooks/useCounter.ts',
        text: `
import { useState } from 'react';
export const useCounter = () => useState(0)[0];
`,
      },
    ]);

    expect(facts.queries).toEqual([]);
    expect(factsLines(facts).some((line) => line.startsWith('queries'))).toBe(false);
  });
});
