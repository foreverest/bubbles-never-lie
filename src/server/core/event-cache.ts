import { context, reddit } from '@devvit/web/server';
import type {
  CommentV2,
  OnCommentCreateRequest,
  OnPostCreateRequest,
  PostV2,
  SubredditV2,
  T2,
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

type EventUsernameResolver = (authorId: T2) => Promise<string | null>;

export type EventCacheDependencies = {
  createDataLayerForSubreddit?: (subredditName: string) => EventDataLayer;
  refreshContributor?: EventContributorRefresh;
  resolveUsernameById?: EventUsernameResolver;
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
    resolveUsernameById = resolveEventUsernameById,
    currentSubredditName = context.subredditName,
    now = () => new Date(),
  }: EventCacheDependencies = {}
): Promise<EventCacheResult> => {
  const subredditName = resolveEventSubredditName(
    input.subreddit,
    currentSubredditName
  );
  const post = await createPostEntityFromEvent(
    input.post,
    input.author,
    resolveUsernameById
  );

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
    resolveUsernameById = resolveEventUsernameById,
    currentSubredditName = context.subredditName,
    now = () => new Date(),
  }: EventCacheDependencies = {}
): Promise<EventCacheResult> => {
  const subredditName = resolveEventSubredditName(
    input.subreddit,
    currentSubredditName
  );
  const comment = await createCommentEntityFromEvent(
    input.comment,
    input.post,
    input.author,
    resolveUsernameById
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

const resolveEventUsernameById: EventUsernameResolver = async (authorId) => {
  const user = await reddit.getUserById(authorId);

  return user?.username ?? null;
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
  author: UserV2 | undefined,
  resolveUsernameById: EventUsernameResolver
): Promise<PostEntity | null> => {
  if (!post) {
    return Promise.resolve(null);
  }

  return createPostEntityFromValidEvent(post, author, resolveUsernameById);
};

const createPostEntityFromValidEvent = async (
  post: PostV2,
  author: UserV2 | undefined,
  resolveUsernameById: EventUsernameResolver
): Promise<PostEntity | null> => {
  const id = normalizeThingId(post.id, 't3_');
  const title = readRequiredText(post.title);
  const authorName = await resolveEventAuthorName({
    candidates: [author?.name],
    authorIds: [author?.id, post.authorId],
    resolveUsernameById,
  });
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

const createCommentEntityFromEvent = async (
  comment: CommentV2 | undefined,
  post: PostV2 | undefined,
  author: UserV2 | undefined,
  resolveUsernameById: EventUsernameResolver
): Promise<CommentEntity | null> => {
  if (!comment) {
    return null;
  }

  const id = normalizeThingId(comment.id, 't1_');
  const postId =
    normalizeThingId(comment.postId, 't3_') ??
    normalizeThingId(post?.id, 't3_');
  const authorName = await resolveEventAuthorName({
    candidates: [author?.name, comment.author],
    authorIds: [author?.id],
    resolveUsernameById,
  });
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

const resolveEventAuthorName = async ({
  candidates,
  authorIds,
  resolveUsernameById,
}: {
  candidates: Array<string | undefined>;
  authorIds: Array<string | undefined>;
  resolveUsernameById: EventUsernameResolver;
}): Promise<string | null> => {
  for (const candidate of candidates) {
    const normalizedCandidate = readRequiredText(candidate);

    if (!normalizedCandidate) {
      continue;
    }

    if (!isThingId(normalizedCandidate)) {
      return normalizedCandidate;
    }

    if (isAccountId(normalizedCandidate)) {
      const username = await tryResolveUsernameById(
        normalizedCandidate,
        resolveUsernameById
      );

      if (username) {
        return username;
      }
    }
  }

  for (const authorId of authorIds) {
    const normalizedAuthorId = readRequiredText(authorId);

    if (!isAccountId(normalizedAuthorId)) {
      continue;
    }

    const username = await tryResolveUsernameById(
      normalizedAuthorId,
      resolveUsernameById
    );

    if (username) {
      return username;
    }
  }

  return null;
};

const tryResolveUsernameById = async (
  authorId: T2,
  resolveUsernameById: EventUsernameResolver
): Promise<string | null> => {
  try {
    return readRequiredText(await resolveUsernameById(authorId));
  } catch (error) {
    logger.warn('Unable to resolve event author username by id', {
      authorId,
      error: getErrorMessage(error),
    });

    return null;
  }
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

const isThingId = (value: string): boolean => /^t\d_/.test(value);

const isAccountId = (value: string | null): value is T2 =>
  value?.startsWith('t2_') ?? false;

const readFiniteNumber = (value: number): number | null =>
  Number.isFinite(value) ? value : null;

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
