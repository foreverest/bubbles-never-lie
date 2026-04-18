export const SUBREDDIT_KARMA_BUCKET_COUNT = 10;
export const USER_AVATAR_FALLBACK_URL =
  'https://www.redditstatic.com/avatars/defaults/v2/avatar_default_4.png';

export const resolveUserAvatarUrl = (avatarUrl: string | null | undefined): string =>
  avatarUrl?.trim() ? avatarUrl : USER_AVATAR_FALLBACK_URL;

export type SubredditKarmaBucket = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export type TimeframePostData = {
  type: 'bubble-stats-timeframe';
  startDate: string;
  endDate: string;
  startIso: string;
  endIso: string;
  createdAt: string;
  timeZone: string;
  durationDays: number;
  dataSourceSubredditName?: string;
};

export type ChartPost = {
  id: string;
  title: string;
  authorName: string;
  authorAvatarUrl: string | null;
  comments: number;
  score: number;
  authorSubredditKarmaBucket: SubredditKarmaBucket | null;
  createdAt: string;
  permalink: string;
};

export type CommentBodyPreviewKind = 'text' | 'gif' | 'image';

export type ChartComment = {
  id: string;
  postId: string;
  authorName: string;
  authorAvatarUrl: string | null;
  score: number;
  bodyPreview: string;
  bodyPreviewKind: CommentBodyPreviewKind;
  createdAt: string;
  permalink: string;
};

export type ChartContributor = {
  contributorName: string;
  contributorAvatarUrl: string | null;
  contributorSubredditKarmaBucket: SubredditKarmaBucket | null;
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

export type ContributorsChartDataResponse = ChartResponseMetadata & {
  type: 'contributors-chart-data';
  contributors: ChartContributor[];
};

export type StatsDataResponse = {
  type: 'stats-data';
  postCount: number;
  commentCount: number;
  contributorCount: number;
};

export type ErrorResponse = {
  status: 'error';
  message: string;
};
