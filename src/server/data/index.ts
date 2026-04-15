import {
  createAuthorRepository,
  createCommentRepository,
  createPostRepository,
} from './repositories';
import {
  createRelationHydrators,
  type RelationHydrators,
} from './relations';
import type { RedisDataClient } from './redis-repository';
import type {
  AuthorRepository,
  CommentRepository,
  PostRepository,
} from './types';

export type {
  AuthorEntity,
  AuthorRepository,
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
  createAuthorRepository,
  createCommentRepository,
  createPostRepository,
} from './repositories';
export { createRelationHydrators } from './relations';
export { getDataKeys } from './keys';

export type BubbleStatsDataLayer = RelationHydrators & {
  posts: PostRepository;
  comments: CommentRepository;
  authors: AuthorRepository;
};

export const createBubbleStatsDataLayer = (
  subredditName: string,
  redisClient?: RedisDataClient
): BubbleStatsDataLayer => {
  const posts = createPostRepository(subredditName, redisClient);
  const comments = createCommentRepository(subredditName, redisClient);
  const authors = createAuthorRepository(subredditName, redisClient);
  const hydrators = createRelationHydrators({ posts, authors });

  return {
    posts,
    comments,
    authors,
    ...hydrators,
  };
};
