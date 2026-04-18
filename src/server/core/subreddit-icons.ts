import { reddit, redis } from '@devvit/web/server';
import { createLogger } from '../logging/logger';
import {
  normalizeSubredditName,
  TEST_DATA_SOURCE_SUBREDDIT_NAME,
} from './subreddits';

const logger = createLogger('subreddit-icons');
const SUBREDDIT_ICON_URL_KEY_PREFIX = 'bubble-stats:subreddits:icon-url';
const TEST_DATA_SOURCE_SUBREDDIT_ICON_URL =
  'https://styles.redditmedia.com/t5_4x7l6b/styles/communityIcon_tofdifo8b35f1.png?width=128&frame=1&auto=webp&s=d847af3d81a242af471946e2aff1f26e9692f35b';

export type SubredditIconRefreshResult = {
  subredditName: string;
  subredditIconUrl: string | null;
  fetchedAt: string;
};

export const readCachedSubredditIconUrl = async (
  subredditName: string
): Promise<string | null> => {
  const normalizedSubredditName = normalizeSubredditName(subredditName);

  if (normalizedSubredditName === TEST_DATA_SOURCE_SUBREDDIT_NAME) {
    return TEST_DATA_SOURCE_SUBREDDIT_ICON_URL;
  }

  const iconUrl = await redis.hGet(
    getSubredditIconUrlKey(normalizedSubredditName),
    'subredditIconUrl'
  );
  return normalizeStoredIconUrl(iconUrl);
};

export const refreshCurrentSubredditIconCache = async (
  subredditName: string
): Promise<SubredditIconRefreshResult> => {
  const normalizedSubredditName = normalizeSubredditName(subredditName);
  logger.info('Refreshing subreddit icon cache', {
    subredditName: normalizedSubredditName,
  });

  try {
    const fetchedAt = new Date().toISOString();
    const subredditIconUrl = await fetchSubredditIconUrl(
      normalizedSubredditName
    );

    await redis.hSet(getSubredditIconUrlKey(normalizedSubredditName), {
      subredditIconUrl: subredditIconUrl ?? '',
    });

    logger.info('Stored subreddit icon cache entry', {
      subredditName: normalizedSubredditName,
      hasSubredditIconUrl: subredditIconUrl !== null,
      fetchedAt,
    });

    return {
      subredditName: normalizedSubredditName,
      subredditIconUrl,
      fetchedAt,
    };
  } catch (error) {
    logger.error('Subreddit icon cache refresh failed', {
      subredditName: normalizedSubredditName,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

const fetchSubredditIconUrl = async (
  subredditName: string
): Promise<string | null> => {
  if (subredditName === TEST_DATA_SOURCE_SUBREDDIT_NAME) {
    logger.debug('Using test data source subreddit icon', { subredditName });
    return TEST_DATA_SOURCE_SUBREDDIT_ICON_URL;
  }

  logger.debug('Fetching subreddit icon from Reddit', { subredditName });
  const subreddit = await reddit.getSubredditInfoByName(subredditName);

  if (!subreddit.id) {
    logger.warn('Subreddit info did not include an id', { subredditName });
    return null;
  }

  const styles = await reddit.getSubredditStyles(subreddit.id);
  return normalizeFetchedIconUrl(styles.icon);
};

const normalizeFetchedIconUrl = (
  iconUrl: string | undefined
): string | null => {
  const normalized = iconUrl?.trim().replaceAll('&amp;', '&') ?? '';

  return normalized === '' ? null : normalized;
};

const normalizeStoredIconUrl = (iconUrl: string | undefined): string | null => {
  if (iconUrl === undefined || iconUrl === '') {
    return null;
  }

  return iconUrl;
};

const getSubredditIconUrlKey = (subredditName: string): string =>
  `${SUBREDDIT_ICON_URL_KEY_PREFIX}:${normalizeSubredditName(subredditName)}`;

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
