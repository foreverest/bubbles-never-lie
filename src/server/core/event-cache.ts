import { context } from '@devvit/web/server';
import type {
  CommentV2,
  OnCommentCreateRequest,
  OnPostCreateRequest,
  PostV2,
  SubredditV2,
  UserV2,
} from '@devvit/web/shared';
import { createDataLayer, type DataLayer } from '../data';
import type { CommentEntity, PostEntity } from '../data';
import { createLogger } from '../logging/logger';
import {
  readRefreshableContributorName,
  refreshContributorMetadata,
} from './contributor-cache';
import { createCommentBodyPreviewText } from './comment-cache';
import { normalizeSubredditName } from './subreddits';

const logger = createLogger('event-cache');
const SECONDS_TIMESTAMP_THRESHOLD = 10_000_000_000;

type EventDataLayer = Pick<DataLayer, 'posts' | 'comments'>;

type EventContributorRefreshOptions = {
  subredditName: string;
  username: string;
};

type EventContributorRefresh = (
  options: EventContributorRefreshOptions
) => Promise<number>;

export type EventCacheDependencies = {
  createDataLayerForSubreddit?: (subredditName: string) => EventDataLayer;
  refreshContributor?: EventContributorRefresh;
  currentSubredditName?: string;
  now?: () => Date;
};

export type EventCacheResult = {
  status: 'cached' | 'skipped';
  subredditName: string;
  cachedPostCount: number;
  cachedCommentCount: number;
  refreshedContributorCount: number;
  generatedAt: string;
  skippedReason?: string;
};

export const cachePostCreateEvent = async (
  input: OnPostCreateRequest,
  {
    createDataLayerForSubreddit = createDataLayer,
    refreshContributor = refreshEventContributor,
    currentSubredditName = context.subredditName,
    now = () => new Date(),
  }: EventCacheDependencies = {}
): Promise<EventCacheResult> => {
  const subredditName = resolveEventSubredditName(
    input.subreddit,
    currentSubredditName
  );
  const post = createPostEntityFromEvent(input.post, input.author);

  if (!post) {
    return createSkippedEventCacheResult({
      subredditName,
      skippedReason: 'missing_or_invalid_post_payload',
      now,
    });
  }

  const dataLayer = createDataLayerForSubreddit(subredditName);

  await dataLayer.posts.upsert(post);

  const refreshedContributorCount = await refreshContributorForAuthor({
    subredditName,
    authorName: post.authorName,
    refreshContributor,
  });

  return {
    status: 'cached',
    subredditName,
    cachedPostCount: 1,
    cachedCommentCount: 0,
    refreshedContributorCount,
    generatedAt: now().toISOString(),
  };
};

export const cacheCommentCreateEvent = async (
  input: OnCommentCreateRequest,
  {
    createDataLayerForSubreddit = createDataLayer,
    refreshContributor = refreshEventContributor,
    currentSubredditName = context.subredditName,
    now = () => new Date(),
  }: EventCacheDependencies = {}
): Promise<EventCacheResult> => {
  const subredditName = resolveEventSubredditName(
    input.subreddit,
    currentSubredditName
  );
  const comment = createCommentEntityFromEvent(
    input.comment,
    input.post,
    input.author
  );

  if (!comment) {
    return createSkippedEventCacheResult({
      subredditName,
      skippedReason: 'missing_or_invalid_comment_payload',
      now,
    });
  }

  const dataLayer = createDataLayerForSubreddit(subredditName);
  const [parentPostCached] = await Promise.all([
    upsertExistingParentPostFromEvent(input.post, dataLayer),
    dataLayer.comments.upsert(comment),
  ]);
  const refreshedContributorCount = await refreshContributorForAuthor({
    subredditName,
    authorName: comment.authorName,
    refreshContributor,
  });

  return {
    status: 'cached',
    subredditName,
    cachedPostCount: parentPostCached ? 1 : 0,
    cachedCommentCount: 1,
    refreshedContributorCount,
    generatedAt: now().toISOString(),
  };
};

const refreshEventContributor: EventContributorRefresh = async ({
  subredditName,
  username,
}) => {
  const result = await refreshContributorMetadata(subredditName, username);

  return result.refreshedContributorCount;
};

const refreshContributorForAuthor = async ({
  subredditName,
  authorName,
  refreshContributor,
}: {
  subredditName: string;
  authorName: string;
  refreshContributor: EventContributorRefresh;
}): Promise<number> => {
  const username = readRefreshableContributorName(authorName);

  if (!username) {
    return 0;
  }

  try {
    return await refreshContributor({ subredditName, username });
  } catch (error) {
    logger.warn('Contributor metadata refresh failed after event cache write', {
      subredditName,
      username,
      error: getErrorMessage(error),
    });

    return 0;
  }
};

const createPostEntityFromEvent = (
  post: PostV2 | undefined,
  author: UserV2 | undefined
): PostEntity | null => {
  if (!post) {
    return null;
  }

  const id = normalizeThingId(post.id, 't3_');
  const title = readRequiredText(post.title);
  const authorName = readRequiredText(author?.name);
  const createdAt = readEventCreatedAt(post.createdAt);
  const permalink = readRequiredText(post.permalink);
  const comments = readFiniteNumber(post.numComments);
  const score = readFiniteNumber(post.score);

  if (
    !id ||
    !title ||
    !authorName ||
    !createdAt ||
    !permalink ||
    comments === null ||
    score === null
  ) {
    return null;
  }

  return {
    id,
    title,
    authorName,
    comments,
    score,
    createdAt,
    permalink,
  };
};

const createCommentEntityFromEvent = (
  comment: CommentV2 | undefined,
  post: PostV2 | undefined,
  author: UserV2 | undefined
): CommentEntity | null => {
  if (!comment) {
    return null;
  }

  const id = normalizeThingId(comment.id, 't1_');
  const postId =
    normalizeThingId(comment.postId, 't3_') ??
    normalizeThingId(post?.id, 't3_');
  const authorName =
    readRequiredText(comment.author) ?? readRequiredText(author?.name);
  const createdAt = readEventCreatedAt(comment.createdAt);
  const permalink = readRequiredText(comment.permalink);
  const score = readFiniteNumber(comment.score);

  if (
    !id ||
    !postId ||
    !authorName ||
    !createdAt ||
    !permalink ||
    score === null
  ) {
    return null;
  }

  return {
    id,
    postId,
    authorName,
    score,
    bodyPreview: createCommentBodyPreviewText(comment.body ?? ''),
    createdAt,
    permalink,
  };
};

const upsertExistingParentPostFromEvent = async (
  post: PostV2 | undefined,
  dataLayer: EventDataLayer
): Promise<boolean> => {
  if (!post) {
    return false;
  }

  const id = normalizeThingId(post.id, 't3_');

  if (!id) {
    return false;
  }

  const existingPost = await dataLayer.posts.getById(id);

  if (!existingPost) {
    return false;
  }

  await dataLayer.posts.upsert({
    ...existingPost,
    title: readRequiredText(post.title) ?? existingPost.title,
    comments: readFiniteNumber(post.numComments) ?? existingPost.comments,
    score: readFiniteNumber(post.score) ?? existingPost.score,
    createdAt: readEventCreatedAt(post.createdAt) ?? existingPost.createdAt,
    permalink: readRequiredText(post.permalink) ?? existingPost.permalink,
  });

  return true;
};

const createSkippedEventCacheResult = ({
  subredditName,
  skippedReason,
  now,
}: {
  subredditName: string;
  skippedReason: string;
  now: () => Date;
}): EventCacheResult => ({
  status: 'skipped',
  subredditName,
  cachedPostCount: 0,
  cachedCommentCount: 0,
  refreshedContributorCount: 0,
  generatedAt: now().toISOString(),
  skippedReason,
});

const resolveEventSubredditName = (
  subreddit: SubredditV2 | undefined,
  currentSubredditName: string
): string =>
  normalizeSubredditName(
    readRequiredText(subreddit?.name) ?? currentSubredditName
  );

const normalizeThingId = (
  value: string | null | undefined,
  prefix: 't1_' | 't3_'
): string | null => {
  const trimmed = value?.trim() ?? '';

  if (trimmed === '') {
    return null;
  }

  if (trimmed.startsWith(prefix)) {
    return trimmed;
  }

  if (/^t\d_/.test(trimmed)) {
    return null;
  }

  return `${prefix}${trimmed}`;
};

const readEventCreatedAt = (timestamp: number): string | null => {
  if (!Number.isFinite(timestamp)) {
    return null;
  }

  const timestampMs =
    Math.abs(timestamp) < SECONDS_TIMESTAMP_THRESHOLD
      ? timestamp * 1000
      : timestamp;
  const date = new Date(timestampMs);

  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const readRequiredText = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim() ?? '';

  return trimmed === '' ? null : trimmed;
};

const readFiniteNumber = (value: number): number | null =>
  Number.isFinite(value) ? value : null;

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
