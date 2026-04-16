import type { AuthorSubredditKarmaBucket, ChartAuthor } from '../../shared/api';
import { createBubbleStatsDataLayer } from '../data';
import type { AuthorEntity, CommentEntity, PostEntity } from '../data';
import { createAuthorKarmaBuckets } from './author-karma';

export type AuthorChartReadOptions = {
  subredditName: string;
  startTime: number;
  endTime: number;
};

export type AuthorChartReadResult = {
  authors: ChartAuthor[];
};

export type AuthorCountReadResult = {
  authorCount: number;
};

type AuthorActivity = {
  authorName: string;
  postCount: number;
  commentCount: number;
  postScore: number;
  commentScore: number;
};

export const readAuthorsForTimeframe = async ({
  subredditName,
  startTime,
  endTime,
}: AuthorChartReadOptions): Promise<AuthorChartReadResult> => {
  const dataLayer = createBubbleStatsDataLayer(subredditName);
  const [posts, comments] = await Promise.all([
    dataLayer.posts.getInTimeRange({ startTime, endTime }),
    dataLayer.comments.getInTimeRange({ startTime, endTime }),
  ]);
  const activities = createAuthorActivities(posts, comments);
  const cachedAuthors = await dataLayer.authors.getByIds([...activities.keys()]);
  const cachedAuthorsByName = new Map(cachedAuthors.map((author) => [author.id, author]));

  return {
    authors: createChartAuthors(activities, cachedAuthorsByName),
  };
};

export const readAuthorCountForTimeframe = async ({
  subredditName,
  startTime,
  endTime,
}: AuthorChartReadOptions): Promise<AuthorCountReadResult> => {
  const dataLayer = createBubbleStatsDataLayer(subredditName);
  const [posts, comments] = await Promise.all([
    dataLayer.posts.getInTimeRange({ startTime, endTime }),
    dataLayer.comments.getInTimeRange({ startTime, endTime }),
  ]);

  return {
    authorCount: createAuthorActivities(posts, comments).size,
  };
};

export const createAuthorActivities = (
  posts: PostEntity[],
  comments: CommentEntity[]
): Map<string, AuthorActivity> => {
  const activities = new Map<string, AuthorActivity>();

  posts.forEach((post) => {
    const authorName = readChartAuthorName(post.authorName);

    if (!authorName) {
      return;
    }

    const activity = getOrCreateAuthorActivity(activities, authorName);
    activity.postCount += 1;
    activity.postScore += post.score;
  });

  comments.forEach((comment) => {
    const authorName = readChartAuthorName(comment.authorName);

    if (!authorName) {
      return;
    }

    const activity = getOrCreateAuthorActivity(activities, authorName);
    activity.commentCount += 1;
    activity.commentScore += comment.score;
  });

  return activities;
};

export const createChartAuthors = (
  activities: Map<string, AuthorActivity>,
  cachedAuthorsByName: Map<string, AuthorEntity> = new Map()
): ChartAuthor[] => {
  const authorKarmaBuckets = createAuthorKarmaBuckets(
    [...activities.keys()].flatMap((authorName) => {
      const author = cachedAuthorsByName.get(authorName);
      return author ? [author] : [];
    })
  );

  return [...activities.values()]
    .map((activity) =>
      toChartAuthor(
        activity,
        cachedAuthorsByName.get(activity.authorName),
        authorKarmaBuckets.get(activity.authorName) ?? null
      )
    )
    .sort(sortChartAuthors);
};

const toChartAuthor = (
  activity: AuthorActivity,
  author: AuthorEntity | null | undefined,
  authorSubredditKarmaBucket: AuthorSubredditKarmaBucket | null
): ChartAuthor => {
  const totalScore = activity.postScore + activity.commentScore;

  return {
    authorName: activity.authorName,
    authorAvatarUrl: author?.avatarUrl ?? null,
    authorSubredditKarmaBucket,
    postCount: activity.postCount,
    commentCount: activity.commentCount,
    postScore: activity.postScore,
    commentScore: activity.commentScore,
    totalScore,
    profileUrl: `/user/${encodeURIComponent(activity.authorName)}/`,
  };
};

const getOrCreateAuthorActivity = (
  activities: Map<string, AuthorActivity>,
  authorName: string
): AuthorActivity => {
  const existing = activities.get(authorName);

  if (existing) {
    return existing;
  }

  const created: AuthorActivity = {
    authorName,
    postCount: 0,
    commentCount: 0,
    postScore: 0,
    commentScore: 0,
  };

  activities.set(authorName, created);
  return created;
};

const readChartAuthorName = (authorName: string): string | null => {
  const trimmed = authorName.trim();

  return trimmed === '' || trimmed.toLowerCase() === '[deleted]' ? null : trimmed;
};

const sortChartAuthors = (a: ChartAuthor, b: ChartAuthor): number =>
  b.postCount + b.commentCount - (a.postCount + a.commentCount) ||
  b.totalScore - a.totalScore ||
  a.authorName.localeCompare(b.authorName);
