import {
  createContributorRepository,
  createCommentRepository,
  createPostRepository,
} from './repositories';
import { createRelationHydrators, type RelationHydrators } from './relations';
import type { RedisDataClient } from './redis-repository';
import type { ContributorRepository, CommentRepository, PostRepository } from './types';

export type {
  ContributorEntity,
  ContributorRepository,
  CommentEntity,
  CommentRepository,
  EntityRepository,
  PostEntity,
  PostRepository,
  TimeIndexedEntityRepository,
  TimeRange,
} from './types';
export type {
  CommentRelationOptions,
  HydratedComment,
  HydratedPost,
  PostRelationOptions,
  RelationHydrators,
} from './relations';
export type { RedisDataClient } from './redis-repository';

export {
  createContributorRepository,
  createCommentRepository,
  createPostRepository,
} from './repositories';
export { createRelationHydrators } from './relations';
export { getDataKeys } from './keys';

export type BubbleStatsDataLayer = RelationHydrators & {
  posts: PostRepository;
  comments: CommentRepository;
  contributors: ContributorRepository;
};

export const createBubbleStatsDataLayer = (
  subredditName: string,
  redisClient?: RedisDataClient
): BubbleStatsDataLayer => {
  const posts = createPostRepository(subredditName, redisClient);
  const comments = createCommentRepository(subredditName, redisClient);
  const contributors = createContributorRepository(subredditName, redisClient);
  const hydrators = createRelationHydrators({ posts, contributors });

  return {
    posts,
    comments,
    contributors,
    ...hydrators,
  };
};
