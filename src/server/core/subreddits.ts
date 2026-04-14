const DEV_SUBREDDIT_NAME = 'bubble_stats_dev';
export const TEST_DATA_SOURCE_SUBREDDIT_NAME = 'redditstock';

export const normalizeSubredditName = (subredditName: string): string =>
  subredditName.trim().replace(/^r\//i, '').toLowerCase();

export const isDevSubreddit = (subredditName: string): boolean =>
  normalizeSubredditName(subredditName) === DEV_SUBREDDIT_NAME;

export const canUseTestDataSource = (subredditName: string): boolean =>
  isDevSubreddit(subredditName);

export const getCacheRefreshSubredditNames = (subredditName: string): string[] => {
  const normalizedSubredditName = normalizeSubredditName(subredditName);

  return isDevSubreddit(subredditName)
    ? [normalizedSubredditName, TEST_DATA_SOURCE_SUBREDDIT_NAME]
    : [normalizedSubredditName];
};

export const resolveChartDataSubredditName = (
  currentSubredditName: string,
  dataSourceSubredditName: string | undefined
): string => {
  const normalizedSubredditName = normalizeSubredditName(currentSubredditName);

  return canUseTestDataSource(currentSubredditName) &&
    dataSourceSubredditName === TEST_DATA_SOURCE_SUBREDDIT_NAME
    ? TEST_DATA_SOURCE_SUBREDDIT_NAME
    : normalizedSubredditName;
};

export const shouldUseSyntheticAuthorKarma = (subredditName: string): boolean =>
  normalizeSubredditName(subredditName) === TEST_DATA_SOURCE_SUBREDDIT_NAME;
