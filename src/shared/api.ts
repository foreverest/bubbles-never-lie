export const AUTHOR_SUBREDDIT_KARMA_BUCKET_COUNT = 10;

export type AuthorSubredditKarmaBucket = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export type TimeframePostData = {
  type: 'bubble-stats-timeframe';
  startDate: string;
  endDate: string;
  startIso: string;
  endIso: string;
  createdAt: string;
  timeZone?: string;
  startHour?: number;
  durationDays?: number;
  dataSourceSubredditName?: string;
};

export type ChartPost = {
  id: string;
  title: string;
  authorName: string;
  authorAvatarUrl: string | null;
  comments: number;
  score: number;
  authorSubredditKarmaBucket: AuthorSubredditKarmaBucket | null;
  createdAt: string;
  permalink: string;
};

export type ChartDataResponse = {
  type: 'chart-data';
  subredditName: string;
  subredditIconUrl: string | null;
  timeframe: TimeframePostData;
  generatedAt: string;
  sampledPostCount: number;
  posts: ChartPost[];
};

export type ErrorResponse = {
  status: 'error';
  message: string;
};
