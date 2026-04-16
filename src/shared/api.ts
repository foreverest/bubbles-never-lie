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

export type ChartComment = {
  id: string;
  postId: string;
  authorName: string;
  authorAvatarUrl: string | null;
  score: number;
  bodyPreview: string;
  createdAt: string;
  permalink: string;
};

export type ChartAuthor = {
  authorName: string;
  authorAvatarUrl: string | null;
  postCount: number;
  commentCount: number;
  postScore: number;
  commentScore: number;
  totalScore: number;
  profileUrl: string;
};

export type ChartResponseMetadata = {
  subredditName: string;
  subredditIconUrl: string | null;
  timeframe: TimeframePostData;
  generatedAt: string;
};

export type PostsChartDataResponse = ChartResponseMetadata & {
  type: 'posts-chart-data';
  posts: ChartPost[];
};

export type CommentsChartDataResponse = ChartResponseMetadata & {
  type: 'comments-chart-data';
  comments: ChartComment[];
};

export type AuthorsChartDataResponse = ChartResponseMetadata & {
  type: 'authors-chart-data';
  authors: ChartAuthor[];
};

export type StatsDataResponse = {
  type: 'stats-data';
  postCount: number;
  commentCount: number;
};

export type ErrorResponse = {
  status: 'error';
  message: string;
};
