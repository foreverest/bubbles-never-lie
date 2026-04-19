import {
  SUBREDDIT_KARMA_BUCKET_COUNT,
  type ChartComment,
  type ChartContributor,
  type ChartPost,
  type SubredditKarmaBucket,
} from '../../shared/api';
import type {
  CommentBubbleDatum,
  CommentGroup,
  ContributorBubbleDatum,
  CurrentUserDatumFields,
  PostBubbleDatum,
} from './types';

export function toPostBubbleDatum(
  post: ChartPost,
  currentUsername: string | null
): PostBubbleDatum {
  return {
    kind: 'post',
    value: [Date.parse(post.createdAt), post.score],
    score: post.score,
    comments: post.comments,
    authorSubredditKarmaBucket: post.authorSubredditKarmaBucket,
    title: post.title,
    authorName: post.authorName,
    authorAvatarUrl: post.authorAvatarUrl,
    createdAt: post.createdAt,
    permalink: post.permalink,
    ...getCurrentUserDatumFields(post.authorName, currentUsername),
  };
}

export function toCommentBubbleDatum(
  comment: ChartComment,
  currentUsername: string | null
): CommentBubbleDatum {
  return {
    kind: 'comment',
    value: [Date.parse(comment.createdAt), comment.score],
    score: comment.score,
    bodyPreview: comment.bodyPreview,
    authorName: comment.authorName,
    authorAvatarUrl: comment.authorAvatarUrl,
    createdAt: comment.createdAt,
    permalink: comment.permalink,
    postId: comment.postId,
    ...getCurrentUserDatumFields(comment.authorName, currentUsername),
  };
}

export function toContributorBubbleDatum(
  contributor: ChartContributor,
  currentUsername: string | null
): ContributorBubbleDatum {
  const contributionCount = contributor.postCount + contributor.commentCount;

  return {
    kind: 'contributor',
    value: [contributor.commentScore, contributor.postScore, contributionCount],
    contributorName: contributor.contributorName,
    contributorAvatarUrl: contributor.contributorAvatarUrl,
    contributorSubredditKarmaBucket:
      contributor.contributorSubredditKarmaBucket,
    postCount: contributor.postCount,
    commentCount: contributor.commentCount,
    contributionCount,
    postScore: contributor.postScore,
    commentScore: contributor.commentScore,
    profileUrl: contributor.profileUrl,
    ...getCurrentUserDatumFields(contributor.contributorName, currentUsername),
  };
}

export function groupCommentsByPost(
  data: CommentBubbleDatum[]
): CommentGroup[] {
  const groups = new Map<string, CommentGroup>();

  data.forEach((datum) => {
    const group = groups.get(datum.postId);

    if (group) {
      group.comments.push(datum);
      return;
    }

    groups.set(datum.postId, {
      postId: datum.postId,
      comments: [datum],
    });
  });

  return [...groups.values()].sort((a, b) => a.postId.localeCompare(b.postId));
}

export function getCommentGroupSeriesId(postId: string): string {
  return `comment-group-${postId}`;
}

export function getCurrentUserCommentRippleSeriesId(postId: string): string {
  return `current-user-comment-ripple-${postId}`;
}

export function isPostBubbleDatum(value: unknown): value is PostBubbleDatum {
  return hasDatumKind(value, 'post');
}

export function isCommentBubbleDatum(
  value: unknown
): value is CommentBubbleDatum {
  return hasDatumKind(value, 'comment');
}

export function isContributorBubbleDatum(
  value: unknown
): value is ContributorBubbleDatum {
  return hasDatumKind(value, 'contributor');
}

export function isSubredditKarmaBucket(
  value: unknown
): value is SubredditKarmaBucket | null {
  return (
    value === null ||
    (typeof value === 'number' &&
      Number.isInteger(value) &&
      value >= 0 &&
      value < SUBREDDIT_KARMA_BUCKET_COUNT)
  );
}

export function normalizeUsername(
  username: string | null | undefined
): string | null {
  if (typeof username !== 'string') {
    return null;
  }

  const normalizedUsername = username.trim().replace(/^u\//i, '').toLowerCase();

  return normalizedUsername === '' ? null : normalizedUsername;
}

export function getCurrentUserDatumFields(
  username: string,
  currentUsername: string | null
): CurrentUserDatumFields {
  const isCurrentUser =
    currentUsername !== null && normalizeUsername(username) === currentUsername;

  return { isCurrentUser };
}

function hasDatumKind<Kind extends 'post' | 'comment' | 'contributor'>(
  value: unknown,
  kind: Kind
): value is Extract<
  PostBubbleDatum | CommentBubbleDatum | ContributorBubbleDatum,
  { kind: Kind }
> {
  return Boolean(
    value &&
    typeof value === 'object' &&
    'kind' in value &&
    (value as { kind?: unknown }).kind === kind
  );
}
