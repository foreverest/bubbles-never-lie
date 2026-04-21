import { context, reddit, redis } from '@devvit/web/server';
import { resolveUserAvatarUrl } from '../../shared/api';
import { createDataLayer, getDataKeys } from '../data';
import type {
  ContributorEntity,
  CommentEntity,
  DataLayer,
  PostEntity,
} from '../data';
import { createLogger } from '../logging/logger';
import { shouldUseSyntheticContributorKarma } from './subreddits';

const logger = createLogger('contributor-cache');
const DAY_MS = 24 * 60 * 60 * 1000;
const CONTRIBUTOR_LOOKBACK_MS = 90 * DAY_MS;
export const CONTRIBUTOR_REFRESH_QUEUE_WORKER_DURATION_MS = 25 * 1000;
const SYNTHETIC_KARMA_MIN = -100;
const SYNTHETIC_KARMA_MAX = 50_000;
const REDIS_QUEUE_CHUNK_SIZE = 100;

type ContributorRefreshQueueRedisClient = Pick<
  typeof redis,
  'del' | 'zAdd' | 'zRange' | 'zRem'
>;

type ContributorQueueSeedCandidate = {
  username: string;
  lastContributionTimeMs: number;
};

type ContributorQueueItem =
  | {
      kind: 'valid';
      username: string;
    }
  | {
      kind: 'invalid';
      member: string;
    };

export type ContributorCacheRefreshResult = {
  candidateContributorCount: number;
  enqueuedContributorCount: number;
  generatedAt: string;
};

export type ContributorCacheQueueProcessOptions = {
  subredditName: string;
  maxDurationMs?: number;
};

export type ContributorCacheQueueProcessResult = {
  processedContributorCount: number;
  refreshedContributorCount: number;
  failedItemCount: number;
  invalidQueueItemCount: number;
  queueEmpty: boolean;
  generatedAt: string;
};

export type ContributorMetadataRefreshResult = {
  refreshedContributorCount: number;
  generatedAt: string;
};

export type ContributorCacheDependencies = {
  createDataLayerForSubreddit?: (
    subredditName: string
  ) => Pick<DataLayer, 'posts' | 'comments'>;
  redisClient?: ContributorRefreshQueueRedisClient;
  now?: () => Date;
};

export type ContributorMetadataRefreshDependencies = {
  createDataLayerForSubreddit?: (
    subredditName: string
  ) => Pick<DataLayer, 'contributors'>;
  currentSubredditName?: string;
  now?: () => Date;
};

export type ContributorCacheQueueProcessDependencies = {
  redisClient?: ContributorRefreshQueueRedisClient;
  refreshContributorMetadataForUser?: (
    subredditName: string,
    username: string,
    dependencies: ContributorMetadataRefreshDependencies
  ) => Promise<ContributorMetadataRefreshResult>;
  createDataLayerForSubreddit?: (
    subredditName: string
  ) => Pick<DataLayer, 'contributors'>;
  currentSubredditName?: string;
  now?: () => number;
};

export const refreshContributorCache = async (
  subredditName: string,
  {
    createDataLayerForSubreddit = createDataLayer,
    redisClient = redis,
    now = () => new Date(),
  }: ContributorCacheDependencies = {}
): Promise<ContributorCacheRefreshResult> => {
  logger.info('Seeding contributor cache refresh queue', { subredditName });

  try {
    const dataLayer = createDataLayerForSubreddit(subredditName);
    const fetchedAt = now();
    const [posts, comments] = await Promise.all([
      dataLayer.posts.getInTimeRange({
        startTime: fetchedAt.getTime() - CONTRIBUTOR_LOOKBACK_MS,
        endTime: fetchedAt.getTime() + DAY_MS,
      }),
      dataLayer.comments.getInTimeRange({
        startTime: fetchedAt.getTime() - CONTRIBUTOR_LOOKBACK_MS,
        endTime: fetchedAt.getTime() + DAY_MS,
      }),
    ]);
    const candidates = createContributorQueueSeedCandidates(posts, comments);
    const queueKey = getContributorRefreshQueueKey(subredditName);

    await redisClient.del(queueKey);

    const enqueuedContributorCount = await enqueueContributorQueueItems(
      redisClient,
      queueKey,
      candidates.map(({ username }) => username)
    );
    const result = {
      candidateContributorCount: candidates.length,
      enqueuedContributorCount,
      generatedAt: fetchedAt.toISOString(),
    };

    logger.info('Seeded contributor cache refresh queue', {
      subredditName,
      postCount: posts.length,
      commentCount: comments.length,
      candidateContributorCount: result.candidateContributorCount,
      enqueuedContributorCount: result.enqueuedContributorCount,
      generatedAt: result.generatedAt,
    });

    return result;
  } catch (error) {
    logger.error('Contributor cache refresh queue seed failed', {
      subredditName,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

export const processContributorCacheQueue = async (
  {
    subredditName,
    maxDurationMs = CONTRIBUTOR_REFRESH_QUEUE_WORKER_DURATION_MS,
  }: ContributorCacheQueueProcessOptions,
  {
    redisClient = redis,
    refreshContributorMetadataForUser = refreshContributorMetadata,
    createDataLayerForSubreddit = createDataLayer,
    currentSubredditName = context.subredditName,
    now = Date.now,
  }: ContributorCacheQueueProcessDependencies = {}
): Promise<ContributorCacheQueueProcessResult> => {
  logger.info('Processing contributor cache refresh queue', {
    subredditName,
    maxDurationMs,
  });

  const startedAt = now();
  const queueKey = getContributorRefreshQueueKey(subredditName);
  const result: ContributorCacheQueueProcessResult = {
    processedContributorCount: 0,
    refreshedContributorCount: 0,
    failedItemCount: 0,
    invalidQueueItemCount: 0,
    queueEmpty: false,
    generatedAt: new Date(startedAt).toISOString(),
  };

  try {
    while (now() - startedAt < maxDurationMs) {
      const item = await dequeueNextContributorQueueItem(redisClient, queueKey);

      if (!item) {
        result.queueEmpty = true;
        break;
      }

      if (item.kind === 'invalid') {
        result.invalidQueueItemCount += 1;
        logger.warn('Skipped invalid contributor refresh queue item', {
          subredditName,
          member: item.member,
        });
        continue;
      }

      result.processedContributorCount += 1;

      try {
        const refreshResult = await refreshContributorMetadataForUser(
          subredditName,
          item.username,
          {
            createDataLayerForSubreddit,
            currentSubredditName,
          }
        );

        result.refreshedContributorCount +=
          refreshResult.refreshedContributorCount;
      } catch (error) {
        result.failedItemCount += 1;
        logger.warn('Unable to refresh contributor metadata from queue', {
          subredditName,
          username: item.username,
          error: getErrorMessage(error),
        });
      }
    }

    result.generatedAt = new Date(now()).toISOString();

    logger.info('Processed contributor cache refresh queue', {
      subredditName,
      processedContributorCount: result.processedContributorCount,
      refreshedContributorCount: result.refreshedContributorCount,
      failedItemCount: result.failedItemCount,
      invalidQueueItemCount: result.invalidQueueItemCount,
      queueEmpty: result.queueEmpty,
      generatedAt: result.generatedAt,
    });

    return result;
  } catch (error) {
    logger.error('Contributor cache refresh queue processing failed', {
      subredditName,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

export const refreshContributorMetadata = async (
  subredditName: string,
  username: string,
  {
    createDataLayerForSubreddit = createDataLayer,
    currentSubredditName = context.subredditName,
    now = () => new Date(),
  }: ContributorMetadataRefreshDependencies = {}
): Promise<ContributorMetadataRefreshResult> => {
  const contributorName = readRefreshableContributorName(username);
  const fetchedAt = now();
  const generatedAt = fetchedAt.toISOString();

  if (!contributorName) {
    logger.info('Skipped contributor metadata refresh', {
      subredditName,
      username,
      generatedAt,
    });

    return {
      refreshedContributorCount: 0,
      generatedAt,
    };
  }

  const dataLayer = createDataLayerForSubreddit(subredditName);
  const contributor = await getContributorEntity(
    contributorName,
    fetchedAt,
    shouldUseSyntheticContributorKarma(currentSubredditName, subredditName)
  );

  await dataLayer.contributors.upsert(contributor);

  logger.info('Stored contributor metadata cache entry', {
    subredditName,
    username: contributorName,
    generatedAt,
  });

  return {
    refreshedContributorCount: 1,
    generatedAt,
  };
};

export const readRefreshableContributorName = (
  username: string
): string | null => {
  const trimmed = username.trim();

  return trimmed === '' || trimmed.toLowerCase() === '[deleted]'
    ? null
    : trimmed;
};

const getContributorEntity = async (
  username: string,
  fetchedAt: Date,
  useSyntheticContributorKarma: boolean
): Promise<ContributorEntity> => {
  const [subredditKarma, avatarUrl] = await Promise.all([
    getContributorKarma(username, useSyntheticContributorKarma),
    getContributorAvatarUrl(username),
  ]);

  logger.debug('Loaded contributor metadata', {
    username,
    hasSubredditKarma: subredditKarma !== null,
    hasAvatarUrl: avatarUrl !== resolveUserAvatarUrl(null),
  });

  return {
    id: username,
    avatarUrl,
    subredditKarma,
    fetchedAt: fetchedAt.toISOString(),
  };
};

const getContributorKarma = async (
  username: string,
  useSyntheticContributorKarma: boolean
): Promise<number | null> => {
  if (useSyntheticContributorKarma) {
    logger.debug('Using synthetic contributor karma', { username });
    return getSyntheticContributorKarma();
  }

  try {
    const karma = await reddit.getUserKarmaFromCurrentSubreddit(username);
    return sumKarma(karma);
  } catch (error) {
    logger.warn('Unable to load subreddit karma for contributor', {
      username,
      error: getErrorMessage(error),
    });
    return null;
  }
};

const getContributorAvatarUrl = async (username: string): Promise<string> => {
  try {
    return resolveUserAvatarUrl(await reddit.getSnoovatarUrl(username));
  } catch (error) {
    logger.warn('Unable to load contributor avatar', {
      username,
      error: getErrorMessage(error),
    });
    return resolveUserAvatarUrl(null);
  }
};

const createContributorQueueSeedCandidates = (
  posts: PostEntity[],
  comments: CommentEntity[]
): ContributorQueueSeedCandidate[] => {
  const latestContributionTimes = new Map<string, number>();

  [...posts, ...comments].forEach((entity) => {
    const username = readRefreshableContributorName(entity.authorName);

    if (!username) {
      return;
    }

    const createdAt = Date.parse(entity.createdAt);

    if (!Number.isFinite(createdAt)) {
      return;
    }

    const latestContributionTimeMs = latestContributionTimes.get(username);

    if (
      latestContributionTimeMs === undefined ||
      createdAt > latestContributionTimeMs
    ) {
      latestContributionTimes.set(username, createdAt);
    }
  });

  return [...latestContributionTimes.entries()]
    .map(([username, lastContributionTimeMs]) => ({
      username,
      lastContributionTimeMs,
    }))
    .sort(
      (left, right) =>
        right.lastContributionTimeMs - left.lastContributionTimeMs ||
        left.username.localeCompare(right.username)
    );
};

const getContributorRefreshQueueKey = (subredditName: string): string =>
  getDataKeys(subredditName).contributorRefreshQueue;

const enqueueContributorQueueItems = async (
  redisClient: ContributorRefreshQueueRedisClient,
  queueKey: string,
  usernames: string[]
): Promise<number> => {
  if (usernames.length === 0) {
    return 0;
  }

  let enqueuedContributorCount = 0;

  for (
    let start = 0;
    start < usernames.length;
    start += REDIS_QUEUE_CHUNK_SIZE
  ) {
    const chunk = usernames.slice(start, start + REDIS_QUEUE_CHUNK_SIZE);

    enqueuedContributorCount += await redisClient.zAdd(
      queueKey,
      ...chunk.map((member, index) => ({
        member,
        score: start + index,
      }))
    );
  }

  return enqueuedContributorCount;
};

const dequeueNextContributorQueueItem = async (
  redisClient: ContributorRefreshQueueRedisClient,
  queueKey: string
): Promise<ContributorQueueItem | null> => {
  const nextItems = await redisClient.zRange(queueKey, 0, 0, { by: 'rank' });
  const nextItem = nextItems[0];

  if (!nextItem) {
    return null;
  }

  await redisClient.zRem(queueKey, [nextItem.member]);

  const username = readRefreshableContributorName(nextItem.member);

  return username
    ? {
        kind: 'valid',
        username,
      }
    : {
        kind: 'invalid',
        member: nextItem.member,
      };
};

const getSyntheticContributorKarma = (): number =>
  randomInteger(SYNTHETIC_KARMA_MIN, SYNTHETIC_KARMA_MAX);

const randomInteger = (min: number, max: number): number =>
  Math.floor(Math.random() * (max - min + 1)) + min;

const sumKarma = (karma: GetUserKarmaForSubredditResponse): number =>
  (karma.fromPosts ?? 0) + (karma.fromComments ?? 0);

type GetUserKarmaForSubredditResponse = {
  fromPosts?: number | undefined;
  fromComments?: number | undefined;
};

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
