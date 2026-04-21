const DEV_SUBREDDIT_NAME = 'bubblesneverlie_dev';

type AppEnvironmentName = 'development' | 'production';

type AppEnvironmentConfig = {
  activeRefreshSubredditName?: string;
};

// Devvit does not pass local shell env vars into the execution context, so
// keep the per-environment refresh-source config in code.
const APP_ENVIRONMENTS: Record<AppEnvironmentName, AppEnvironmentConfig> = {
  development: {
    activeRefreshSubredditName: 'wallstreetbets',
  },
  production: {},
};

export const normalizeSubredditName = (subredditName: string): string =>
  subredditName.trim().replace(/^r\//i, '').toLowerCase();

export const normalizeOptionalSubredditName = (
  subredditName: string | undefined
): string | undefined => {
  const trimmedSubredditName = subredditName?.trim() ?? '';

  return trimmedSubredditName === ''
    ? undefined
    : normalizeSubredditName(trimmedSubredditName);
};

export const isDevSubreddit = (subredditName: string): boolean =>
  normalizeSubredditName(subredditName) === DEV_SUBREDDIT_NAME;

export const canConfigurePostDataSource = (subredditName: string): boolean =>
  isDevSubreddit(subredditName);

export const resolveAppEnvironmentName = (
  currentSubredditName: string
): AppEnvironmentName =>
  isDevSubreddit(currentSubredditName) ? 'development' : 'production';

export const resolveActiveRefreshSubredditName = (
  currentSubredditName: string,
  overrideSubredditName = APP_ENVIRONMENTS[
    resolveAppEnvironmentName(currentSubredditName)
  ].activeRefreshSubredditName
): string => {
  const normalizedCurrentSubredditName =
    normalizeSubredditName(currentSubredditName);

  if (!isDevSubreddit(currentSubredditName)) {
    return normalizedCurrentSubredditName;
  }

  return (
    normalizeOptionalSubredditName(overrideSubredditName) ??
    normalizedCurrentSubredditName
  );
};

export const resolveChartDataSubredditName = (
  currentSubredditName: string,
  dataSourceSubredditName: string | undefined
): string => {
  const normalizedCurrentSubredditName =
    normalizeSubredditName(currentSubredditName);

  if (!isDevSubreddit(currentSubredditName)) {
    return normalizedCurrentSubredditName;
  }

  return (
    normalizeOptionalSubredditName(dataSourceSubredditName) ??
    normalizedCurrentSubredditName
  );
};

export const shouldUseSyntheticContributorKarma = (
  currentSubredditName: string,
  subredditName: string
): boolean =>
  normalizeSubredditName(subredditName) !==
  normalizeSubredditName(currentSubredditName);
