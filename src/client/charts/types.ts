import type { SubredditKarmaBucket } from '../../shared/api';

export type CurrentUserDatumFields = {
  isCurrentUser: boolean;
};

export type PostBubbleDatum = {
  kind: 'post';
  value: [createdAtTime: number, score: number];
  score: number;
  comments: number;
  authorSubredditKarmaBucket: SubredditKarmaBucket | null;
  title: string;
  authorName: string;
  authorAvatarUrl: string | null;
  createdAt: string;
  permalink: string;
} & CurrentUserDatumFields;

export type CommentBubbleDatum = {
  kind: 'comment';
  value: [createdAtTime: number, score: number];
  score: number;
  bodyPreview: string;
  authorName: string;
  authorAvatarUrl: string | null;
  createdAt: string;
  permalink: string;
  postId: string;
} & CurrentUserDatumFields;

export type ContributorBubbleDatum = {
  kind: 'contributor';
  value: [commentScore: number, postScore: number, contributionCount: number];
  contributorName: string;
  contributorAvatarUrl: string | null;
  contributorSubredditKarmaBucket: SubredditKarmaBucket | null;
  postCount: number;
  commentCount: number;
  contributionCount: number;
  postScore: number;
  commentScore: number;
  profileUrl: string;
} & CurrentUserDatumFields;

export type CommentGroup = {
  postId: string;
  comments: CommentBubbleDatum[];
};

export type TimeRange = {
  start: number;
  end: number;
};

export type ChartEventParams = { data?: unknown };
export type GetVisibleTimeRange = () => TimeRange | null;
export type SymbolSizeOption =
  | number
  | ((_value: unknown, params?: ChartEventParams) => number);
export type RippleColorOption = string | ((params: ChartEventParams) => string);
