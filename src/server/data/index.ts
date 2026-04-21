import {
  createCommentPostIndexRepository,
  createContributorRepository,
  createCommentRepository,
  createPostRepository,
} from './repositories';
import { createRelationHydrators, type RelationHydrators } from './relations';
import type { RedisDataClient } from './redis-repository';
import type {
  CommentPostIndexRepository,
  ContributorRepository,
  CommentRepository,
  PostRepository,
} from './types';

export type {
  CommentPostIndexRepository,
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
  createCommentPostIndexRepository,
  createContributorRepository,
  createCommentRepository,
  createPostRepository,
} from './repositories';
export { createRelationHydrators } from './relations';
export { getDataKeys } from './keys';
export { DATA_RETENTION_TTL_SECONDS, retainRedisKeys } from './retention';

export type DataLayer = RelationHydrators & {
  posts: PostRepository;
  comments: CommentRepository;
  contributors: ContributorRepository;
  commentPostIndex: CommentPostIndexRepository;
};

export const createDataLayer = (
  subredditName: string,
  redisClient?: RedisDataClient
): DataLayer => {
  const posts = createPostRepository(subredditName, redisClient);
  const comments = createCommentRepository(subredditName, redisClient);
  const contributors = createContributorRepository(subredditName, redisClient);
  const commentPostIndex = createCommentPostIndexRepository(
    subredditName,
    redisClient
  );
  const hydrators = createRelationHydrators({ posts, contributors });

  return {
    posts,
    comments,
    contributors,
    commentPostIndex,
    ...hydrators,
  };
};
