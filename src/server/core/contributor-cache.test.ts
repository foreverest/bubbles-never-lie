import { reddit } from '@devvit/web/server';
import { beforeEach, expect, test, vi } from 'vitest';
import type { ContributorEntity, ContributorRepository } from '../data';
import { refreshContributorMetadata } from './contributor-cache';

vi.mock('@devvit/web/server', () => ({
  context: {
    subredditName: 'ExampleSub',
  },
  reddit: {
    getUserKarmaFromCurrentSubreddit: vi.fn(),
    getSnoovatarUrl: vi.fn(),
  },
}));

beforeEach(() => {
  vi.mocked(reddit.getUserKarmaFromCurrentSubreddit).mockReset();
  vi.mocked(reddit.getSnoovatarUrl).mockReset();
  vi.mocked(reddit.getSnoovatarUrl).mockResolvedValue(
    'https://example.com/avatar.png'
  );
});

test('refreshContributorMetadata uses synthetic karma for non-current subreddits', async () => {
  const storedContributors: ContributorEntity[] = [];
  let upsertCount = 0;

  await refreshContributorMetadata('OtherSub', 'alice', {
    currentSubredditName: 'ExampleSub',
    createDataLayerForSubreddit: () => ({
      contributors: createContributorRepository(async (contributor) => {
        storedContributors.push(contributor);
        upsertCount += 1;
      }),
    }),
    now: () => new Date('2026-04-15T12:00:00.000Z'),
  });

  expect(reddit.getUserKarmaFromCurrentSubreddit).not.toHaveBeenCalled();
  expect(upsertCount).toBe(1);

  const contributor = storedContributors[0];

  expect(contributor).toMatchObject({
    id: 'alice',
    avatarUrl: 'https://example.com/avatar.png',
    fetchedAt: '2026-04-15T12:00:00.000Z',
  });

  if (!contributor) {
    throw new Error('Expected contributor to be stored.');
  }

  expect(typeof contributor.subredditKarma).toBe('number');
});

test('refreshContributorMetadata uses real subreddit karma for the current subreddit', async () => {
  const storedContributors: ContributorEntity[] = [];

  vi.mocked(reddit.getUserKarmaFromCurrentSubreddit).mockResolvedValue({
    fromPosts: 7,
    fromComments: 5,
  });

  await refreshContributorMetadata('ExampleSub', 'alice', {
    currentSubredditName: 'ExampleSub',
    createDataLayerForSubreddit: () => ({
      contributors: createContributorRepository(async (contributor) => {
        storedContributors.push(contributor);
      }),
    }),
    now: () => new Date('2026-04-15T12:00:00.000Z'),
  });

  expect(reddit.getUserKarmaFromCurrentSubreddit).toHaveBeenCalledWith('alice');

  const contributor = storedContributors[0];

  if (!contributor) {
    throw new Error('Expected contributor to be stored.');
  }

  expect(contributor.subredditKarma).toBe(12);
});

const createContributorRepository = (
  onUpsert: (contributor: ContributorEntity) => Promise<void>
): ContributorRepository => ({
  getById: async () => null,
  getByIds: async () => [],
  upsert: async (contributor) => {
    await onUpsert(contributor);
  },
  upsertMany: async () => {},
});
