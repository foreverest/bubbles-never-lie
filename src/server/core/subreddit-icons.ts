import { reddit, redis } from '@devvit/web/server';
import { createLogger } from '../logging/logger';
import { normalizeSubredditName } from './subreddits';

const logger = createLogger('subreddit-icons');
const SUBREDDIT_ICON_URL_KEY_PREFIX = 'subreddits:icon-url';

export type SubredditIconRefreshResult = {
  subredditName: string;
  subredditIconUrl: string | null;
  fetchedAt: string;
};

export const readCachedSubredditIconUrl = async (
  subredditName: string
): Promise<string | null> => {
  const normalizedSubredditName = normalizeSubredditName(subredditName);
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
