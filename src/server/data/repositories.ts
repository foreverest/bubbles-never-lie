import { authorEntityCodec, commentEntityCodec, postEntityCodec } from './codecs';
import { getDataKeys } from './keys';
import {
  createRedisHashRepository,
  createRedisTimeIndexedRepository,
  type RedisDataClient,
} from './redis-repository';
import type {
  AuthorRepository,
  CommentRepository,
  PostRepository,
} from './types';

export const createPostRepository = (
  subredditName: string,
  redisClient?: RedisDataClient
): PostRepository => {
  const keys = getDataKeys(subredditName);

  return createRedisTimeIndexedRepository({
    redisClient,
    hashKey: keys.posts,
    indexKey: keys.postCreatedAtIndex,
    codec: postEntityCodec,
    getId: (post) => post.id,
    getCreatedAt: (post) => post.createdAt,
  });
};

export const createCommentRepository = (
  subredditName: string,
  redisClient?: RedisDataClient
): CommentRepository => {
  const keys = getDataKeys(subredditName);

  return createRedisTimeIndexedRepository({
    redisClient,
    hashKey: keys.comments,
    indexKey: keys.commentCreatedAtIndex,
    codec: commentEntityCodec,
    getId: (comment) => comment.id,
    getCreatedAt: (comment) => comment.createdAt,
  });
};

export const createAuthorRepository = (
  subredditName: string,
  redisClient?: RedisDataClient
): AuthorRepository => {
  const keys = getDataKeys(subredditName);

  return createRedisHashRepository({
    redisClient,
    hashKey: keys.authors,
    codec: authorEntityCodec,
    getId: (author) => author.id,
  });
};
