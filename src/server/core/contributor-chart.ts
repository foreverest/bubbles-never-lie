import {
  resolveUserAvatarUrl,
  type SubredditKarmaBucket,
  type ChartContributor,
} from '../../shared/api';
import { createBubbleStatsDataLayer } from '../data';
import type { ContributorEntity, CommentEntity, PostEntity } from '../data';
import { createContributorKarmaBuckets } from './contributor-karma';

export type ContributorChartReadOptions = {
  subredditName: string;
  startTime: number;
  endTime: number;
};

export type ContributorChartReadResult = {
  contributors: ChartContributor[];
};

export type ContributorCountReadResult = {
  contributorCount: number;
};

type ContributorActivity = {
  contributorName: string;
  postCount: number;
  commentCount: number;
  postScore: number;
  commentScore: number;
};

export const readContributorsForTimeframe = async ({
  subredditName,
  startTime,
  endTime,
}: ContributorChartReadOptions): Promise<ContributorChartReadResult> => {
  const dataLayer = createBubbleStatsDataLayer(subredditName);
  const [posts, comments] = await Promise.all([
    dataLayer.posts.getInTimeRange({ startTime, endTime }),
    dataLayer.comments.getInTimeRange({ startTime, endTime }),
  ]);
  const activities = createContributorActivities(posts, comments);
  const cachedContributors = await dataLayer.contributors.getByIds([
    ...activities.keys(),
  ]);
  const cachedContributorsByName = new Map(
    cachedContributors.map((contributor) => [contributor.id, contributor])
  );

  return {
    contributors: createChartContributors(activities, cachedContributorsByName),
  };
};

export const readContributorCountForTimeframe = async ({
  subredditName,
  startTime,
  endTime,
}: ContributorChartReadOptions): Promise<ContributorCountReadResult> => {
  const dataLayer = createBubbleStatsDataLayer(subredditName);
  const [posts, comments] = await Promise.all([
    dataLayer.posts.getInTimeRange({ startTime, endTime }),
    dataLayer.comments.getInTimeRange({ startTime, endTime }),
  ]);

  return {
    contributorCount: createContributorActivities(posts, comments).size,
  };
};

export const createContributorActivities = (
  posts: PostEntity[],
  comments: CommentEntity[]
): Map<string, ContributorActivity> => {
  const activities = new Map<string, ContributorActivity>();

  posts.forEach((post) => {
    const contributorName = readChartContributorName(post.authorName);

    if (!contributorName) {
      return;
    }

    const activity = getOrCreateContributorActivity(
      activities,
      contributorName
    );
    activity.postCount += 1;
    activity.postScore += post.score;
  });

  comments.forEach((comment) => {
    const contributorName = readChartContributorName(comment.authorName);

    if (!contributorName) {
      return;
    }

    const activity = getOrCreateContributorActivity(
      activities,
      contributorName
    );
    activity.commentCount += 1;
    activity.commentScore += comment.score;
  });

  return activities;
};

export const createChartContributors = (
  activities: Map<string, ContributorActivity>,
  cachedContributorsByName: Map<string, ContributorEntity> = new Map()
): ChartContributor[] => {
  const contributorKarmaBuckets = createContributorKarmaBuckets(
    [...activities.keys()].flatMap((contributorName) => {
      const contributor = cachedContributorsByName.get(contributorName);
      return contributor ? [contributor] : [];
    })
  );

  return [...activities.values()]
    .map((activity) =>
      toChartContributor(
        activity,
        cachedContributorsByName.get(activity.contributorName),
        contributorKarmaBuckets.get(activity.contributorName) ?? null
      )
    )
    .sort(sortChartContributors);
};

const toChartContributor = (
  activity: ContributorActivity,
  contributor: ContributorEntity | null | undefined,
  contributorSubredditKarmaBucket: SubredditKarmaBucket | null
): ChartContributor => {
  const totalScore = activity.postScore + activity.commentScore;

  return {
    contributorName: activity.contributorName,
    contributorAvatarUrl: resolveUserAvatarUrl(contributor?.avatarUrl),
    contributorSubredditKarmaBucket,
    postCount: activity.postCount,
    commentCount: activity.commentCount,
    postScore: activity.postScore,
    commentScore: activity.commentScore,
    totalScore,
    profileUrl: `/user/${encodeURIComponent(activity.contributorName)}/`,
  };
};

const getOrCreateContributorActivity = (
  activities: Map<string, ContributorActivity>,
  contributorName: string
): ContributorActivity => {
  const existing = activities.get(contributorName);

  if (existing) {
    return existing;
  }

  const created: ContributorActivity = {
    contributorName,
    postCount: 0,
    commentCount: 0,
    postScore: 0,
    commentScore: 0,
  };

  activities.set(contributorName, created);
  return created;
};

const readChartContributorName = (username: string): string | null => {
  const trimmed = username.trim();

  return trimmed === '' || trimmed.toLowerCase() === '[deleted]'
    ? null
    : trimmed;
};

const sortChartContributors = (
  a: ChartContributor,
  b: ChartContributor
): number =>
  b.postCount + b.commentCount - (a.postCount + a.commentCount) ||
  b.totalScore - a.totalScore ||
  a.contributorName.localeCompare(b.contributorName);
