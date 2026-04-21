import { redis } from '@devvit/web/server';
import type { EntityCodec } from './codecs';
import { retainRedisKeys } from './retention';
import type {
  CommentPostIndexRepository,
  EntityRepository,
  TimeIndexedEntityRepository,
  TimeRange,
} from './types';

const REDIS_CHUNK_SIZE = 100;
const REDIS_RANGE_READ_CHUNK_SIZE = 1000;

export type RedisDataClient = Pick<
  typeof redis,
  'expire' | 'hDel' | 'hGet' | 'hMGet' | 'hSet' | 'zAdd' | 'zRange' | 'zRem'
>;

type RedisHashRepositoryOptions<Entity> = {
  redisClient?: RedisDataClient;
  hashKey: string;
  codec: EntityCodec<Entity>;
  getId(entity: Entity): string;
};

type RedisTimeIndexedRepositoryOptions<Entity> =
  RedisHashRepositoryOptions<Entity> & {
    indexKey: string;
    getCreatedAt(entity: Entity): string;
  };

export const createRedisHashRepository = <Entity>({
  redisClient = redis,
  hashKey,
  codec,
  getId,
}: RedisHashRepositoryOptions<Entity>): EntityRepository<Entity> => {
  const getById = async (id: string): Promise<Entity | null> =>
    codec.parse(await redisClient.hGet(hashKey, id));

  const getByIds = async (ids: string[]): Promise<Entity[]> => {
    const entities: Entity[] = [];

    for (const chunk of chunkItems(ids, REDIS_CHUNK_SIZE)) {
      const values = await redisClient.hMGet(hashKey, chunk);

      values.forEach((value) => {
        const entity = codec.parse(value);

        if (entity) {
          entities.push(entity);
        }
      });
    }

    return entities;
  };

  const upsertMany = async (entities: Entity[]): Promise<void> => {
    for (const chunk of chunkItems(entities, REDIS_CHUNK_SIZE)) {
      const fields = createEntityFields(chunk, getId, codec);

      if (Object.keys(fields).length > 0) {
        await redisClient.hSet(hashKey, fields);
        await retainRedisKeys(redisClient, [hashKey]);
      }
    }
  };

  const deleteMany = async (ids: string[]): Promise<void> => {
    if (ids.length === 0) {
      return;
    }

    for (const chunk of chunkItems(uniqueItems(ids), REDIS_CHUNK_SIZE)) {
      await redisClient.hDel(hashKey, chunk);
    }

    await retainRedisKeys(redisClient, [hashKey]);
  };

  return {
    getById,
    getByIds,
    async upsert(entity) {
      await upsertMany([entity]);
    },
    upsertMany,
    async delete(id) {
      await deleteMany([id]);
    },
    deleteMany,
  };
};

export const createRedisTimeIndexedRepository = <Entity>({
  redisClient = redis,
  hashKey,
  indexKey,
  codec,
  getId,
  getCreatedAt,
}: RedisTimeIndexedRepositoryOptions<Entity>): TimeIndexedEntityRepository<Entity> => {
  const getById = async (id: string): Promise<Entity | null> =>
    codec.parse(await redisClient.hGet(hashKey, id));

  const getByIds = async (ids: string[]): Promise<Entity[]> => {
    const entities: Entity[] = [];

    for (const chunk of chunkItems(ids, REDIS_CHUNK_SIZE)) {
      const values = await redisClient.hMGet(hashKey, chunk);

      values.forEach((value) => {
        const entity = codec.parse(value);

        if (entity) {
          entities.push(entity);
        }
      });
    }

    return entities;
  };

  const upsertMany = async (entities: Entity[]): Promise<void> => {
    for (const chunk of chunkItems(entities, REDIS_CHUNK_SIZE)) {
      const fields = createEntityFields(chunk, getId, codec);
      const indexMembers = chunk.map((entity) => ({
        member: getId(entity),
        score: readCreatedAtScore(entity, getId, getCreatedAt),
      }));

      if (Object.keys(fields).length > 0) {
        await Promise.all([
          redisClient.hSet(hashKey, fields),
          redisClient.zAdd(indexKey, ...indexMembers),
        ]);
        await retainRedisKeys(redisClient, [hashKey, indexKey]);
      }
    }
  };

  const deleteMany = async (ids: string[]): Promise<void> => {
    if (ids.length === 0) {
      return;
    }

    for (const chunk of chunkItems(uniqueItems(ids), REDIS_CHUNK_SIZE)) {
      await Promise.all([
        redisClient.hDel(hashKey, chunk),
        redisClient.zRem(indexKey, chunk),
      ]);
    }

    await retainRedisKeys(redisClient, [hashKey, indexKey]);
  };

  const getIdsInTimeRange = async ({
    startTime,
    endTime,
  }: TimeRange): Promise<string[]> => {
    const ids: string[] = [];
    let offset = 0;

    while (true) {
      const indexedEntities = await redisClient.zRange(
        indexKey,
        startTime,
        endTime,
        {
          by: 'score',
          limit: {
            offset,
            count: REDIS_RANGE_READ_CHUNK_SIZE,
          },
        }
      );

      ids.push(...indexedEntities.map((entity) => entity.member));

      if (indexedEntities.length < REDIS_RANGE_READ_CHUNK_SIZE) {
        break;
      }

      offset += indexedEntities.length;
    }

    return ids;
  };

  const getLatestIds = async (limit: number): Promise<string[]> => {
    if (limit <= 0) {
      return [];
    }

    const indexedEntities = await redisClient.zRange(indexKey, 0, limit - 1, {
      by: 'rank',
      reverse: true,
    });

    return indexedEntities.map((entity) => entity.member);
  };

  return {
    getById,
    getByIds,
    async upsert(entity) {
      await upsertMany([entity]);
    },
    upsertMany,
    async delete(id) {
      await deleteMany([id]);
    },
    deleteMany,
    getIdsInTimeRange,
    getLatestIds,
    async getInTimeRange(range) {
      return await getByIds(await getIdsInTimeRange(range));
    },
  };
};

export const createRedisCommentPostIndexRepository = ({
  redisClient = redis,
  hashKey,
  codec,
}: {
  redisClient?: RedisDataClient;
  hashKey: string;
  codec: EntityCodec<string[]>;
}): CommentPostIndexRepository => ({
  async getCommentIds(postId) {
    return codec.parse(await redisClient.hGet(hashKey, postId)) ?? [];
  },

  async addCommentIds(postId, commentIds) {
    const uniqueCommentIds = uniqueItems(commentIds);

    if (uniqueCommentIds.length === 0) {
      return;
    }

    const existingCommentIds =
      codec.parse(await redisClient.hGet(hashKey, postId)) ?? [];
    const nextCommentIds = uniqueItems([
      ...existingCommentIds,
      ...uniqueCommentIds,
    ]);

    await redisClient.hSet(hashKey, {
      [postId]: codec.serialize(nextCommentIds),
    });
    await retainRedisKeys(redisClient, [hashKey]);
  },

  async removeCommentIds(postId, commentIds) {
    const uniqueCommentIds = uniqueItems(commentIds);

    if (uniqueCommentIds.length === 0) {
      return;
    }

    const existingCommentIds =
      codec.parse(await redisClient.hGet(hashKey, postId)) ?? [];

    if (existingCommentIds.length === 0) {
      return;
    }

    const commentIdsToRemove = new Set(uniqueCommentIds);
    const remainingCommentIds = existingCommentIds.filter(
      (commentId) => !commentIdsToRemove.has(commentId)
    );

    if (remainingCommentIds.length === 0) {
      await redisClient.hDel(hashKey, [postId]);
    } else {
      await redisClient.hSet(hashKey, {
        [postId]: codec.serialize(remainingCommentIds),
      });
    }

    await retainRedisKeys(redisClient, [hashKey]);
  },

  async delete(postId) {
    await redisClient.hDel(hashKey, [postId]);
    await retainRedisKeys(redisClient, [hashKey]);
  },
});

export const chunkItems = <Item>(items: Item[], size: number): Item[][] => {
  const chunks: Item[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
};

const uniqueItems = <Item>(items: Item[]): Item[] => {
  const seen = new Set<Item>();
  const unique: Item[] = [];

  items.forEach((item) => {
    if (seen.has(item)) {
      return;
    }

    seen.add(item);
    unique.push(item);
  });

  return unique;
};

const createEntityFields = <Entity>(
  entities: Entity[],
  getId: (entity: Entity) => string,
  codec: EntityCodec<Entity>
): Record<string, string> => {
  const fields: Record<string, string> = {};

  entities.forEach((entity) => {
    fields[getId(entity)] = codec.serialize(entity);
  });

  return fields;
};

const readCreatedAtScore = <Entity>(
  entity: Entity,
  getId: (entity: Entity) => string,
  getCreatedAt: (entity: Entity) => string
): number => {
  const score = Date.parse(getCreatedAt(entity));

  if (!Number.isFinite(score)) {
    throw new Error(
      `Unable to index entity ${getId(entity)}: invalid createdAt.`
    );
  }

  return score;
};
