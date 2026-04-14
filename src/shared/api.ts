export type TimeframePostData = {
  type: 'bubble-stats-timeframe';
  startDate: string;
  endDate: string;
  startIso: string;
  endIso: string;
  createdAt: string;
  dataSourceSubredditName?: string;
};

export type ChartPost = {
  id: string;
  title: string;
  authorName: string;
  authorAvatarUrl: string | null;
  comments: number;
  score: number;
  authorSubredditKarma: number | null;
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
