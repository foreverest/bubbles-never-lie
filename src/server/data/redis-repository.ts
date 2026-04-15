import { redis } from '@devvit/web/server';
import type { EntityCodec } from './codecs';
import type { EntityRepository, TimeIndexedEntityRepository, TimeRange } from './types';

const REDIS_CHUNK_SIZE = 100;

export type RedisDataClient = Pick<
  typeof redis,
  'hGet' | 'hMGet' | 'hSet' | 'zAdd' | 'zRange'
>;

type RedisHashRepositoryOptions<Entity> = {
  redisClient?: RedisDataClient;
  hashKey: string;
  codec: EntityCodec<Entity>;
  getId(entity: Entity): string;
};

type RedisTimeIndexedRepositoryOptions<Entity> = RedisHashRepositoryOptions<Entity> & {
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
      }
    }
  };

  return {
    getById,
    getByIds,
    async upsert(entity) {
      await upsertMany([entity]);
    },
    upsertMany,
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
      }
    }
  };

  const getIdsInTimeRange = async ({
    startTime,
    endTime,
  }: TimeRange): Promise<string[]> => {
    const indexedEntities = await redisClient.zRange(indexKey, startTime, endTime, {
      by: 'score',
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
    getIdsInTimeRange,
    async getInTimeRange(range) {
      return await getByIds(await getIdsInTimeRange(range));
    },
    async countInTimeRange(range) {
      return (await getIdsInTimeRange(range)).length;
    },
  };
};

export const chunkItems = <Item>(items: Item[], size: number): Item[][] => {
  const chunks: Item[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
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
    throw new Error(`Unable to index entity ${getId(entity)}: invalid createdAt.`);
  }

  return score;
};
