import type { redis } from '@devvit/web/server';

export const DATA_RETENTION_TTL_SECONDS = 30 * 24 * 60 * 60;

type RedisRetentionClient = Pick<typeof redis, 'expire'>;

export const retainRedisKeys = async (
  redisClient: RedisRetentionClient,
  keys: string[]
): Promise<void> => {
  const uniqueKeys = [...new Set(keys.filter((key) => key.trim() !== ''))];

  if (uniqueKeys.length === 0) {
    return;
  }

  await Promise.all(
    uniqueKeys.map(async (key) => {
      await redisClient.expire(key, DATA_RETENTION_TTL_SECONDS);
    })
  );
};
