import type { AuthorEntity, CommentEntity, PostEntity } from './types';

export type EntityCodec<Entity> = {
  parse(value: string | null | undefined): Entity | null;
  serialize(entity: Entity): string;
};

export const postEntityCodec: EntityCodec<PostEntity> = {
  parse(value) {
    const parsed = parseJsonRecord(value);

    if (
      !parsed ||
      typeof parsed.id !== 'string' ||
      typeof parsed.title !== 'string' ||
      typeof parsed.authorName !== 'string' ||
      !isFiniteNumber(parsed.comments) ||
      !isFiniteNumber(parsed.score) ||
      !isValidDateString(parsed.createdAt) ||
      typeof parsed.permalink !== 'string'
    ) {
      return null;
    }

    return {
      id: parsed.id,
      title: parsed.title,
      authorName: parsed.authorName,
      comments: parsed.comments,
      score: parsed.score,
      createdAt: parsed.createdAt,
      permalink: parsed.permalink,
    };
  },
  serialize: JSON.stringify,
};

export const commentEntityCodec: EntityCodec<CommentEntity> = {
  parse(value) {
    const parsed = parseJsonRecord(value);

    if (
      !parsed ||
      typeof parsed.id !== 'string' ||
      typeof parsed.postId !== 'string' ||
      typeof parsed.authorName !== 'string' ||
      !isFiniteNumber(parsed.score) ||
      typeof parsed.bodyPreview !== 'string' ||
      !isValidDateString(parsed.createdAt) ||
      typeof parsed.permalink !== 'string'
    ) {
      return null;
    }

    return {
      id: parsed.id,
      postId: parsed.postId,
      authorName: parsed.authorName,
      score: parsed.score,
      bodyPreview: parsed.bodyPreview,
      createdAt: parsed.createdAt,
      permalink: parsed.permalink,
    };
  },
  serialize: JSON.stringify,
};

export const authorEntityCodec: EntityCodec<AuthorEntity> = {
  parse(value) {
    const parsed = parseJsonRecord(value);

    if (
      !parsed ||
      typeof parsed.id !== 'string' ||
      (parsed.avatarUrl !== null && typeof parsed.avatarUrl !== 'string') ||
      !isNullableFiniteNumber(parsed.subredditKarma) ||
      !isValidDateString(parsed.fetchedAt)
    ) {
      return null;
    }

    return {
      id: parsed.id,
      avatarUrl: parsed.avatarUrl,
      subredditKarma: parsed.subredditKarma,
      fetchedAt: parsed.fetchedAt,
    };
  },
  serialize: JSON.stringify,
};

const parseJsonRecord = (value: string | null | undefined): Record<string, unknown> | null => {
  if (value === null || value === undefined) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
};

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isNullableFiniteNumber = (value: unknown): value is number | null =>
  value === null || isFiniteNumber(value);

const isValidDateString = (value: unknown): value is string =>
  typeof value === 'string' && !Number.isNaN(Date.parse(value));
